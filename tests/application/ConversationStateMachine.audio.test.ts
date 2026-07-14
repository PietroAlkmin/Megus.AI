import { describe, expect, it, vi } from "vitest";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { AgentConfig } from "../../src/domain/entities/AgentConfig";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

/**
 * Transcrição de áudio (13/07): voz vira texto na entrada; aqui o state machine
 * (1) roteia o áudio-com-texto pro cérebro com aviso de read-back, (2) responde
 * honestamente quando não deu pra ouvir (áudio sem texto), e (3) NUNCA manda voz
 * pro gate B de comprovante (isReceiptMedia exclui áudio).
 */

const integration = { id: "int1", companyId: "c1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "11222333000181", fiscalName: "Clínica Alfa Ltda", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const agentConfig: AgentConfig = {
  id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt",
  instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] },
  knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date(),
};

const FROM = "5511988887777";
const audioComTexto = (text: string): InboundMessage => ({ providerMessageId: "au", from: FROM, to: "5511999990000", kind: "audio", text, media: { mimetype: "audio/ogg; codecs=opus", base64: "T2dnUw" }, transcribed: true, timestamp: new Date() });
const audioSemTexto = (): InboundMessage => ({ providerMessageId: "au0", from: FROM, to: "5511999990000", kind: "audio", text: null, media: { mimetype: "audio/ogg", base64: "T2dnUw" }, timestamp: new Date() });
const imagem = (): InboundMessage => ({ providerMessageId: "im", from: FROM, to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "recibo" }, timestamp: new Date() });

function seed(repos: InMemoryRepositories) {
  repos.seed({
    integrations: [integration],
    services: [{ id: "svc1", integrationId: "int1", code: "01", description: "Massagem", price: 180, issCode: "01" }],
  });
}

function deps(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: ["ok"], action: { type: "reply" as const } })) },
    cpf: { lookupName: vi.fn(async () => ({ found: true, name: "João da Silva" })) },
    comprovante: { analyze: vi.fn(async () => ({ amount: 180, payerName: "João", recipientDoc: "11222333000181", recipientMatches: true, confidence: 1, raw: "" })) },
    fiscal: { upsertCustomer: vi.fn(async () => ({ customerId: "c1", created: true })), emitNfse: vi.fn(async () => ({ success: true, fiscalKey: "k1", pdfUrl: "http://x/n.pdf", message: null })) },
    messaging: { start: vi.fn(), getConnectionStatus: vi.fn(() => "connected" as const), getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(async () => {}), sendMedia: vi.fn(async () => {}), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services,
    companyProfiles: repos.companyProfiles, charges: repos.charges,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  } as unknown as StateMachineDeps;
}

const bubbles = (d: StateMachineDeps): string =>
  (d.messaging.sendText as any).mock.calls.map((c: any) => c[0].text as string).join(" ");

describe("transcrição de áudio no state machine", () => {
  it("áudio transcrito em conversa livre → cérebro decide (não gate B) e recebe o aviso de read-back", async () => {
    const repos = new InMemoryRepositories(); seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", FROM);

    await sm.advance(conv, agentConfig, integration, audioComTexto("quero marcar uma consulta"));

    expect(d.brain.decide).toHaveBeenCalledOnce();
    expect(d.comprovante.analyze).not.toHaveBeenCalled();
    const ctx = (d.brain.decide as any).mock.calls[0][0] as { notices?: string[] };
    expect((ctx.notices ?? []).join(" ")).toContain("transcrita de um áudio");
  });

  it("áudio de contato verificado com cobrança pendente → NÃO vira comprovante (voz não é recibo)", async () => {
    const repos = new InMemoryRepositories(); seed(repos);
    const now = new Date();
    await repos.contacts.save({ id: "ct1", integrationId: "int1", whatsappNumber: FROM, fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: now, updatedAt: now });
    await repos.charges.save({ id: "ch1", integrationId: "int1", contactId: "ct1", serviceId: "svc1", description: "Massagem", amount: 180, status: "pendente", calendarEventId: null, chargedAt: null, paidAt: null, createdAt: now, updatedAt: now });
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", FROM);

    await sm.advance(conv, agentConfig, integration, audioComTexto("já paguei viu"));

    expect(d.comprovante.analyze).not.toHaveBeenCalled();
    expect(d.brain.decide).toHaveBeenCalledOnce();
  });

  it("áudio sem texto (transcrição falhou) → resposta honesta, estado inalterado, cérebro NÃO chamado", async () => {
    const repos = new InMemoryRepositories(); seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", FROM);
    const estadoAntes = conv.state;

    await sm.advance(conv, agentConfig, integration, audioSemTexto());

    expect(d.brain.decide).not.toHaveBeenCalled();
    expect(bubbles(d)).toContain("Não consegui ouvir seu áudio");
    expect(conv.state).toBe(estadoAntes);
  });

  it("áudio (mesmo transcrito) aguardando comprovante → pede foto/PDF, NÃO manda voz pra visão", async () => {
    const repos = new InMemoryRepositories(); seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", FROM);
    conv.state = ConversationState.AwaitingComprovante;
    await repos.conversations.save(conv);

    await sm.advance(conv, agentConfig, integration, audioComTexto("já fiz o pix"));

    expect(d.comprovante.analyze).not.toHaveBeenCalled();
    expect(bubbles(d)).toContain("foto ou PDF");
  });

  it("regressão: FOTO aguardando comprovante ainda dispara o gate B (visão)", async () => {
    const repos = new InMemoryRepositories(); seed(repos);
    const d = deps(repos);
    const sm = new ConversationStateMachine(d);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", FROM);
    conv.state = ConversationState.AwaitingComprovante;
    await repos.conversations.save(conv);

    await sm.advance(conv, agentConfig, integration, imagem());

    expect(d.comprovante.analyze).toHaveBeenCalledOnce();
  });
});
