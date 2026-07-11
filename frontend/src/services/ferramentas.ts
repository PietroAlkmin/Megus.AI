import { apiFetch } from "@/lib/api";

export interface AgendaStatus {
  conectado: boolean;
}

export interface AgendaConexao {
  /** URL de consentimento (Composio → Google) — abrir em nova aba. */
  url: string;
}

/** GET /api/agente/ferramentas/agenda/status — a empresa logada tem agenda conectada? */
export async function agendaStatus(): Promise<AgendaStatus> {
  return apiFetch<AgendaStatus>("GET", "/api/agente/ferramentas/agenda/status");
}

/** POST /api/agente/ferramentas/agenda/conectar — inicia o OAuth e devolve a URL de consentimento. */
export async function agendaConectar(): Promise<AgendaConexao> {
  return apiFetch<AgendaConexao>("POST", "/api/agente/ferramentas/agenda/conectar");
}
