import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

function baseDeps(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn() },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { emitNfse: vi.fn(), upsertCustomer: vi.fn(async () => ({ customerId: "cust1", created: true })) },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations,
    emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

const integration = {
  id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
  fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
  fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
};
const agentConfig: any = { id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] }, knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date() };

function inbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

describe("ConversationStateMachine — identidade/CPF", () => {
  it("CPF válido + nome bate → cria cliente e vai para AwaitingComprovante", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta", price: 300, issCode: "0107" }] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["ok"], action: { type: "reply" }, extracted: { fullName: "João da Silva", cpf: "529.982.247-25" } });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    conv.state = ConversationState.CollectingIdentity;
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25"));

    expect(deps.fiscal.upsertCustomer).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.AwaitingComprovante);
  });

  it("nome não bate 2x → handoff humano", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["?"], action: { type: "reply" }, extracted: { fullName: "Fulano Errado", cpf: "529.982.247-25" } });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    conv.state = ConversationState.CollectingIdentity;
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));
    expect(conv.state).toBe(ConversationState.CollectingIdentity); // 1ª falha: pede de novo
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));
    expect(conv.state).toBe(ConversationState.HumanHandoff); // 2ª falha
    expect(conv.humanHandoff).toBe(true);
  });

  it("identidade dada 'no meio da conversa' (estado New) valida na hora — não fica no 'Perfeito' seco", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [integration],
      services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta", price: 300, issCode: "0107" }],
    });
    const deps = baseDeps(repos);
    // cérebro em modo conversa, mas já extraiu nome+CPF da mensagem do cliente
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Perfeito!"],
      action: { type: "intent_emit" },
      extracted: { fullName: "João da Silva", cpf: "529.982.247-25" },
    });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    // conv começa em New (não seto CollectingIdentity de propósito)
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25"));

    expect(deps.fiscal.upsertCustomer).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.AwaitingComprovante);
  });

  it("grava a fala do Kaua no histórico (senão o cérebro perde contexto e não extrai)", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({
      reply: ["Me envie seu nome completo e CPF, por favor."],
      action: { type: "intent_emit" },
    });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    await sm.advance(conv, agentConfig, integration, inbound("oi, quero a nota"));

    const history = await repos.conversations.getHistory(conv.id, 20);
    const outbound = history.filter((m) => m.direction === "outbound");
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound[0]!.author).toBe("agent");
    expect(outbound[0]!.body).toContain("CPF");
  });
});
