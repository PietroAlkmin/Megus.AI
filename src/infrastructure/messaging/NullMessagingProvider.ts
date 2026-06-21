import type {
  ConnectionStatus,
  IMessagingProvider,
  InboundMessage,
  OutboundMedia,
  OutboundText,
} from "../../domain/ports/IMessagingProvider";

/**
 * Placeholder de mensageria — usado no composition root enquanto o PROVEDOR REAL
 * não é escolhido (pesquisa wr80xu2as: WPP self-host vs SaaS vs Meta Cloud API).
 *
 * Quando a pesquisa decidir, criar o adapter concreto (ex.: messaging/wpp/WppMessagingProvider
 * ou messaging/meta/MetaMessagingProvider) implementando IMessagingProvider.
 */
export class NullMessagingProvider implements IMessagingProvider {
  private handler: ((msg: InboundMessage) => Promise<void>) | null = null;

  async start(): Promise<void> {
    // no-op
  }
  getConnectionStatus(): ConnectionStatus {
    return "disconnected";
  }
  async getQrCode(): Promise<string | null> {
    return null;
  }
  onInboundMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }
  async sendText(_msg: OutboundText): Promise<void> {
    throw new Error("Mensageria não configurada (NullMessagingProvider).");
  }
  async sendMedia(_msg: OutboundMedia): Promise<void> {
    throw new Error("Mensageria não configurada (NullMessagingProvider).");
  }
  async startTyping(_to: string): Promise<void> {}
  async stopTyping(_to: string): Promise<void> {}
}
