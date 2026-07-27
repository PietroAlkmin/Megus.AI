import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

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
    charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

function imageInbound(): InboundMessage {
  return { providerMessageId: "m2", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() };
}

async function readyConversation(repos: InMemoryRepositories) {
  repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta médica", price: 300, issCode: "0107" }], contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }] });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await repos.conversations.save(conv);
  return conv;
}

describe("ConversationStateMachine — comprovante/emissão", () => {
  it("comprovante confere → emite NFS-e (mock) e envia o PDF", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    const conv = await readyConversation(repos);
    const sm = new ConversationStateMachine(deps);
    await sm.advance(conv, agentConfig, integration, imageInbound());

    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce();
    expect(deps.messaging.sendMedia).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("baixa confiança → NÃO emite; pede reenvio no 1º e chama humano ao esgotar o teto", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "?", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.4, raw: "" });
    const conv = await readyConversation(repos);
    const sm = new ConversationStateMachine(deps);

    // 1ª rejeição: mensagem honesta, segue aguardando (o cliente pode ter mandado a foto errada)
    await sm.advance(conv, agentConfig, integration, imageInbound());
    expect(conv.state).toBe(ConversationState.AwaitingComprovante);
    expect(conv.humanHandoff).toBe(false);
    const bolhas = (deps.messaging.sendText as any).mock.calls.map((c: any) => c[0].text as string).join(" ");
    expect(bolhas).toContain("não conferem com a cobrança");

    // 2ª rejeição: esgotou o teto → humano assume (nunca fica em loop eterno)
    await sm.advance(conv, agentConfig, integration, imageInbound());
    expect(conv.state).toBe(ConversationState.HumanHandoff);
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
  });

  it("comprovante ruim seguido de comprovante bom → emite (o contador não pune quem corrigiu)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await readyConversation(repos);
    const sm = new ConversationStateMachine(deps);

    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "?", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.4, raw: "" });
    await sm.advance(conv, agentConfig, integration, imageInbound());
    expect(conv.state).toBe(ConversationState.AwaitingComprovante);

    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    await sm.advance(conv, agentConfig, integration, imageInbound());

    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
  });
});
