/**
 * Porta de MENSAGERIA — abstrai o WhatsApp.
 *
 * Hoje: adapter WPP (não-oficial; provider a definir pela pesquisa wr80xu2as).
 * Futuro: adapter Meta (WhatsApp Cloud API).
 * Trocar de provedor = nova implementação desta porta, ZERO mudança em Domain/Application.
 */
export type InboundKind = "text" | "image" | "audio" | "document";

export interface InboundMedia {
  mimetype: string;
  filename?: string;
  base64?: string;
  url?: string;
}

export interface InboundMessage {
  providerMessageId: string;
  from: string; // número do remetente (E.164/digits)
  to: string; // número conectado — resolve qual Integration
  kind: InboundKind;
  text: string | null;
  media: InboundMedia | null;
  timestamp: Date;
}

export interface OutboundText {
  to: string;
  text: string;
  /** Instância Evolution do tenant (multi-tenant). Vazio/ausente → fallback pro global (compat piloto). */
  instance?: string;
}

export interface OutboundMedia {
  to: string;
  mimetype: string;
  base64?: string;
  url?: string;
  filename?: string;
  caption?: string;
  /** Instância Evolution do tenant (multi-tenant). Vazio/ausente → fallback pro global (compat piloto). */
  instance?: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "qr"
  | "connecting"
  | "connected";

export interface IMessagingProvider {
  start(): Promise<void>;
  getConnectionStatus(): ConnectionStatus;
  /** QR em base64 para pareamento (não-oficial). null se já conectado ou se oficial. */
  getQrCode(): Promise<string | null>;
  onInboundMessage(handler: (msg: InboundMessage) => Promise<void>): void;
  sendText(msg: OutboundText): Promise<void>;
  sendMedia(msg: OutboundMedia): Promise<void>;
  startTyping(to: string): Promise<void>;
  stopTyping(to: string): Promise<void>;
}
