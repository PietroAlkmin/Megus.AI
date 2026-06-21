import type { Message } from "../entities/Message";

/**
 * Porta do CÉREBRO (LLM). Recebe o contexto da conversa e devolve a próxima
 * resposta + a ação proposta. Implementação = adapter OpenAI.
 *
 * A LÓGICA de estado (quando pedir CPF, quando emitir, etc.) vive na Application
 * (ConversationStateMachine — Seção 2). Esta porta só decide texto + ação proposta;
 * a Application valida e executa (a IA não age sozinha em ações sensíveis).
 */
export interface AgentContext {
  systemInstructions: string;
  state: string; // ConversationState atual
  history: Message[];
  collected: Record<string, unknown>; // nome/cpf/comprovante já coletados
}

export type AgentProposedAction =
  | { type: "reply" }
  | { type: "request_identity" } // pedir nome + CPF
  | { type: "request_comprovante" }
  | { type: "ready_to_emit" }
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
