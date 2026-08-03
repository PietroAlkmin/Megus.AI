import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { Charge } from "../../src/domain/entities/Charge";
import type { ComprovanteAnalysis } from "../../src/domain/ports/IComprovanteAnalyzer";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * O MESMO comprovante não pode quitar duas cobranças.
 *
 * Buraco real, levantado pelo Pietro em 02/08: com duas cobranças de igual valor
 * em aberto, valor + recebedor + chave Pix são idênticos nas duas — nada no
 * comprovante dizia de qual ele era. Reenviar o mesmo print quitava as duas e a
 * clínica via R$ 400 recebidos tendo recebido R$ 200. Nem exige má-fé: paciente
 * reenviando "pra garantir" produz o mesmo estrago.
 *
 * A trava é o ID da transação (E2E do Pix). Quando o comprovante não mostra o
 * ID, a conferência segue como antes — decisão do Pietro: recusar todo print sem
 * ID criaria atrito com paciente honesto, e hoje não há proteção nenhuma.
 */
const integration = {
  id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000",
  fiscalDoc: "28756515000135", fiscalName: "Clínica Ltda", fiscalProviderRef: null,
  active: true, createdAt: new Date(), updatedAt: new Date(),
};

/** Renata: sem emissão fiscal — o gate exige chave Pix batendo. */
const agentConfig: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: false, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function analise(over: Partial<ComprovanteAnalysis> = {}): ComprovanteAnalysis {
  return {
    amount: 200, payerName: "Pietro Alkmin", recipientDoc: "28756515000135", recipientMatches: true,
    recipientPixKey: "28756515000135", pixKeyMatches: true, transactionId: "E12345678202608021530ABCDEF",
    confidence: 0.95, raw: "{}", ...over,
  };
}

/** `bytes` distingue um ARQUIVO de outro: pagamento novo = comprovante novo. */
function comprovante(bytes = "print-do-pagamento-1"): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: bytes }, timestamp: new Date() };
}

function charge(over: Partial<Charge>): Charge {
  const now = new Date();
  return {
    id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: null, description: "Consulta",
    amount: 200, status: "cobrada", calendarEventId: null, chargedAt: now, paidAt: null,
    scheduledFor: null, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null, notaEmitidaEm: null,
    createdAt: now, updatedAt: now, ...over,
  };
}

function depsWith(repos: InMemoryRepositories, analysis: ComprovanteAnalysis): StateMachineDeps {
  return {
    brain: { decide: vi.fn() },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn(async () => analysis) },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn() },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions,
    services: repos.services, companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8, comprovanteMaxAttempts: 2 },
  };
}

/** Duas cobranças de MESMO valor em aberto — o cenário que abre o buraco. */
async function cenarioDuasIguais(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "Pietro Alkmin", cpf: null, cpfNameVerified: false, ficha: {}, createdAt: new Date(), updatedAt: new Date() }],
  });
  await repos.companyProfiles.save({
    companyId: "c1", name: "Clínica", fiscalName: "Clínica Ltda", fiscalDoc: "28756515000135",
    municipalRegistration: "", email: "", phone: "", zip: "", address: "", city: "", state: "",
    pixType: "cnpj", pixKey: "28756515000135", paymentInstructions: "", updatedAt: new Date(),
  });
  await repos.charges.save(charge({ id: "ch-antiga", createdAt: new Date(2026, 7, 1) }));
  await repos.charges.save(charge({ id: "ch-nova", createdAt: new Date(2026, 7, 2) }));
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await repos.conversations.save(conv);
  return conv;
}

