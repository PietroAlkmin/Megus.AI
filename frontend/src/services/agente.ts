import { apiFetch } from "@/lib/api";

export type AgenteTone = "formal" | "equilibrado" | "descontraido";
export type AgenteLang = "pt" | "en" | "es";
export type FiscalDocType = "nfe" | "nfce" | "nfse";

/** Par de exemplo few-shot: pergunta do cliente (`q`) e resposta ideal do agente (`a`). */
export interface FewShotDialog {
  q: string;
  a: string;
}

/** Ações que o agente pode executar (seção "O que o agente faz"). */
export interface AgenteCapabilities {
  agenda: boolean;
  agendaLink: string | null;
  fiscal: boolean;
  fiscalDocType: FiscalDocType | null;
  linkedServiceIds: string[];
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
  capabilities: AgenteCapabilities;
  knowledgeFiles: string[];
}

/** Espelha `personaSchema` do backend — `integrationId`/`knowledgeFiles` são só leitura. */
export type AgentePersonaPayload = Omit<AgentePersona, "integrationId" | "knowledgeFiles">;

/** GET /api/agente — persona do agente da integração (WhatsApp) da empresa logada. */
export async function getAgente(): Promise<AgentePersona> {
  return apiFetch<AgentePersona>("GET", "/api/agente");
}

/** PUT /api/agente — salva a persona + capabilities. */
export async function saveAgente(payload: AgentePersonaPayload): Promise<AgentePersona> {
  return apiFetch<AgentePersona>("PUT", "/api/agente", payload);
}