import type { AIMessage, AITool } from "./IAIProvider";

/**
 * Porta do MOTOR AGÊNTICO: roda um loop de tools (o modelo chama tools de negócio,
 * o motor executa e re-prompta) e devolve a decisão final estruturada. Abstrai o
 * Vercel AI SDK — o domínio depende DESTA porta, não do SDK.
 *
 * Difere de IAIProvider.completeWithTool (uma chamada forçada, usada pela visão):
 * aqui há um LOOP e tools executáveis. Por isso é uma porta separada, e a visão
 * segue na porta antiga sem arrastar o AI SDK.
 */
export interface AgentTool extends AITool {
  /** Executada pelo motor quando o modelo chama a tool; o retorno volta ao modelo. */
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentEngineOptions {
  model: string;
  messages: AIMessage[];
  /** Tools de negócio disponíveis no loop (pode ser vazio). */
  tools: AgentTool[];
  /** Tool terminal (sem execute) que carrega a resposta estruturada — ex.: PROPOSE_NEXT. */
  answerTool: AITool;
  /** Teto de passos do loop (segurança + latência). */
  maxSteps: number;
}

export interface AgentEngineResult {
  /** Args da answer tool (ex.: { reply, action, extracted }); {} se o modelo respondeu em texto puro. */
  answer: Record<string, unknown>;
  /** Texto final do assistente — fallback quando a answer tool não foi chamada. */
  text: string;
  /** Auditoria das tools de NEGÓCIO chamadas no loop (não inclui a answer tool). */
  toolCalls: { name: string; arguments: Record<string, unknown> }[];
}

export interface IAgentEngine {
  run(options: AgentEngineOptions): Promise<AgentEngineResult>;
}
