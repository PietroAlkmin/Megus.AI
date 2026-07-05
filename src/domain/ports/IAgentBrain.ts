import type { Message } from "../entities/Message";

/**
 * Porta do CÉREBRO (LLM). Recebe o contexto da conversa e devolve a próxima
 * resposta + a ação proposta. Implementação = adapter OpenAI.
 *
 * A LÓGICA de estado (quando pedir CPF, quando emitir, etc.) vive na Application
 * (ConversationStateMachine — Seção 2). Esta porta só decide texto + ação proposta;
 * a Application valida e executa (a IA não age sozinha em ações sensíveis).
 */
export interface AgentPersona {
  name: string;
  segment: string;
  tone: "formal" | "equilibrado" | "descontraido";
  emojis: boolean;
  lang: "pt" | "en" | "es";
  instructions: string;
  fewShotDialogs: { q: string; a: string }[];
}

export interface AgentBusinessService {
  description: string;
  price: number;
  emissivel: boolean;
}

export interface AgentBusiness {
  companyName: string; // integration.fiscalName
  services: AgentBusinessService[]; // serviços da integração; emissivel = está em linkedServiceIds
}

export interface AgentCollected {
  cpfNameVerified: boolean; // contato já validou CPF↔nome?
  fullNameMasked: string | null; // ex.: "João S." (nunca o nome cru completo)
  cpfMasked: string | null; // ex.: "529.***.**7-25"
  emissionStatus: string | null; // status do EmissionIntent corrente, se houver
}

export interface AgentContext {
  persona: AgentPersona;
  business: AgentBusiness;
  state: string; // ConversationState atual
  history: Message[];
  collected: AgentCollected;
  today: string; // data corrente PT-BR (ex.: "sábado, 5 de julho de 2026")
}

export type AgentProposedAction =
  | { type: "reply" }
  | { type: "answer_question" } // respondeu dúvida de negócio
  | { type: "quote_price" } // cotou preço de serviço
  | { type: "smalltalk" } // conversa social
  | { type: "provide_identity" } // cliente forneceu nome/CPF (extracted preenchido)
  | { type: "intent_emit" } // cliente quer emitir → aciona coleta de identidade
  | { type: "request_comprovante" }
  | { type: "handoff"; reason: string };

export interface AgentDecision {
  reply: string[]; // bolhas de texto a enviar
  action: AgentProposedAction;
  /** Dados extraídos da mensagem do cliente (o código valida; a IA só propõe). */
  extracted?: { fullName?: string; cpf?: string; amount?: number };
}

export interface IAgentBrain {
  decide(context: AgentContext): Promise<AgentDecision>;
}
