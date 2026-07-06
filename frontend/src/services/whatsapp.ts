import { apiFetch } from "@/lib/api";

export interface WhatsAppConnection {
  /** Base64 do QR (com ou sem prefixo `data:image/...`) devolvido pela Evolution API. */
  qr: string;
  instance: string;
}

export interface WhatsAppStatus {
  connected: boolean;
  number: string | null;
}

/** POST /api/agente/whatsapp/connect — cria (ou reusa) a instância da empresa logada e devolve o QR. */
export async function connect(): Promise<WhatsAppConnection> {
  return apiFetch<WhatsAppConnection>("POST", "/api/agente/whatsapp/connect");
}

/** GET /api/agente/whatsapp/status — estado da conexão (pareado ou não) da empresa logada. */
export async function status(): Promise<WhatsAppStatus> {
  return apiFetch<WhatsAppStatus>("GET", "/api/agente/whatsapp/status");
}
