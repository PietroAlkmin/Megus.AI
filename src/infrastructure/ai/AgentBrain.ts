import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { AITool } from "../../domain/ports/IAIProvider";
import type { AgentTool, IAgentEngine } from "../../domain/ports/IAgentEngine";
import { composePrompt } from "../../application/agent/PromptComposer";

const PROPOSE_NEXT: AITool = {
  name: "propose_next",
  description: "Responde o cliente e propõe a próxima ação. NUNCA emite nota — só propõe.",
  parameters: {
    type: "object",
    properties: {
      reply: { type: "array", items: { type: "string" }, description: "Bolhas de texto em PT-BR para o cliente." },
      action: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "reply",
              "answer_question",
              "quote_price",
              "smalltalk",
              "provide_identity",
              "intent_emit",
              "request_comprovante",
              "handoff",
            ],
          },
          reason: { type: "string" },
        },
        required: ["type"],
      },
      extracted: { type: "object", properties: { fullName: { type: "string" }, cpf: { type: "string" }, amount: { type: "number" } } },
    },
    required: ["reply", "action"],
  },
};

/**
 * Cérebro do Kaua — AGNÓSTICO de provedor. Roda um LOOP de tools via IAgentEngine
 * (o modelo pode chamar tools de negócio; PROPOSE_NEXT é a tool terminal que carrega
 * a resposta estruturada). O modelo e as tools são injetados; o prompt vem do
 * PromptComposer (puro). As tools de negócio entram POR CIMA do prompt/persona atuais.
 */
export class AgentBrain implements IAgentBrain {
  constructor(
    private readonly engine: IAgentEngine,
    private readonly model: string,
    private readonly tools: AgentTool[] = [],
    private readonly maxSteps = 4,
  ) {}

  async decide(context: AgentContext): Promise<AgentDecision> {
    const messages = composePrompt(context);
    const r = await this.engine.run({ model: this.model, messages, tools: this.tools, answerTool: PROPOSE_NEXT, maxSteps: this.maxSteps });
    const a = r.answer as Partial<AgentDecision>;
    const reply = a.reply && a.reply.length > 0 ? a.reply : r.text ? [r.text] : [];
    return { reply, action: a.action ?? { type: "reply" }, extracted: a.extracted };
  }
}
