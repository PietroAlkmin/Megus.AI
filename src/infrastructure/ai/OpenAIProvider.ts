import type {
  AICompleteOptions, AIMessage, AIToolCall, IAIProvider,
} from "../../domain/ports/IAIProvider";

/** Cliente OpenAI mínimo que usamos (injetável → testável sem rede). */
export interface OpenAiChatClient {
  chat: {
    completions: {
      create(args: unknown): Promise<{
        choices: { message: { tool_calls?: { function: { name: string; arguments: string } }[]; content?: string | null } }[];
      }>;
    };
  };
}

/**
 * Adapter OpenAI da porta IAIProvider. É o ÚNICO arquivo acoplado ao SDK da OpenAI.
 * Trocar de provedor = nova classe `XProvider implements IAIProvider`.
 */
export class OpenAIProvider implements IAIProvider {
  constructor(private readonly client: OpenAiChatClient) {}

  async completeWithTool(options: AICompleteOptions): Promise<AIToolCall> {
    const res = await this.client.chat.completions.create({
      model: options.model,
      messages: options.messages.map(toOpenAiMessage),
      tools: [{ type: "function", function: { name: options.tool.name, description: options.tool.description, parameters: options.tool.parameters } }],
      tool_choice: { type: "function", function: { name: options.tool.name } },
    });
    const call = res.choices[0]?.message.tool_calls?.[0];
    if (!call) return { name: options.tool.name, arguments: {} };
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments); } catch { args = {}; }
    return { name: call.function.name, arguments: args };
  }
}

function toOpenAiMessage(m: AIMessage): unknown {
  if (typeof m.content === "string") return { role: m.role, content: m.content };
  const content = m.content.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      // base64 em mãos VENCE a url: mídia do WhatsApp vem com url criptografada
      // (mmg.whatsapp.net) que a OpenAI não consegue baixar (invalid_image_url).
      : { type: "image_url", image_url: { url: p.base64 ? `data:${p.mimetype};base64,${p.base64}` : (p.url ?? "") } },
  );
  return { role: m.role, content };
}
