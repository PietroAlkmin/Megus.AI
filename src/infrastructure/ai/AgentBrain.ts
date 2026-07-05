import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { AITool, IAIProvider } from "../../domain/ports/IAIProvider";
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
 * Cérebro do Kaua — AGNÓSTICO de provedor (depende de IAIProvider, não da OpenAI).
 * O modelo é injetado (vem de env: AI_MODEL_CHAT). O prompt é montado pelo
 * PromptComposer (puro) a partir do AgentContext (persona/negócio/coletados).
 */
export class AgentBrain implements IAgentBrain {
  constructor(private readonly ai: IAIProvider, private readonly model: string) {}

  async decide(context: AgentContext): Promise<AgentDecision> {
    const messages = composePrompt(context);
    const call = await this.ai.completeWithTool({ model: this.model, messages, tool: PROPOSE_NEXT });
    const a = call.arguments as Partial<AgentDecision>;
    return { reply: a.reply ?? [], action: a.action ?? { type: "reply" }, extracted: a.extracted };
  }
}
