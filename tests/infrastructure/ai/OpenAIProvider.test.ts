import { describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../../../src/infrastructure/ai/OpenAIProvider";
import type { OpenAiChatClient } from "../../../src/infrastructure/ai/OpenAIProvider";
import type { AITool } from "../../../src/domain/ports/IAIProvider";

const TOOL: AITool = {
  name: "propose_next",
  description: "Propõe próxima ação",
  parameters: { type: "object", properties: {} },
};

function makeClient(toolCallArgs: string | undefined): OpenAiChatClient {
  const tool_calls = toolCallArgs !== undefined
    ? [{ function: { name: TOOL.name, arguments: toolCallArgs } }]
    : undefined;
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { tool_calls, content: null } }],
        })),
      },
    },
  };
}

describe("OpenAIProvider", () => {
  it("mapeia tool_call bem-formada para AIToolCall com arguments parseados", async () => {
    const payload = { reply: ["oi"], action: { type: "reply" } };
    const client = makeClient(JSON.stringify(payload));
    const provider = new OpenAIProvider(client);

    const result = await provider.completeWithTool({
      model: "gpt-4o",
      messages: [{ role: "user", content: "oi" }],
      tool: TOOL,
    });

    expect(result.name).toBe("propose_next");
    expect(result.arguments).toEqual(payload);
  });

  it("retorna arguments vazio quando tool_calls ausente/vazio", async () => {
    const client = makeClient(undefined);
    const provider = new OpenAIProvider(client);

    const result = await provider.completeWithTool({
      model: "gpt-4o",
      messages: [{ role: "user", content: "oi" }],
      tool: TOOL,
    });

    expect(result.name).toBe(TOOL.name);
    expect(result.arguments).toEqual({});
  });

  it("retorna arguments vazio quando arguments é JSON inválido", async () => {
    const client = makeClient("<<<not json>>>");
    const provider = new OpenAIProvider(client);

    const result = await provider.completeWithTool({
      model: "gpt-4o",
      messages: [{ role: "user", content: "oi" }],
      tool: TOOL,
    });

    expect(result.arguments).toEqual({});
  });

  it("converte mensagem com parte image para image_url com data URL", async () => {
    const client = makeClient(JSON.stringify({}));
    const createSpy = client.chat.completions.create as ReturnType<typeof vi.fn>;
    const provider = new OpenAIProvider(client);

    await provider.completeWithTool({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "veja:" },
            { type: "image", mimetype: "image/jpeg", base64: "AAAA" },
          ],
        },
      ],
      tool: TOOL,
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArg = createSpy.mock.calls[0]?.[0] as {
      messages: { role: string; content: { type: string; image_url?: { url: string } }[] }[];
    };
    const userMessage = callArg.messages[0];
    expect(userMessage).toBeDefined();
    const imagePart = userMessage?.content[1];
    expect(imagePart?.type).toBe("image_url");
    expect(imagePart?.image_url?.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("image com base64 E url → o base64 (data URI) VENCE — url de mídia do WhatsApp é criptografada e a OpenAI não baixa (invalid_image_url, prod 12/07)", async () => {
    const client = makeClient(JSON.stringify({}));
    const createSpy = client.chat.completions.create as ReturnType<typeof vi.fn>;
    const provider = new OpenAIProvider(client);

    await provider.completeWithTool({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimetype: "image/jpeg", base64: "BBBB", url: "https://mmg.whatsapp.net/enc/blob" },
          ],
        },
      ],
      tool: TOOL,
    });

    const args = createSpy.mock.calls[0]![0] as {
      messages: { content: { type: string; image_url?: { url: string } }[] }[];
    };
    const imagePart = args.messages[0]!.content.find((p) => p.type === "image_url");
    expect(imagePart?.image_url?.url).toBe("data:image/jpeg;base64,BBBB");
  });

  it("converte mensagem com parte image que já tem url para image_url com url original", async () => {
    const client = makeClient(JSON.stringify({}));
    const createSpy = client.chat.completions.create as ReturnType<typeof vi.fn>;
    const provider = new OpenAIProvider(client);

    await provider.completeWithTool({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", mimetype: "image/png", url: "https://example.com/img.png" },
          ],
        },
      ],
      tool: TOOL,
    });

    const callArg = createSpy.mock.calls[0]?.[0] as {
      messages: { role: string; content: { type: string; image_url?: { url: string } }[] }[];
    };
    const imagePart = callArg.messages[0]?.content[0];
    expect(imagePart?.type).toBe("image_url");
    expect(imagePart?.image_url?.url).toBe("https://example.com/img.png");
  });
});
