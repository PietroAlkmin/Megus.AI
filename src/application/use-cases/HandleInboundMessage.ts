import type { ConversationStateMachine } from "../agent/ConversationStateMachine";
import type { InboundMessage } from "../../domain/ports/IMessagingProvider";
import type {
  IAgentConfigRepository, IContactRepository, IConversationRepository, IIntegrationRepository,
} from "../../domain/ports/repositories";
import { randomUUID } from "node:crypto";

export interface HandleInboundDeps {
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  conversations: IConversationRepository;
  contacts: IContactRepository;
  stateMachine: ConversationStateMachine;
}

export class HandleInboundMessage {
  constructor(private readonly d: HandleInboundDeps) {}

  async execute(inbound: InboundMessage): Promise<void> {
    const integration = await this.d.integrations.getByWhatsappNumber(inbound.to);
    if (!integration || !integration.active) return;

    const agentConfig = await this.d.agentConfigs.getByIntegrationId(integration.id);
    if (!agentConfig) return;

    let contact = await this.d.contacts.findByWhatsapp(integration.id, inbound.from);
    const now = new Date();
    if (!contact) {
      contact = {
        id: randomUUID(), integrationId: integration.id, whatsappNumber: inbound.from,
        fullName: null, cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now,
      };
      await this.d.contacts.save(contact);
    }

    const conv = await this.d.conversations.getOrCreate(integration.id, contact.id, inbound.from);
    conv.lastInboundAt = now;

    // CRÍTICO: appendMessage ANTES de advance — o brain lê o histórico para contexto.
    await this.d.conversations.appendMessage({
      id: randomUUID(), conversationId: conv.id, direction: "inbound", author: "contact",
      kind: inbound.kind, body: inbound.text ?? `[${inbound.kind}]`, mediaUrl: inbound.media?.url ?? null, createdAt: now,
    });
    await this.d.conversations.save(conv);

    await this.d.stateMachine.advance(conv, agentConfig, integration, inbound);
  }
}
