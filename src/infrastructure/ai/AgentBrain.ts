import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { AITool } from "../../domain/ports/IAIProvider";
import type { AgentTool, IAgentEngine } from "../../domain/ports/IAgentEngine";
import type { AgentToolset, IAgentToolsProvider } from "../../domain/ports/IAgentToolsProvider";
import { composePrompt } from "../../application/agent/PromptComposer";

const EMPTY_TOOLSET: AgentToolset = { nativeTools: {}, infos: [] };

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
    /** Tools DINÂMICAS por empresa (Fase B — Composio/Calendar). Opcional: sem
     *  provider (piloto sem COMPOSIO_API_KEY), o comportamento é o de antes. */
    private readonly toolsProvider?: IAgentToolsProvider,
  ) {}

  async decide(context: AgentContext): Promise<AgentDecision> {
    const dynamic = await this.resolveDynamicTools(context.companyId);

    // As tools entram no system como lista declarativa (nome+descrição) — o
    // modelo só chama o que conhece; sem anunciar, ele responde direto e inventa
    // (bug "00:00" de 11/07). O composer segue agnóstico: recebe a lista pronta
    // (estáticas do construtor + dinâmicas da empresa, quando houver).
    const messages = composePrompt(context, [
      ...this.tools.map((t) => ({ name: t.name, description: t.description })),
      ...dynamic.infos,
    ]);
    const r = await this.engine.run({
      model: this.model,
      messages,
      tools: this.tools,
      nativeTools: dynamic.nativeTools,
      answerTool: PROPOSE_NEXT,
      maxSteps: this.maxSteps,
    });
    const a = r.answer as Partial<AgentDecision>;
    const reply = a.reply && a.reply.length > 0 ? a.reply : r.text ? [r.text] : [];
    return { reply, action: a.action ?? { type: "reply" }, extracted: a.extracted };
  }

  /**
   * Toolset dinâmico da empresa — fail-safe redundante ao do próprio provider
   * (Composio já não lança; isto cobre qualquer IAgentToolsProvider futuro que
   * lance). A conversa do Kaua NUNCA quebra por causa de uma ferramenta externa.
   */
  private async resolveDynamicTools(companyId: string): Promise<AgentToolset> {
    if (!this.toolsProvider) return EMPTY_TOOLSET;
    try {
      return await this.toolsProvider.forCompany(companyId);
    } catch (err) {
      console.warn(`[composio] tools indisponiveis p/ empresa ${companyId}:`, err instanceof Error ? err.message : err);
      return EMPTY_TOOLSET;
    }
  }
}
