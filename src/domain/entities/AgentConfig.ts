/**
 * Configuração do agente ("Kaua") por cliente/integração.
 * Espelha o AtendenteVirtualModal do wireframe (referência interna/wireframe-v2).
 */
export type AgentTone = "formal" | "equilibrado" | "descontraido";
export type AgentLang = "pt" | "en" | "es";
export type FiscalDocType = "nfe" | "nfce" | "nfse";

export interface AgentCapabilities {
  chat: true; // sempre ligado (essencial)
  agenda: boolean;
  agendaLink: string | null;
  fiscal: boolean;
  fiscalDocType: FiscalDocType | null;
  linkedServiceIds: string[]; // serviços (NFS-e) vinculados — IDs no backend fiscal
}

export interface AgentConfig {
  id: string;
  integrationId: string;
  name: string; // ex.: "Kaua"
  segment: string; // saude, comercio, restaurante, ...
  tone: AgentTone;
  emojis: boolean;
  lang: AgentLang;
  instructions: string; // briefing / system prompt do cliente
  capabilities: AgentCapabilities;
  knowledgeFiles: string[]; // base de conhecimento p/ RAG (futuro)
  fewShotDialogs: { q: string; a: string }[]; // exemplos de conversa
  createdAt: Date;
  updatedAt: Date;
}
