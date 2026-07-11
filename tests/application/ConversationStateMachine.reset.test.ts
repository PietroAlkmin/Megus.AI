import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
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
    comprovante: { analyze: vi.fn(async () => ({ recipientMatches: false, amount: null, confidence: 0, payerName: null, recipientDoc: null, raw: "" })) },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn(async () => ({ success: true, fiscalKey: "MOCK123", pdfUrl: "mock://nfse/MOCK123.pdf", message: null })) },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles,
    charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

function textInbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

/** Conversa EMPACADA: AwaitingComprovante + contato verificado + histórico + rascunho de emissão. */
async function conversaEmpacada(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Massagem", price: 180, issCode: "0107" }],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await repos.conversations.save(conv);

  for (const [autor, body] of [["contact", "olá"], ["agent", "Me envia o comprovante"], ["contact", "não tenho"]] as const) {
    await repos.conversations.appendMessage({ id: randomUUID(), conversationId: conv.id, direction: autor === "contact" ? "inbound" : "outbound", author: autor, kind: "text", body, mediaUrl: null, createdAt: new Date() });
  }

  const base = { conversationId: conv.id, contactId: "ct1", integrationId: "int1", tomadorName: "João da Silva", tomadorCpf: "52998224725", serviceId: "svc1", description: "Massagem", amount: 180, paymentVerified: false, paymentConfidence: 0, fiscalKey: null, pdfUrl: null, createdAt: new Date(), updatedAt: new Date() };
  await repos.emissions.save({ ...base, id: "em-draft", status: "draft" });
  await repos.emissions.save({ ...base, id: "em-emitted", status: "emitted", fiscalKey: "K9", pdfUrl: "http://x/n.pdf" });
  return conv;
}

describe("ConversationStateMachine — /reset (comando de teste)", () => {
  it("destrava conversa presa em AwaitingComprovante: zera histórico, estado, identidade e rascunhos — preserva a nota emitida", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaEmpacada(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("/reset"));

    expect(conv.state).toBe(ConversationState.New);
    expect(conv.humanHandoff).toBe(false);

    // histórico antigo apagado; sobra só a confirmação do reset (outbound)
    const hist = await repos.conversations.getHistory(conv.id, 20);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.author).toBe("agent");
    expect(hist[0]!.body).toContain("resetada");

    // identidade esquecida — o fluxo volta a coletar nome+CPF
    const contato = await repos.contacts.findByWhatsapp("int1", "5511988887777");
    expect(contato?.fullName).toBeNull();
    expect(contato?.cpf).toBeNull();
    expect(contato?.cpfNameVerified).toBe(false);

    // rascunho descartado; registro fiscal intacto
    expect(await repos.emissions.getById("em-draft")).toBeNull();
    expect((await repos.emissions.getById("em-emitted"))?.status).toBe("emitted");

    // nada de cérebro nem fiscal no reset
    expect(deps.brain.decide).not.toHaveBeenCalled();
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    expect(deps.fiscal.upsertCustomer).not.toHaveBeenCalled();
    expect(deps.messaging.sendText).toHaveBeenCalledOnce();
  });

  it("funciona MESMO em humanHandoff (bot calado) — é o destravador de teste", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaEmpacada(repos);
    conv.humanHandoff = true;
    conv.state = ConversationState.HumanHandoff;
    await repos.conversations.save(conv);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("/reset"));

    expect(conv.state).toBe(ConversationState.New);
    expect(conv.humanHandoff).toBe(false);
    expect(deps.messaging.sendText).toHaveBeenCalledOnce(); // o bot voltou a falar
  });

  it("aceita variações de caixa e espaços ('  /RESET  ')", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaEmpacada(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("  /RESET  "));

    expect(conv.state).toBe(ConversationState.New);
  });

  it("texto normal NÃO reseta — continua no fluxo do estado (pede comprovante)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaEmpacada(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, textInbound("oi, tudo bem?"));

    expect(conv.state).toBe(ConversationState.AwaitingComprovante);
    expect((await repos.conversations.getHistory(conv.id, 20)).length).toBeGreaterThan(3); // histórico preservado (+resposta)
    expect(await repos.emissions.getById("em-draft")).not.toBeNull();
    expect(deps.messaging.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining("comprovante") }));
  });

  it("mídia com legenda '/reset' NÃO reseta — segue pro gate fiscal (regra de mídia intocada)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    const conv = await conversaEmpacada(repos);
    const sm = new ConversationStateMachine(deps);

    const media: InboundMessage = { providerMessageId: "m9", from: "5511988887777", to: "5511999990000", kind: "image", text: "/reset", media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() };
    await sm.advance(conv, agentConfig, integration, media);

    expect(deps.comprovante.analyze).toHaveBeenCalledOnce(); // foi pro gate B
    expect(conv.state).not.toBe(ConversationState.New); // não resetou
    expect((await repos.conversations.getHistory(conv.id, 20)).length).toBeGreaterThanOrEqual(3);
  });
});
