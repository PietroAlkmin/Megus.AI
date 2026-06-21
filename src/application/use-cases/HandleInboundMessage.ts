import type {
  IMessagingProvider,
  InboundMessage,
} from "../../domain/ports/IMessagingProvider";
import type {
  IAgentConfigRepository,
  IContactRepository,
  IConversationRepository,
  IIntegrationRepository,
} from "../../domain/ports/repositories";
import type { ConversationStateMachine } from "../agent/ConversationStateMachine";

/**
 * Caso de uso de ENTRADA: o adapter de mensageria chama isto a cada mensagem
 * recebida do WhatsApp. Fixa a forma da orquestração; as decisões do Kaua ficam
 * no ConversationStateMachine (Seção 2).
 */
export class HandleInboundMessage {
  constructor(
    private readonly integrations: IIntegrationRepository,
    private readonly agentConfigs: IAgentConfigRepository,
    private readonly contacts: IContactRepository,
    private readonly conversations: IConversationRepository,
    private readonly stateMachine: ConversationStateMachine,
    private readonly messaging: IMessagingProvider,
  ) {}

  async execute(inbound: InboundMessage): Promise<void> {
    // 1. Resolver a Integration dona do número conectado (multi-tenant por número).
    const integration = await this.integrations.getByWhatsappNumber(inbound.to);
    if (!integration || !integration.active) return;

    // 2. (Seção 2) resolver/criar Contact + Conversation, persistir a mensagem,
    //    coalescer o turno e delegar ao ConversationStateMachine, que conduz a
    //    coleta/validação e — quando tudo confere — dispara a emissão determinística.
    // TODO(Seção 2): implementar o fluxo completo do Kaua.
    void this.agentConfigs;
    void this.contacts;
    void this.conversations;
    void this.stateMachine;
    void this.messaging;
  }
}
