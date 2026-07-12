import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * Bug real 12/07 ("comprovante seco"): cliente manda a IMAGEM do comprovante em
 * conversa livre → o modelo arma o funil fiscal (intent_emit) NESSE turno → mas a
 * imagem já passou do roteamento e se perdia; o cliente caía na guarda "me envia
 * foto ou PDF" em loop. Regra: mídia que chegou JUNTO do armamento (inbound do
 * mesmo turno) vai pro gate B imediatamente após a identidade validar.
 */

const integration = { id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "11222333000181", fiscalName: "Clínica Alfa Ltda", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const agentConfig: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

function mediaInbound(): InboundMessage {
  return { providerMessageId: "m-img", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "recibo" }, timestamp: new Date() };
}

function seed(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "01", description: "Massagem", price: 180, issCode: "01" }],
  });
}

function depsWith(repos: InMemoryRepositories, analysis: { amount: number; recipientMatches: boolean; confidence: number }): StateMachineDeps {
  return {
    brain: {
      decide: vi.fn(async () => ({
        reply: ["Vou emitir sua nota — só confirmando seus dados."],
        action: { type: "intent_emit" as const },
        extracted: { fullName: "João da Silva", cpf: "529.982.247-25" },
      })),
    },
    cpf: { lookupName: vi.fn(async () => ({ found: true, name: "João da Silva" })) },
    comprovante: { analyze: vi.fn(async () => ({ ...analysis, payerName: "João" })) },
    fiscal: { upsertCustomer: vi.fn(async () => ({ customerId: "c1", created: true })), emitNfse: vi.fn(async () => ({ success: true, fiscalKey: "k1", pdfUrl: "http://x/n.pdf", message: null })) },
    messaging: { start: vi.fn(), getConnectionStatus: vi.fn(() => "connected" as const), getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(async () => {}), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services,
    companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  } as unknown as StateMachineDeps;
}

describe("mídia que chega JUNTO do armamento fiscal não se perde", () => {
  it("imagem + intent_emit c/ identidade válida no MESMO turno → gate B roda JÁ: nota emitida, sem pedir re-envio", async () => {
    const repos = new InMemoryRepositories();
    seed(repos);
    const deps = depsWith(repos, { amount: 180, recipientMatches: true, confidence: 1 });
    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).toHaveBeenCalledOnce(); // a imagem em mãos foi analisada
    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
    const bubbles = (deps.messaging.sendText as any).mock.calls.map((c: any) => c[0].text as string);
    expect(bubbles.join(" ")).not.toContain("Agora me envia o comprovante"); // NÃO pediu re-envio
  });

  it("comprovante ERRADO junto do armamento → gate B analisa JÁ e rejeita (handoff), nada de loop de guarda", async () => {
    const repos = new InMemoryRepositories();
    seed(repos);
    const deps = depsWith(repos, { amount: 50, recipientMatches: false, confidence: 0.9 });
    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).toHaveBeenCalledOnce();
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    expect(conv.humanHandoff).toBe(true); // rejeição → humano (comportamento do gate)
  });

  it("analisador FALHA (erro de sistema, não rejeição) → mensagem honesta + permanece aguardando (nunca silêncio, nunca handoff)", async () => {
    const repos = new InMemoryRepositories();
    seed(repos);
    const deps = depsWith(repos, { amount: 180, recipientMatches: true, confidence: 1 });
    (deps.comprovante.analyze as any).mockRejectedValue(new Error("invalid_image_url"));
    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(conv.humanHandoff).toBe(false); // erro de sistema NÃO transfere
    expect(conv.state).toBe(ConversationState.AwaitingComprovante); // segue aguardando o reenvio
    const bubbles = (deps.messaging.sendText as any).mock.calls.map((c: any) => c[0].text as string);
    expect(bubbles.join(" ")).toContain("Não consegui ler seu comprovante");
    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("intent_emit SEM identidade extraída + mídia → identidade primeiro (gate B NÃO roda com contato não-verificado)", async () => {
    const repos = new InMemoryRepositories();
    seed(repos);
    const deps = depsWith(repos, { amount: 180, recipientMatches: true, confidence: 1 });
    (deps.brain.decide as any).mockResolvedValue({ reply: ["Preciso do seu nome e CPF."], action: { type: "intent_emit" } });
    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");

    await sm.advance(conv, agentConfig, integration, mediaInbound());

    expect(deps.comprovante.analyze).not.toHaveBeenCalled();
    expect(conv.state).toBe(ConversationState.CollectingIdentity);
  });
});
