import { apiFetch } from "@/lib/api";

export type AgenteTone = "formal" | "equilibrado" | "descontraido";
export type AgenteLang = "pt" | "en" | "es";

/** Par de exemplo few-shot: pergunta do cliente (`q`) e resposta ideal do agente (`a`). */
export interface FewShotDialog {
  q: string;
  a: string;
}

/** Persona do agente — espelha `personaDe()` em `agente.routes.ts`. */
export interface AgentePersona {
  integrationId: string | null;
  name: string;
  segment: string;
  tone: AgenteTone;
  emojis: boolean;
  lang: AgenteLang;
  instructions: string;
  fewShotDialogs: FewShotDialog[];
}

/** Espelha `personaSchema` do backend — `integrationId` é só leitura (nunca enviado no PUT). */
export type AgentePersonaPayload = Omit<AgentePersona, "integrationId">;

/** GET /api/agente — persona do agente da integração (WhatsApp) da empresa logada. */
export async function getAgente(): Promise<AgentePersona> {
  return apiFetch<AgentePersona>("GET", "/api/agente");
}

/** PUT /api/agente — salva a persona; o backend preserva capabilities/knowledgeFiles já existentes. */
export async function saveAgente(payload: AgentePersonaPayload): Promise<AgentePersona> {
  return apiFetch<AgentePersona>("PUT", "/api/agente", payload);
}
