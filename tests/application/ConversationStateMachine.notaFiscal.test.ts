import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * Clínica SEM emissão fiscal (caso da 1ª cliente): quem emite a nota é ela, no
 * sistema dela. Depois do pagamento confirmado o agente pergunta se o cliente
 * quer nota e REGISTRA a resposta — é recado pra clínica, não gatilho de sistema.
 */

const integration = { id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "11222333000181", fiscalName: "Clínica Alfa Ltda", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const semFiscal: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

const FROM = "5511988887777";
const imagem = (): InboundMessage => ({ providerMessageId: "im", from: FROM, to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "x" }, timestamp: new Date() });
const texto = (t: string): InboundMessage => ({ providerMessageId: "t", from: FROM, to: "5511999990000", kind: "text", text: t, media: null, timestamp: new Date() });

async function seed(repos: InMemoryRepositories) {
  const now = new Date();
  repos.seed({ integrations: [integration], services: [] });
  await repos.contacts.save({ id: "ct1", integrationId: "int1", whatsappNumber: FROM, fullName: "João da Silva", cpf: null, cpfNameVerified: false, ficha: {}, createdAt: now, updatedAt: now });
  await repos.charges.save({ id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: null, description: "Consulta", amount: 200, status: "cobrada", calendarEventId: "evt-1", chargedAt: now, paidAt: null, scheduledFor: null, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null, notaEmitidaEm: null, createdAt: now, updatedAt: now });
  await repos.companyProfiles.save({ companyId: "c1", name: "Clínica Alfa", fiscalName: "Clínica Alfa Ltda", fiscalDoc: "11222333000181", municipalRegistration: "", email: "", phone: "", zip: "", address: "", city: "", state: "", pixType: "cnpj", pixKey: "11222333000181", paymentInstructions: "", updatedAt: now });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", FROM);
  conv.contactId = "ct1";
  await repos.conversations.save(conv);
  return conv;
}

function deps(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: ["oi"], action: { type: "reply" as const } })) },
    cpf: { lookupName: vi.fn(async () => ({ found: false, name: null })) },
    comprovante: { analyze: vi.fn(async () => ({ amount: 200, payerName: "João", recipientDoc: "11222333000181", recipientMatches: true, pixKeyMatches: true, confidence: 1, raw: "" })) },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn() },
    messaging: { start: vi.fn(), getConnectionStatus: vi.fn(() => "connected" as const), getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(async () => {}), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services,
    companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  } as unknown as StateMachineDeps;
}

const bolhas = (d: StateMachineDeps): string =>
  (d.messaging.sendText as any).mock.calls.map((c: any) => c[0].text as string).join(" ");

describe("nota fiscal: pergunta depois do pagamento (clínica sem emissão)", () => {
  it("comprovante confere → quita, PERGUNTA sobre nota e fica aguardando a resposta", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);

    await sm.advance(conv, semFiscal, integration, imagem());

    expect((await repos.charges.getById("ch1"))?.status).toBe("paga");
    expect(d.fiscal.emitNfse).not.toHaveBeenCalled(); // nunca emite neste fluxo
    expect(bolhas(d)).toContain("nota fiscal");
    expect(conv.state).toBe(ConversationState.AwaitingNotaAnswer);
  });

  it("cliente responde SIM → registra na cobrança e encerra", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    await sm.advance(conv, semFiscal, integration, imagem());

    await sm.advance(conv, semFiscal, integration, texto("sim, vou precisar"));

    expect((await repos.charges.getById("ch1"))?.notaSolicitada).toBe(true);
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("cliente responde NÃO → registra false (não fica pendente na lista da clínica)", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    await sm.advance(conv, semFiscal, integration, imagem());

    await sm.advance(conv, semFiscal, integration, texto("não precisa, obrigado"));

    expect((await repos.charges.getById("ch1"))?.notaSolicitada).toBe(false);
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("resposta ambígua → re-pergunta e NÃO chuta (registrar errado gera trabalho pra clínica)", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    await sm.advance(conv, semFiscal, integration, imagem());

    await sm.advance(conv, semFiscal, integration, texto("hmm deixa eu ver com meu contador"));

    expect((await repos.charges.getById("ch1"))?.notaSolicitada).toBeNull();
    expect(conv.state).toBe(ConversationState.AwaitingNotaAnswer); // continua aguardando
    expect(bolhas(d)).toContain("sim ou não");
  });

  it("o pagamento JÁ está quitado antes da resposta — nada nesta etapa desfaz isso", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    await sm.advance(conv, semFiscal, integration, imagem());

    await sm.advance(conv, semFiscal, integration, texto("???"));

    expect((await repos.charges.getById("ch1"))?.status).toBe("paga");
    expect((await repos.charges.getById("ch1"))?.paidAt).not.toBeNull();
  });
});