describe("gate B — o mesmo comprovante não quita duas cobranças", () => {
  it("1º envio quita e GRAVA o pagamento (id da transação + quem pagou)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, analise());
    const conv = await cenarioDuasIguais(repos);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, comprovante());

    // Empate de valor → quita a MAIS ANTIGA (dívida mais velha primeiro).
    const antiga = await repos.charges.getById("ch-antiga");
    expect(antiga?.status).toBe("paga");
    expect(antiga?.paymentRef).toBe("E12345678202608021530ABCDEF");
    expect(antiga?.paidBy).toBe("Pietro Alkmin");
    expect((await repos.charges.getById("ch-nova"))?.status).toBe("cobrada");
  });

  it("MESMO comprovante de novo → recusado, a segunda cobrança segue em aberto", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, analise());
    const conv = await cenarioDuasIguais(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, comprovante());
    // Reenvio: o paciente manda o mesmo print (confusão ou má-fé).
    conv.state = ConversationState.AwaitingComprovante;
    await repos.conversations.save(conv);
    await sm.advance(conv, agentConfig, integration, comprovante());

    expect((await repos.charges.getById("ch-nova"))?.status).toBe("cobrada");
    expect((await repos.charges.getById("ch-nova"))?.paidAt).toBeNull();
    const ditas = (deps.messaging.sendText as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].text).join(" | ");
    expect(ditas).toContain("já foi usado");
  });

  /**
   * O caso que ESCAPOU em produção (03/08).
   *
   * A visão leu o MESMO print de dois jeitos — `E30306294...0023MPK4` (32 chars)
   * e `E30306294...023MPK4` (31, um zero a menos) — e como as chaves diferiam, o
   * reenvio quitou uma segunda cobrança. Leitura é OCR: não é determinística.
   * O hash dos bytes não depende de leitura nenhuma.
   */
  it("MESMA imagem com o ID lido DIFERENTE (falha de OCR) ainda é recusada", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, analise({ transactionId: "E303062942026080300470000023MPK4" }));
    const conv = await cenarioDuasIguais(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, comprovante());
    // Mesmo arquivo, mas a visão engoliu um caractere na segunda leitura.
    (deps.comprovante.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(
      analise({ transactionId: "E30306294202608030047000023MPK4" }),
    );
    conv.state = ConversationState.AwaitingComprovante;
    await repos.conversations.save(conv);
    await sm.advance(conv, agentConfig, integration, comprovante());

    expect((await repos.charges.getById("ch-nova"))?.status).toBe("cobrada");
    const ditas = (deps.messaging.sendText as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].text).join(" | ");
    expect(ditas).toContain("já foi usado");
  });

  it("pagamento NOVO (outro id) quita a segunda normalmente", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, analise());
    const conv = await cenarioDuasIguais(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, comprovante());
    // Segundo pagamento de verdade: mesmo valor, ID e ARQUIVO diferentes.
    (deps.comprovante.analyze as ReturnType<typeof vi.fn>).mockResolvedValue(analise({ transactionId: "E99999999202608021600ZZZZZZ" }));
    conv.state = ConversationState.AwaitingComprovante;
    await repos.conversations.save(conv);
    await sm.advance(conv, agentConfig, integration, comprovante("print-do-pagamento-2"));

    expect((await repos.charges.getById("ch-nova"))?.status).toBe("paga");
    expect((await repos.charges.getById("ch-nova"))?.paymentRef).toBe("E99999999202608021600ZZZZZZ");
  });

  it("sem id legível: confirma como antes (decisão de produto — nada de travar paciente honesto)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, analise({ transactionId: null }));
    const conv = await cenarioDuasIguais(repos);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, comprovante());

    const antiga = await repos.charges.getById("ch-antiga");
    expect(antiga?.status).toBe("paga");
    expect(antiga?.paymentRef).toBeNull(); // sem trava, e o registro não mente dizendo que tem
  });

  it("insistir no comprovante repetido chama humano (não fica em loop)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, analise());
    const conv = await cenarioDuasIguais(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, comprovante());
    for (let i = 0; i < 2; i++) {
      conv.state = ConversationState.AwaitingComprovante;
      await repos.conversations.save(conv);
      await sm.advance(conv, agentConfig, integration, comprovante());
    }

    const atual = await repos.conversations.getById(conv.id);
    expect(atual?.humanHandoff).toBe(true);
  });
});
