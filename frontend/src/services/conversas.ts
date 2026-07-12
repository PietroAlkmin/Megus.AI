import { apiFetch } from "@/lib/api";

/** Uma conversa na lista (esquerda). Espelha `conversas.routes.ts`. */
export interface Conversa {
  id: string;
  nome: string;
  telefone: string;
  ultima: string;
  hora: string | null;
  status: "BOT" | "AGUARDANDO" | "HUMANO";
  humanHandoff?: boolean;
  naoLidas: number;
}

/** Uma mensagem no chat (direita). */
export interface Mensagem {
  id: string;
  autor: "cliente" | "bot" | "humano";
  texto: string;
  hora: string | null;
  attach?: { type: string; name: string };
}

/** GET /api/agentes/:agentId/conversas — conversas de um agente (integração). */
export async function listConversas(agentId: string): Promise<Conversa[]> {
  return apiFetch<Conversa[]>("GET", `/api/agentes/${encodeURIComponent(agentId)}/conversas`);
}

/** GET /api/conversas/:convId/mensagens — mensagens de uma conversa. */
export async function listMensagens(convId: string): Promise<Mensagem[]> {
  return apiFetch<Mensagem[]>("GET", `/api/conversas/${encodeURIComponent(convId)}/mensagens`);
}

/** POST /api/conversas/:convId/assumir — humano assume (pausa o bot). */
export async function assumir(convId: string): Promise<{ id: string; status: string; humanHandoff: boolean }> {
  return apiFetch("POST", `/api/conversas/${encodeURIComponent(convId)}/assumir`);
}

/** POST /api/conversas/:convId/retomar — devolve a conversa ao bot. */
export async function retomar(convId: string): Promise<{ id: string; status: string; humanHandoff: boolean }> {
  return apiFetch("POST", `/api/conversas/${encodeURIComponent(convId)}/retomar`);
}

/** POST /api/conversas/:convId/enviar — humano envia mensagem pelo WhatsApp. */
export async function enviar(convId: string, texto: string): Promise<{ id: string; enviado: boolean }> {
  return apiFetch("POST", `/api/conversas/${encodeURIComponent(convId)}/enviar`, { texto });
}