import type {
  ConnectionStatus,
  IMessagingProvider,
  InboundMessage,
  OutboundMedia,
  OutboundText,
} from "../../../domain/ports/IMessagingProvider";

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

export class EvolutionMessagingProvider implements IMessagingProvider {
  private handler: ((m: InboundMessage) => Promise<void>) | null = null;

  constructor(private readonly cfg: EvolutionConfig) {}

  /** Instância já criada/conectada no Evolution Dashboard — no-op. */
  async start(): Promise<void> {}

  getConnectionStatus(): ConnectionStatus {
    return "connected";
  }

  async getQrCode(): Promise<string | null> {
    const res = await this.req(`/instance/connect/${this.cfg.instance}`, "GET");
    const r = res as Record<string, unknown> | null;
    return (
      (r?.["base64"] as string | undefined) ??
      ((r?.["qrcode"] as Record<string, unknown> | undefined)?.["base64"] as string | undefined) ??
      null
    );
  }

  onInboundMessage(handler: (m: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }

  /** Chamado pelo servidor HTTP quando o webhook do Evolution chega. */
  async dispatchInbound(m: InboundMessage): Promise<void> {
    await this.handler?.(m);
  }

  async sendText(msg: OutboundText): Promise<void> {
    await this.req(`/message/sendText/${this.cfg.instance}`, "POST", {
      number: msg.to,
      text: msg.text,
    });
  }

  async sendMedia(msg: OutboundMedia): Promise<void> {
    await this.req(`/message/sendMedia/${this.cfg.instance}`, "POST", {
      number: msg.to,
      mediatype: msg.mimetype.startsWith("image") ? "image" : "document",
      mimetype: msg.mimetype,
      media: msg.url ?? msg.base64,
      fileName: msg.filename,
      caption: msg.caption,
    });
  }

  async startTyping(_to: string): Promise<void> {
    /* opcional no Evolution */
  }

  async stopTyping(_to: string): Promise<void> {
    /* opcional */
  }

  private async req(path: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: this.cfg.apiKey },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Evolution ${method} ${path} → ${res.status}: ${await res.text()}`);
    }
    return res.json().catch(() => ({}));
  }
}
