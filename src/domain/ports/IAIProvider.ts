/**
 * Porta do PROVEDOR de IA (LLM). Abstrai o fornecedor: OpenAI hoje →
 * Anthropic/Gemini/qualquer um depois, trocando UMA implementação.
 *
 * Os adapters de cérebro (AgentBrain) e visão (ComprovanteAnalyzer) dependem
 * DESTA porta, não de um SDK específico. O modelo é parâmetro (vem por env).
 */
export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimetype: string; base64?: string; url?: string };

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string | AIContentPart[];
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface AICompleteOptions {
  model: string;
  messages: AIMessage[];
  /** Força a chamada desta tool → saída estruturada (structured output). */
  tool: AITool;
}

export interface AIToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface IAIProvider {
  /** Chama o LLM forçando a tool e devolve os argumentos parseados. */
  completeWithTool(options: AICompleteOptions): Promise<AIToolCall>;
}
