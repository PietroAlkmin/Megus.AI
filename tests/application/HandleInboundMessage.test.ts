import { describe, expect, it, vi } from "vitest";
import { HandleInboundMessage } from "../../src/application/use-cases/HandleInboundMessage";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

const integration = { id: "int1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "1", fiscalName: "X", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const inbound: InboundMessage = { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text: "oi", media: null, timestamp: new Date() };

describe("HandleInboundMessage", () => {
  it("número desconhecido → não faz nada", async () => {
    const repos = new InMemoryRepositories();
    const sm = { advance: vi.fn() } as any;
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm });
    await uc.execute({ ...inbound, to: "0000" });
    expect(sm.advance).not.toHaveBeenCalled();
  });

  it("número conhecido → cria contato/conversa e chama o state machine", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration], agentConfigs: [{ id: "ag1", integrationId: "int1", name: "Kaua", instructions: "", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() } as any] });
    const sm = { advance: vi.fn() } as any;
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm });
    await uc.execute(inbound);
    expect(sm.advance).toHaveBeenCalledOnce();
    const contact = await repos.contacts.findByWhatsapp("int1", "5511988887777");
    expect(contact).not.toBeNull();
  });
});
