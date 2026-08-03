import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { AgentContext } from "../../src/domain/ports/IAgentBrain";
import type { Charge } from "../../src/domain/entities/Charge";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * O cérebro recebe as cobranças em aberto DO CLIENTE?
 *
 * Falha real em produção (02/08): o paciente escreveu "gostaria de pagar uma
 * consulta que está em aberto" e a agente respondeu *"vou pedir para a equipe
 * confirmar o valor certinho"* — com a cobrança de R$ 2,00 daquele contato
 * gravada no banco. O contexto montado não trazia cobrança nenhuma.
 *
 * Estes testes olham o CONTEXTO entregue ao cérebro, não o texto da resposta:
 * a resposta é do modelo, o dado é nosso.
 */
function depsWith(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn().mockResolvedValue({ reply: ["ok"], action: { type: "reply" } }) },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn() },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles,
    charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

const integration = {
  id: "int1", companyId: "co1", displayName: "Consultório X", whatsappNumber: "5511999990000",
  fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
  fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
};
const agentConfig: any = {
  id: "ag1", integrationId: "int1", name: "Nina", segment: "saude", tone: "equilibrado", emojis: false, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function inbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

function charge(over: Partial<Charge>): Charge {
  const now = new Date();
  return {
    id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: null, description: "Consulta",
    amount: 2, status: "cobrada", calendarEventId: null, chargedAt: now, paidAt: null,
    scheduledFor: null, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null, notaEmitidaEm: null, createdAt: now, updatedAt: now, ...over,
  };
}

async function conversaCom(repos: InMemoryRepositories, charges: Charge[]) {
  repos.seed({
    integrations: [integration],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "Pietro Alkmin", cpf: null, cpfNameVerified: false, createdAt: new Date(), updatedAt: new Date() }],
  });
  for (const c of charges) await repos.charges.save(c);
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  return conv;
}

/** O contexto que a máquina entregou ao cérebro nesta chamada. */
function contextoEntregue(deps: StateMachineDeps): AgentContext {
  return (deps.brain.decide as ReturnType<typeof vi.fn>).mock.calls[0]![0] as AgentContext;
}

describe("ConversationStateMachine — cobranças em aberto no contexto do cérebro", () => {
  it("entrega a cobrança em aberto do contato (valor e se já foi enviada)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaCom(repos, [charge({ amount: 2, description: "Consulta" })]);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, inbound("quero pagar minha consulta em aberto"));

    expect(contextoEntregue(deps).openCharges).toEqual([{ description: "Consulta", amount: 2, enviada: true }]);
  });

  it("cobrança PAGA não entra (senão o agente cobraria de novo quem já pagou)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaCom(repos, [charge({ id: "ch-paga", status: "paga", paidAt: new Date() })]);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, inbound("oi"));

    expect(contextoEntregue(deps).openCharges).toEqual([]);
  });

  it("cobrança de OUTRO contato não vaza para esta conversa", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaCom(repos, [charge({ id: "ch-outro", contactId: "ct2", amount: 999 })]);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, inbound("oi"));

    expect(contextoEntregue(deps).openCharges).toEqual([]);
  });

  it("sem cobrança nenhuma → lista vazia, não quebra", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaCom(repos, []);

    await new ConversationStateMachine(deps).advance(conv, agentConfig, integration, inbound("bom dia"));

    expect(contextoEntregue(deps).openCharges).toEqual([]);
  });
});
