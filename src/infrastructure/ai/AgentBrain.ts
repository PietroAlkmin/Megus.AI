import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { AIMessage, AITool, IAIProvider } from "../../domain/ports/IAIProvider";

const PROPOSE_NEXT: AITool = {
  name: "propose_next",
  description: "Responde o cliente e propõe a próxima ação. NUNCA emite nota — só propõe.",
  parameters: {
    type: "object",
    properties: {
      reply: { type: "array", items: { type: "string" }, description: "Bolhas de texto em PT-BR para o cliente." },
      action: {
        type: "object",
        properties: { type: { type: "string", enum: ["reply", "request_identity", "request_comprovante", "ready_to_emit", "handoff"] }, reason: { type: "string" } },
        required: ["type"],
      },
      extracted: { type: "object", properties: { fullName: { type: "string" }, cpf: { type: "string" }, amount: { type: "number" } } },
    },
    required: ["reply", "action"],
  },
};

/**
 * Cérebro do Kaua — AGNÓSTICO de provedor (depende de IAIProvider, não da OpenAI).
 * O modelo é injetado (vem de env: AI_MODEL_CHAT).
 */
export class AgentBrain implements IAgentBrain {
  constructor(private readonly ai: IAIProvider, private readonly model: string) {}

  async decide(context: AgentContext): Promise<AgentDecision> {
    const system =
      `${context.systemInstructions}\nVocê é o Kaua, atendente de WhatsApp. Estado atual: ${context.state}. ` +
      `Responda em PT-BR, curto. Quando o cliente quiser a nota fiscal, use action "request_identity" e peça nome completo + CPF. ` +
      `Ao receber nome e CPF, devolva-os em "extracted". NUNCA diga que emitiu a nota — quem emite é o sistema.`;
    const messages: AIMessage[] = [
      { role: "system", content: system },
      ...context.history.map((m) => ({
        role: (m.author === "contact" ? "user" : "assistant") as AIMessage["role"],
        content: m.body,
      })),
    ];
    const call = await this.ai.completeWithTool({ model: this.model, messages, tool: PROPOSE_NEXT });
    const a = call.arguments as Partial<AgentDecision>;
    return { reply: a.reply ?? [], action: a.action ?? { type: "reply" }, extracted: a.extracted };
  }
}
