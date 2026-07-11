import { describe, expect, it, vi } from "vitest";
import { HandleInboundMessage } from "../../src/application/use-cases/HandleInboundMessage";
import { ConversationStateMachine } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { MockFiscalProvider } from "../../src/infrastructure/fiscal/MockFiscalProvider";
import { MockCpfProvider } from "../../src/infrastructure/cpf/MockCpfProvider";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";
import { ConversationState } from "../../src/domain/entities/ConversationState";

describe("Aceite: caminho feliz do piloto (§7)", () => {
  it("conversa → coleta → valida → comprovante → emite → envia PDF", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [{ id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000", fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() }],
      agentConfigs: [{ id: "ag1", integrationId: "int1", name: "Kaua", instructions: "Você é a secretária do consultório.", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() } as any],
      services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta médica", price: 300, issCode: "0107" }],
    });

    const sentMedia: any[] = [];
    const messaging: any = { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(async (m: any) => { sentMedia.push(m); }), startTyping: vi.fn(), stopTyping: vi.fn() };

    // cérebro determinístico: 1ª msg → intent_emit; depois extrai nome+cpf
    const brain: any = { decide: vi.fn()
      .mockResolvedValueOnce({ reply: ["Oi! Posso emitir sua nota. Me manda nome completo e CPF?"], action: { type: "intent_emit" } })
      .mockResolvedValue({ reply: ["Obrigado!"], action: { type: "reply" }, extracted: { fullName: "João da Silva", cpf: "529.982.247-25" } }) };
    const comprovante: any = { analyze: vi.fn(async () => ({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" })) };
    const cpf = new MockCpfProvider({ "52998224725": "João da Silva" });
    const fiscal = new MockFiscalProvider();

    const sm = new ConversationStateMachine({ brain, cpf, comprovante, fiscal, messaging, contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services, companyProfiles: repos.companyProfiles, config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 } });
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm });

    const from = "5511988887777"; const to = "5511999990000";
    const text = (t: string): InboundMessage => ({ providerMessageId: "x", from, to, kind: "text", text: t, media: null, timestamp: new Date() });

    await uc.execute(text("agendei e já paguei, e a nota?")); // → intent_emit
    await uc.execute(text("João da Silva, 529.982.247-25")); // valida + cria cliente
    await uc.execute({ providerMessageId: "img", from, to, kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() }); // comprovante → emite

    expect(sentMedia).toHaveLength(1);
    expect(sentMedia[0].mimetype).toBe("application/pdf");
    const conv = await repos.conversations.findByWhatsappNumber("int1", from);
    expect(conv?.state).toBe(ConversationState.Done);
  });
});
