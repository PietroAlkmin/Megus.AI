import { describe, expect, it, vi } from "vitest";
import { AgentBrain } from "../../../src/infrastructure/ai/AgentBrain";
import type { IAIProvider } from "../../../src/domain/ports/IAIProvider";
import type { AgentContext } from "../../../src/domain/ports/IAgentBrain";

const EMPTY_CONTEXT: AgentContext = {
  systemInstructions: "x",
  state: "new",
  history: [],
  collected: {},
};

describe("AgentBrain", () => {
  it("repassa reply e action vindos da IA", async () => {
    const ai: IAIProvider = {
      completeWithTool: vi.fn(async () => ({
        name: "propose_next",
        arguments: {
          reply: ["Me manda nome e CPF"],
          action: { type: "request_identity" },
        },
      })),
    };
    const brain = new AgentBrain(ai, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual(["Me manda nome e CPF"]);
    expect(decision.action).toEqual({ type: "request_identity" });
    expect(decision.extracted).toBeUndefined();
  });

  it("repassa extracted quando a IA devolve dados coletados", async () => {
    const ai: IAIProvider = {
      completeWithTool: vi.fn(async () => ({
        name: "propose_next",
        arguments: {
          reply: ["Obrigado, João!"],
          action: { type: "reply" },
          extracted: { fullName: "João", cpf: "529.982.247-25" },
        },
      })),
    };
    const brain = new AgentBrain(ai, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.extracted?.fullName).toBe("João");
    expect(decision.extracted?.cpf).toBe("529.982.247-25");
  });

  it("usa fallbacks seguros quando a IA devolve campos ausentes", async () => {
    const ai: IAIProvider = {
      completeWithTool: vi.fn(async () => ({
        name: "propose_next",
        arguments: {}, // IA devolveu objeto vazio
      })),
    };
    const brain = new AgentBrain(ai, "gpt-4o");

    const decision = await brain.decide(EMPTY_CONTEXT);

    expect(decision.reply).toEqual([]);
    expect(decision.action).toEqual({ type: "reply" });
  });

  it("passa model e tool corretos para o provider", async () => {
    type SpyFn = (opts: import("../../../src/domain/ports/IAIProvider").AICompleteOptions) => Promise<import("../../../src/domain/ports/IAIProvider").AIToolCall>;
    const createSpy = vi.fn<SpyFn>(async () => ({
      name: "propose_next",
      arguments: { reply: [], action: { type: "reply" } },
    }));
    const ai: IAIProvider = { completeWithTool: createSpy };
    const brain = new AgentBrain(ai, "gpt-4o-mini");

    await brain.decide(EMPTY_CONTEXT);

    const call = createSpy.mock.calls[0];
    expect(call).toBeDefined();
    const opts = call![0];
    expect(opts?.model).toBe("gpt-4o-mini");
    expect(opts?.tool.name).toBe("propose_next");
  });

  it("inclui histórico de mensagens como user/assistant", async () => {
    type SpyFn = (opts: import("../../../src/domain/ports/IAIProvider").AICompleteOptions) => Promise<import("../../../src/domain/ports/IAIProvider").AIToolCall>;
    const createSpy = vi.fn<SpyFn>(async () => ({
      name: "propose_next",
      arguments: { reply: [], action: { type: "reply" } },
    }));
    const ai: IAIProvider = { completeWithTool: createSpy };
    const brain = new AgentBrain(ai, "gpt-4o");

    const ctx: AgentContext = {
      systemInstructions: "instrução",
      state: "collecting_identity",
      history: [
        { id: "m1", conversationId: "c1", direction: "inbound" as const, author: "contact", body: "Oi", kind: "text", createdAt: new Date(), mediaUrl: null },
        { id: "m2", conversationId: "c1", direction: "outbound" as const, author: "agent", body: "Olá!", kind: "text", createdAt: new Date(), mediaUrl: null },
      ],
      collected: {},
    };

    await brain.decide(ctx);

    const call2 = createSpy.mock.calls[0];
    expect(call2).toBeDefined();
    const opts = call2![0];
    // system + 2 history messages
    expect(opts?.messages).toHaveLength(3);
    expect(opts?.messages[1]?.role).toBe("user");
    expect(opts?.messages[2]?.role).toBe("assistant");
  });
});
