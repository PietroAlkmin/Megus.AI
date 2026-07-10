import { apiFetch } from "@/lib/api";

/** Uma conversa na lista (esquerda). Espelha `conversas.routes.ts`. */
export interface Conversa {
  id: string;
  nome: string;
  telefone: string;
  /** prévia da última mensagem ("" quando a conversa ainda não tem mensagens) */
  ultima: string;
  hora: string | null;
  status: "BOT" | "AGUARDANDO" | "HUMANO";
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

/** POST /api/conversas/:convId/assumir — humano assume a conversa. */
export async function assumir(convId: string): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>("POST", `/api/conversas/${encodeURIComponent(convId)}/assumir`);
}