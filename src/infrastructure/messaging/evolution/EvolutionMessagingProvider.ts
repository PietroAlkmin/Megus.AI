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

  async sendText(msg: OutboundText): Promise<void> {
    const instance = msg.instance ?? this.cfg.instance;
    await this.req(`/message/sendText/${instance}`, "POST", {
      number: msg.to,
      text: msg.text,
    });
  }

  async sendMedia(msg: OutboundMedia): Promise<void> {
    const instance = msg.instance ?? this.cfg.instance;
    const mediatype = msg.mimetype.startsWith("image") ? "image" : msg.mimetype.startsWith("audio") ? "audio" : "document";
    // O Evolution exige URL com TLD (hostname interno do Docker falha na validação
    // "Owned media must be a url or base64"). Quando só temos URL, buscamos o
    // arquivo e enviamos como base64 — robusto para qualquer origem.
    let media = msg.base64 ?? "";
    if (!msg.base64 && msg.url) {
      const res = await fetch(msg.url);
      if (!res.ok) throw new Error(`sendMedia: falha ao buscar mídia ${msg.url} → ${res.status}`);
      media = Buffer.from(await res.arrayBuffer()).toString("base64");
    }
    await this.req(`/message/sendMedia/${instance}`, "POST", {
      number: msg.to,
      mediatype,
      mimetype: msg.mimetype,
      media,
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
