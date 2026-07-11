import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";
import type { AgentProposedAction } from "../../src/domain/ports/IAgentBrain";

const integration = { id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000", fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const agentConfig: any = { id: "ag1", integrationId: "int1", name: "Kaua", instructions: "", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() };

function depsWith(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: [], action: { type: "reply" as const } })) },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn(async () => ({ success: true, fiscalKey: "MOCK123", pdfUrl: "mock://nfse/MOCK123.pdf", message: null })) },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

function textInbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

function imageInbound(): InboundMessage {
  return { providerMessageId: "m2", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() };
}

/** Conversa em New (default do getOrCreate), com um serviço vinculado seedado. */
async function newConversation(repos: InMemoryRepositories) {
  repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Massagem", price: 180, issCode: "0107" }] });
  return repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
}

/** Conversa já em AwaitingComprovante, com contato verificado — molde do .emission.test.ts. */
async function awaitingComprovante(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Massagem", price: 180, issCode: "0107" }],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await repos.conversations.save(conv);
  return conv;
}

describe("ConversationStateMachine — conversa (des-engessado)", () => {
  it("estado New com quote_price responde e NÃO entra no funil nem emite", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["A Massagem custa R$180"], action: { type: "quote_price" } });
    const conv = await newConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("quanto custa a massagem?"));

    expect(deps.brain.decide).toHaveBeenCalledOnce();
    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "A Massagem custa R$180" }));
    expect(conv.state).toBe(ConversationState.New); // não entrou no funil
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    expect(deps.fiscal.upsertCustomer).not.toHaveBeenCalled();
  });

  it("estado Done (pós-emissão) responde em vez de 'Um momento, já te respondo'", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["De nada! 😊"], action: { type: "smalltalk" } });
    const conv = await newConversation(repos);
    conv.state = ConversationState.Done;
    await repos.conversations.save(conv);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("obrigado!"));

    expect(deps.brain.decide).toHaveBeenCalledOnce(); // foi pro cérebro, não pro default morto
    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "De nada! 😊" }));
    expect(deps.messaging.sendText).not.toHaveBeenCalledWith(expect.objectContaining({ text: "Um momento, já te respondo." }));
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
  });

  it("intent_emit em New → move para CollectingIdentity (pede identidade), sem emitir", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["Claro! Me manda seu nome completo e CPF"], action: { type: "intent_emit" } });
    const conv = await newConversation(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("quero a nota"));

    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Claro! Me manda seu nome completo e CPF" }));
    expect(conv.state).toBe(ConversationState.CollectingIdentity);
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    expect(deps.fiscal.upsertCustomer).not.toHaveBeenCalled();
  });

  it("INVARIANTE FISCAL: nenhuma action de conversa alcança emitNfse", async () => {
    const conversationActions: AgentProposedAction["type"][] = [
      "reply", "answer_question", "quote_price", "smalltalk", "provide_identity", "intent_emit",
    ];
    for (const type of conversationActions) {
      const repos = new InMemoryRepositories();
      const deps = depsWith(repos);
      // reply sem extracted → nenhum caminho eager de identidade; só conversa/roteamento
      (deps.brain.decide as any).mockResolvedValue({ reply: ["ok"], action: { type } });
      const conv = await newConversation(repos);
      const sm = new ConversationStateMachine(deps);

      await sm.advance(conv, agentConfig, integration, textInbound("..."));

      expect(deps.fiscal.emitNfse, `action ${type} não pode emitir`).not.toHaveBeenCalled();
    }
  });

  it("multi-tenant: usa integration.evolutionInstance no envio (sendText)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["oi"], action: { type: "reply" } });
    const tenantIntegration = { ...integration, evolutionInstance: "inst-x" };
    repos.seed({ integrations: [tenantIntegration] });
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, tenantIntegration, textInbound("oi"));

    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ instance: "inst-x" }));
  });

  it("multi-tenant: integration.evolutionInstance vazio → instance undefined (fallback global no provider)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["oi"], action: { type: "reply" } });
    const conv = await newConversation(repos); // integration base, sem evolutionInstance
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("oi"));

    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ instance: undefined }));
  });

  it("mídia em AwaitingComprovante vai pro gate B (handleComprovante), não pro brain", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    // gate B roda e reprova (recipient não bate) → handoff; o ponto é: analyze roda, brain NÃO.
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 999, payerName: "?", recipientDoc: "?", recipientMatches: false, confidence: 0.1, raw: "" });
    const conv = await awaitingComprovante(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, imageInbound());

    expect(deps.comprovante.analyze).toHaveBeenCalledOnce();
    expect(deps.brain.decide).not.toHaveBeenCalled();
  });
});
