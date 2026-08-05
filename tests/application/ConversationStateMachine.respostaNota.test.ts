import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { Charge } from "../../src/domain/entities/Charge";
import type { ComprovanteAnalysis } from "../../src/domain/ports/IComprovanteAnalyzer";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * A resposta sobre NOTA FISCAL vem antes do pagamento — e precisa ser gravada.
 *
 * Com duas contas, é essa resposta que decide para onde o dinheiro vai, então o
 * agente pergunta ANTES de mandar a chave. Só que não havia onde gravá-la: o
 * agente dizia "já registrei" (fala do modelo, não ato do sistema) e o campo
 * seguia vazio. Visto ao vivo (05/08): o paciente respondeu "vou precisar sim"
 * às 22:33 e ouviu a MESMA pergunta às 22:34, depois de pagar.
 */
const integration = {
  id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000",
  fiscalDoc: "28756515000135", fiscalName: "Clínica Ltda", fiscalProviderRef: null,
  active: true, createdAt: new Date(), updatedAt: new Date(),
};

const agentConfig: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: false, lang: "pt",
  instructions: "", capabilities: { agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function charge(over: Partial<Charge> = {}): Charge {
  const now = new Date();
  return {
    id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: null, description: "Consulta",
    amount: 0.1, status: "cobrada", calendarEventId: null, chargedAt: now, paidAt: null,
    scheduledFor: null, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null,
    notaEmitidaEm: null, createdAt: now, updatedAt: now, ...over,
  };
}

function depsWith(repos: InMemoryRepositories, extracted?: Record<string, unknown>): StateMachineDeps {
  const analysis: ComprovanteAnalysis = {
    amount: 0.1, payerName: "Pietro", recipientDoc: "28756515000135", recipientMatches: true,
    recipientPixKey: "28756515000135", pixKeyMatches: true, transactionId: "E111", confidence: 0.95, raw: "{}",
  };
  return {
    brain: { decide: vi.fn(async () => ({ reply: ["ok"], action: { type: "reply" as const }, ...(extracted ? { extracted } : {}) })) },
    cpf: { lookupName: vi.fn(async () => ({ found: false, name: null })) },
    comprovante: { analyze: vi.fn(async () => analysis) },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn() },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions,
    services: repos.services, companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

const texto = (t: string): InboundMessage =>
  ({ providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text: t, media: null, timestamp: new Date() });
const comprovante = (): InboundMessage =>
  ({ providerMessageId: "m2", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "print" }, timestamp: new Date() });

async function cenario(repos: InMemoryRepositories, charges: Charge[], estado = ConversationState.New) {
  repos.seed({
    integrations: [integration],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "Pietro", cpf: null, cpfNameVerified: false, ficha: {}, createdAt: new Date(), updatedAt: new Date() }],
  });
  await repos.companyProfiles.save({
    companyId: "c1", name: "Clínica", fiscalName: "Clínica Ltda", fiscalDoc: "28756515000135",
    municipalRegistration: "", email: "", phone: "", zip: "", address: "", city: "", state: "",
    pixType: "cnpj", pixKey: "28756515000135", pixDescricao: "", pixTypeNota: "", pixKeyNota: "", pixDescricaoNota: "",
    paymentInstructions: "", updatedAt: new Date(),
  });
  for (const c of charges) await repos.charges.save(c);
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = estado;
  await repos.conversations.save(conv);
  return conv;
}

const ditas = (deps: StateMachineDeps) =>
  (deps.messaging.sendText as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].text).join(" | ");

describe("resposta sobre nota fiscal", () => {
  it("responder ANTES do pagamento grava na cobrança", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { precisaNota: true, fullName: "Pietro Mota Alkmin" });
    const conv = await cenario(repos, [charge()]);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("Vou precisar sim!"));

    expect((await repos.charges.getById("ch1"))?.notaSolicitada).toBe(true);
  });

  it("vale para TODAS as cobranças em aberto — a semana pode ter várias sessões", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { precisaNota: true });
    const conv = await cenario(repos, [charge({ id: "ch1" }), charge({ id: "ch2" }), charge({ id: "ch3" })]);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("vou precisar"));

    for (const id of ["ch1", "ch2", "ch3"]) {
      expect((await repos.charges.getById(id))?.notaSolicitada).toBe(true);
    }
  });

  it("quem já respondeu NÃO é perguntado de novo depois de pagar", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await cenario(repos, [charge({ notaSolicitada: true })], ConversationState.AwaitingComprovante);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, comprovante());

    expect(ditas(deps)).toContain("Pagamento confirmado");
    expect(ditas(deps)).not.toContain("Você vai precisar de nota fiscal");
    expect((await repos.conversations.getById(conv.id))?.state).toBe(ConversationState.Done);
  });

  it("quem NÃO respondeu ainda continua sendo perguntado", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await cenario(repos, [charge({ notaSolicitada: null })], ConversationState.AwaitingComprovante);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, comprovante());

    expect(ditas(deps)).toContain("Você vai precisar de nota fiscal");
    expect((await repos.conversations.getById(conv.id))?.state).toBe(ConversationState.AwaitingNotaAnswer);
  });

  it("sem resposta clara do cliente, nada é gravado (não chuta)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos, { fullName: "Pietro" }); // sem precisaNota
    const conv = await cenario(repos, [charge()]);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, texto("bom dia"));

    expect((await repos.charges.getById("ch1"))?.notaSolicitada).toBeNull();
  });
});
