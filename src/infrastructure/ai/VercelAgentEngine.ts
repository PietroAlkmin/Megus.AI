import { tool, jsonSchema, stepCountIs } from "ai";
import type { AIContentPart, AIMessage } from "../../domain/ports/IAIProvider";
import type { AgentEngineOptions, AgentEngineResult, IAgentEngine } from "../../domain/ports/IAgentEngine";

/**
 * Fatia MÍNIMA do generateText do Vercel AI SDK que usamos (injetável → testável
 * sem rede, no mesmo padrão do OpenAiChatClient). Só lemos text/toolCalls; o loop
 * de re-prompt após cada tool é responsabilidade do SDK (coberto pelo smoke ao vivo).
 * ATENÇÃO: `input` é o campo dos args da tool-call no SDK v5+ — confirmado no Step 2
 * contra `ai@7.0.19` (node_modules/ai/dist/index.d.ts: StaticToolCall/DynamicToolCall).
 */
export interface SdkGenerateText {
  (args: {
    model: unknown;
    messages: unknown;
    tools: Record<string, unknown>;
    stopWhen: unknown;
  }): Promise<{
    text: string;
    toolCalls: { toolName: string; input: unknown }[];
  }>;
}

/**
 * Adapter do Vercel AI SDK para a porta IAgentEngine. É o ÚNICO arquivo acoplado
 * ao SDK `ai`/`@ai-sdk/openai`. Traduz nossos tipos → params do SDK, chama o loop,
 * e traduz o resultado de volta. O `generate` e a `modelFactory` são injetados.
 */
export class VercelAgentEngine implements IAgentEngine {
  constructor(
    private readonly generate: SdkGenerateText,
    private readonly modelFactory: (id: string) => unknown,
  ) {}

  async run(options: AgentEngineOptions): Promise<AgentEngineResult> {
    // Tools de negócio (com execute) + a answer tool (SEM execute → o SDK devolve o
    // controle quando o modelo a chama; é assim que encerramos o loop com saída
    // estruturada). stepCountIs(maxSteps) é o teto de segurança.
    const tools: Record<string, unknown> = {};
    for (const t of options.tools) {
      tools[t.name] = tool({
        description: t.description,
        inputSchema: jsonSchema(t.parameters),
        execute: async (input: unknown) => t.execute((input ?? {}) as Record<string, unknown>),
      });
    }
    tools[options.answerTool.name] = tool({
      description: options.answerTool.description,
      inputSchema: jsonSchema(options.answerTool.parameters),
    });

    const res = await this.generate({
      model: this.modelFactory(options.model),
      messages: options.messages.map(toSdkMessage),
      tools,
      stopWhen: stepCountIs(options.maxSteps),
    });

    const calls = (res.toolCalls ?? []).map((c) => ({
      name: c.toolName,
      arguments: (c.input ?? {}) as Record<string, unknown>,
    }));
    const answerCall = calls.find((c) => c.name === options.answerTool.name);
    const businessCalls = calls.filter((c) => c.name !== options.answerTool.name);

    return {
      answer: answerCall?.arguments ?? {},
      text: res.text ?? "",
      toolCalls: businessCalls,
    };
  }
}

/** AIMessage → formato de mensagem do AI SDK (texto ou multimodal). */
function toSdkMessage(m: AIMessage): unknown {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  const content = m.content.map((p: AIContentPart) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : { type: "image", image: p.url ?? `data:${p.mimetype};base64,${p.base64}` },
  );
  return { role: m.role, content };
}
