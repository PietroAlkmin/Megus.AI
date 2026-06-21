import type {
  ConnectionStatus,
  IMessagingProvider,
  InboundMessage,
  OutboundMedia,
  OutboundText,
} from "../../domain/ports/IMessagingProvider";

/** Mensageria de DEV: loga o outbound em vez de enviar (testar o Kaua sem WhatsApp). */
export class LogMessagingProvider implements IMessagingProvider {
  readonly sent: (OutboundText | OutboundMedia)[] = [];
  private handler: ((m: InboundMessage) => Promise<void>) | null = null;

  async start(): Promise<void> {}

  getConnectionStatus(): ConnectionStatus {
    return "connected";
  }

  async getQrCode(): Promise<string | null> {
    return null;
  }

  onInboundMessage(handler: (m: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }

  /** Injeta uma mensagem fake — usado pela rota POST /dev/inbound. */
  async dispatchInbound(m: InboundMessage): Promise<void> {
    await this.handler?.(m);
  }

  async sendText(msg: OutboundText): Promise<void> {
    this.sent.push(msg);
    console.log(`[Kaua → ${msg.to}] ${msg.text}`);
  }

  async sendMedia(msg: OutboundMedia): Promise<void> {
    this.sent.push(msg);
    console.log(
      `[Kaua → ${msg.to}] [mídia ${msg.mimetype}] ${msg.caption ?? ""} ${msg.url ?? ""}`,
    );
  }

  async startTyping(_to: string): Promise<void> {}
  async stopTyping(_to: string): Promise<void> {}
}
