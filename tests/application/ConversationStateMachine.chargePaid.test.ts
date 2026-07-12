import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";
import type { Charge } from "../../src/domain/entities/Charge";

// Molde igual aos outros arquivos ConversationStateMachine.*.test.ts (mesmos
// fixtures de integration/agentConfig/readyConversation do
// ConversationStateMachine.emission.test.ts) — Task 4, gate B quita a Charge.
const integration = {
  id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
  fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
  fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
};
const agentConfig: any = {
  id: "ag1", integrationId: "int1", name: "Kaua", instructions: "",
  capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"], agenda: false, agendaLink: null },
  knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
  createdAt: new Date(), updatedAt: new Date(),
};

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
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta médica", price: 300, issCode: "0107" }],
    contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }],
  });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await repos.conversations.save(conv);
  return conv;
}

function makeCharge(overrides: Partial<Charge> = {}): Charge {
  const now = new Date();
  return {
    id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: "svc1",
    description: "Consulta médica", amount: 300, status: "cobrada",
    calendarEventId: null, chargedAt: now, paidAt: null, createdAt: now, updatedAt: now,
    ...overrides,
  };
}

describe("ConversationStateMachine — gate B quita a Charge do contato (Task 4)", () => {
  it("comprovante confere + emissão OK -> Charge cobrável do contato vira paga (paidAt setado)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    const conv = await readyConversation(repos);
    await repos.charges.save(makeCharge());
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, imageInbound());

    const charge = await repos.charges.getById("ch1");
    expect(charge?.status).toBe("paga");
    expect(charge?.paidAt).not.toBeNull();
    // a emissão em si segue intocada (fluxo já coberto em ConversationStateMachine.emission.test.ts) —
    // só confirmamos aqui que o efeito novo NÃO substitui o efeito antigo.
    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("sem nenhuma Charge cobrável do contato -> não lança, emissão segue normal (nada pra quitar)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    const conv = await readyConversation(repos); // sem seed de Charge nenhuma

    const sm = new ConversationStateMachine(deps);
    await expect(sm.advance(conv, agentConfig, integration, imageInbound())).resolves.not.toThrow();

    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("charges.save lança ao tentar quitar -> não-fatal (warn), nota/estado seguem normalmente", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    const conv = await readyConversation(repos);
    await repos.charges.save(makeCharge());
    const saveSpy = vi.spyOn(repos.charges, "save").mockRejectedValueOnce(new Error("db fora do ar"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sm = new ConversationStateMachine(deps);

    await expect(sm.advance(conv, agentConfig, integration, imageInbound())).resolves.not.toThrow();

    expect(deps.messaging.sendMedia).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
    expect(warnSpy).toHaveBeenCalled();
    saveSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("emissão FALHA (fiscal recusa) -> handoff; Charge permanece intocada (gate B não roda)", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    (deps.fiscal.emitNfse as any).mockResolvedValue({ success: false, fiscalKey: null, pdfUrl: null, message: "erro fiscal" });
    const conv = await readyConversation(repos);
    await repos.charges.save(makeCharge());
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, imageInbound());

    const charge = await repos.charges.getById("ch1");
    expect(charge?.status).toBe("cobrada"); // intocada
    expect(charge?.paidAt).toBeNull();
    expect(conv.state).toBe(ConversationState.HumanHandoff);
  });

  it("baixa confiança do comprovante (handoff ANTES da emissão) -> Charge permanece intocada", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "?", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.4, raw: "" });
    const conv = await readyConversation(repos);
    await repos.charges.save(makeCharge());
    const sm = new ConversationStateMachine(deps);

    await sm.advance(conv, agentConfig, integration, imageInbound());

    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    const charge = await repos.charges.getById("ch1");
    expect(charge?.status).toBe("cobrada");
    expect(charge?.paidAt).toBeNull();
  });
});
