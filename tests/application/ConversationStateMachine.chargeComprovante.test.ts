import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * Costura Cobrar→comprovante (Issue 1 do review final do Plano 7): depois de uma
 * cobrança, a conversa está em estado LIVRE (New) — o comprovante precisa chegar
 * ao gate B mesmo assim. Regra: mídia + contato verificado + cobrança em aberto
 * → gate B (extensão da "regra dura" de mídia; os gates em si não mudam).
 */

const integration = { id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "11222333000181", fiscalName: "Clínica Alfa Ltda", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const agentConfig: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: true, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function mediaInbound(): InboundMessage {
  return { providerMessageId: "m-media", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "xxx" }, timestamp: new Date() };
}

async function seedVerifiedWithCharge(repos: InMemoryRepositories, opts: { charge: boolean } = { charge: true }) {
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "01", description: "Massagem", price: 180, issCode: "01" }],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.New; // estado LIVRE — o ponto do bug
  await repos.conversations.save(conv);
  if (opts.charge) {
    await repos.charges.save({
      id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: "svc1", description: "Massagem", amount: 180,
      status: "cobrada", calendarEventId: "evt-1", chargedAt: new Date(), paidAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
  }
  return conv;
}

function depsWith(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: ["oi!"], action: { type: "reply" as const } })) },
    cpf: { lookupName: vi.fn(async () => ({ found: true, name: "João da Silva" })) },
    comprovante: { analyze: vi.fn(async () => ({ amount: 180, recipientMatches: true, confidence: 1, payerName: "João" })) },
    fiscal: { upsertCustomer: vi.fn(async () => {}), emitNfse: vi.fn(async () => ({ success: true, fiscalKey: "key-1", pdfUrl: "http://x/nota.pdf", message: null })) },
    messaging: { start: vi.fn(), getConnectionStatus: vi.fn(() => "connected" as const), getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(async () => {}), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services,
    companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  } as unknown as StateMachineDeps;
}

describe("costura Cobrar→comprovante: mídia em estado livre com cobrança em aberto vai pro gate B", () => {
  it("comprovante em estado New + cobrança 'cobrada' → gate B roda: emite nota e quita a cobrança", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seedVerifiedWithCharge(repos);
    const deps = depsWith(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).toHaveBeenCalledOnce(); // gate B rodou
    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce(); // nota emitida
    expect(deps.brain.decide).not.toHaveBeenCalled(); // NÃO caiu no papo comum
    const charge = await repos.charges.getById("ch1");
    expect(charge?.status).toBe("paga"); // gate B quitou
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("mídia em New SEM cobrança em aberto → papo comum (nada de gate B)", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seedVerifiedWithCharge(repos, { charge: false });
    const deps = depsWith(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).not.toHaveBeenCalled();
    expect(deps.brain.decide).toHaveBeenCalledOnce();
  });

  it("TEXTO em New com cobrança em aberto → papo comum (sem railroading: só mídia aciona o gate)", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seedVerifiedWithCharge(repos);
    const deps = depsWith(repos);
    const sm = new ConversationStateMachine(deps);

    const textInbound: InboundMessage = { providerMessageId: "m-t", from: "5511988887777", to: "5511999990000", kind: "text", text: "ok, vou pagar amanhã", media: null, timestamp: new Date() };
    await sm.advance(conv, agentConfig, integration, textInbound);

    expect(deps.comprovante.analyze).not.toHaveBeenCalled();
    expect(deps.brain.decide).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.New); // conversa segue livre
  });

  it("mídia com cobrança mas contato NÃO verificado → papo comum (gate B pressupõe identidade)", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seedVerifiedWithCharge(repos);
    const contact = await repos.contacts.findByWhatsapp("int1", "5511988887777");
    await repos.contacts.save({ ...contact!, cpfNameVerified: false, updatedAt: new Date() });
    const deps = depsWith(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).not.toHaveBeenCalled();
    expect(deps.brain.decide).toHaveBeenCalledOnce();
  });

  it("estados fiscais seguem intocados: mídia em AwaitingComprovante vai pro gate B como sempre (sem consultar charges)", async () => {
    const repos = new InMemoryRepositories();
    const conv = await seedVerifiedWithCharge(repos, { charge: false });
    conv.state = ConversationState.AwaitingComprovante;
    await repos.conversations.save(conv);
    const deps = depsWith(repos);
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).toHaveBeenCalledOnce(); // rota fiscal original
  });
});
