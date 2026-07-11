import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { AITool } from "../../domain/ports/IAIProvider";
import type { AgentTool, IAgentEngine } from "../../domain/ports/IAgentEngine";
import { BOOKING_TOOL_NAME, type AgentToolset, type IAgentToolsProvider } from "../../domain/ports/IAgentToolsProvider";
import { composePrompt } from "../../application/agent/PromptComposer";

const EMPTY_TOOLSET: AgentToolset = { nativeTools: {}, infos: [] };

/** Resposta do gate de identidade (Task 3, Plano 7) — o stub que substitui o
 *  execute real da tool de marcar evento enquanto o contato não tem CPF↔nome
 *  validado. Guia o modelo a pedir a identidade antes de tentar de novo. */
const IDENTIDADE_PENDENTE = {
  error: "IDENTIDADE_PENDENTE",
  instrucao: "Antes de marcar, peça o nome completo e o CPF do cliente e aguarde a validação do cadastro.",
} as const;

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
    // O gate foi aplicado? (não-verificado E a tool de marcar existe no toolset)
    // — guardado ANTES do run: se sim, o stub pode ter sido "chamado" pelo modelo
    // e o ai@7 lista essa chamada BLOQUEADA em toolResults com o mesmo nome de uma
    // marcação real (o stub devolve o erro como resultado, não lança). Quem sabe
    // do gate é o brain — filtra abaixo, e a SM confia: resultado de marcar
    // presente = evento REAL criado (senão nasceria Charge fantasma).
    const gated = !context.collected.cpfNameVerified && BOOKING_TOOL_NAME in dynamic.nativeTools;
    const nativeTools = this.gateBookingTool(dynamic.nativeTools, context.collected.cpfNameVerified);

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
      nativeTools,
      answerTool: PROPOSE_NEXT,
      maxSteps: this.maxSteps,
    });
    const a = r.answer as Partial<AgentDecision>;
    const reply = a.reply && a.reply.length > 0 ? a.reply : r.text ? [r.text] : [];
    const toolResults = gated ? r.toolResults?.filter((t) => t.name !== BOOKING_TOOL_NAME) : r.toolResults;
    return { reply, action: a.action ?? { type: "reply" }, extracted: a.extracted, toolResults };
  }

  /**
   * Gate de IDENTIDADE por CÓDIGO (não confiança no modelo/prompt) — Task 3,
   * Plano 7: sem `cpfNameVerified`, a tool de marcar evento (nativeTool
   * dinâmica, ex. Composio→Google Calendar) é substituída por um stub que
   * NUNCA chama o `execute` original (o evento real de calendário só é criado
   * depois que o cadastro foi validado). Spread do objeto tool original
   * preserva `description`/`inputSchema` (o modelo continua "vendo" a tool
   * normalmente, só o `execute` muda) — não importa nada de `@composio/*` aqui,
   * `nativeTools` é opaco (`Record<string, unknown>`) por design da porta.
   * Verificado: retorna o MESMO objeto/record (referência) quando não há nada
   * a substituir (verified=true, ou a tool nem está no toolset da empresa).
   */
  private gateBookingTool(nativeTools: Record<string, unknown>, cpfNameVerified: boolean): Record<string, unknown> {
    if (cpfNameVerified) return nativeTools;
    const original = nativeTools[BOOKING_TOOL_NAME];
    if (!original) return nativeTools;
    return {
      ...nativeTools,
      [BOOKING_TOOL_NAME]: { ...(original as object), execute: async () => IDENTIDADE_PENDENTE },
    };
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
