/**
 * Configuração do agente ("Kaua") por cliente/integração.
 * Espelha o AtendenteVirtualModal do wireframe (referência interna/wireframe-v2).
 */
export type AgentTone = "formal" | "equilibrado" | "descontraido";
export type AgentLang = "pt" | "en" | "es";
export type FiscalDocType = "nfe" | "nfce" | "nfse";

/**
 * O que o agente pode fazer sozinho. Ausente = LIGADO em todas: a clínica que
 * já estava no ar não muda de comportamento por causa de um campo novo.
 *
 * `chat`, `cobranca` e `comprovante` eram desenhadas como chave no painel e não
 * existiam de fato — `chat` sequer era lido em lugar nenhum, e "confirmar
 * pagamento" estava amarrado a `fiscal` (a clínica que não emite nota via
 * "desativado" enquanto o agente confirmava pagamento). Agora cada uma desliga
 * algo de verdade, e o que ela desliga vira trabalho de humano — nunca silêncio.
 */
export interface AgentCapabilities {
  /** Responder livremente. Desligado: dúvida geral vira handoff, o funil segue. */
  chat?: boolean;
  /** Disparar a cobrança no WhatsApp (botão do painel e envio agendado). */
  cobranca?: boolean;
  /** Conferir o comprovante e dar o pagamento por confirmado. Desligado: chama humano. */
  comprovante?: boolean;
  /**
   * Coletar o cadastro do paciente na PRIMEIRA conversa.
   *
   * O toggle É a instrução: antes, a clínica precisava escrever "peça nome,
   * CPF, endereço…" no prompt E lembrar de ligar alguma coisa — duas
   * dependências para o mesmo efeito, e a que ela esquece manda no resultado.
   * Aqui a lista de campos vira o bloco do prompt sozinha.
   *
   * Ausente/desligado = o agente não pede nada por conta própria.
   */
  cadastro?: { ligado: boolean; campos: string[] };
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
