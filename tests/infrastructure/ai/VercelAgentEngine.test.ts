import { describe, expect, it, vi } from "vitest";
import { VercelAgentEngine } from "../../../src/infrastructure/ai/VercelAgentEngine";
import type { SdkGenerateText } from "../../../src/infrastructure/ai/VercelAgentEngine";
import type { AITool } from "../../../src/domain/ports/IAIProvider";
import type { AgentTool, AgentEngineOptions } from "../../../src/domain/ports/IAgentEngine";

const ANSWER_TOOL: AITool = {
  name: "propose_next",
  description: "Responde e propõe a próxima ação.",
  parameters: { type: "object", properties: { reply: { type: "array", items: { type: "string" } } } },
};

const BASE_OPTS: AgentEngineOptions = {
  model: "gpt-5.4-mini",
  messages: [{ role: "system", content: "Você é o Kaua." }],
  tools: [],
  answerTool: ANSWER_TOOL,
  maxSteps: 4,
};

describe("VercelAgentEngine", () => {
  it("mapeia a chamada da answer tool para answer + text", async () => {
    const generate = vi.fn(async () => ({
      text: "Oi!",
      toolCalls: [{ toolName: "propose_next", input: { reply: ["Oi!"], action: { type: "reply" } } }],
      steps: [{ toolCalls: [{ toolName: "propose_next", input: { reply: ["Oi!"], action: { type: "reply" } } }] }],
    })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);

    const r = await engine.run(BASE_OPTS);

    expect(r.answer).toEqual({ reply: ["Oi!"], action: { type: "reply" } });
    expect(r.text).toBe("Oi!");
  });

  it("audita as tools de negócio chamadas no loop", async () => {
    const generate = vi.fn(async () => ({
      text: "",
      toolCalls: [
        { toolName: "get_current_datetime", input: {} },
        { toolName: "propose_next", input: { reply: ["Hoje é sexta."] } },
      ],
      steps: [],
    })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);

    const r = await engine.run(BASE_OPTS);

    // exato (não só toContain): trava o contrato "a answer tool NÃO entra na auditoria".
    expect(r.toolCalls.map((c) => c.name)).toEqual(["get_current_datetime"]);
    expect(r.answer).toEqual({ reply: ["Hoje é sexta."] });
  });

  it("sem answer tool, cai no texto puro do modelo", async () => {
    const generate = vi.fn(async () => ({ text: "Resposta livre.", toolCalls: [], steps: [] })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);

    const r = await engine.run(BASE_OPTS);

    expect(r.answer).toEqual({});
    expect(r.text).toBe("Resposta livre.");
  });

  it("passa a answer tool e as de negócio para o generate, com o model resolvido", async () => {
    const generate = vi.fn(async () => ({ text: "", toolCalls: [], steps: [] })) as unknown as SdkGenerateText;
    const modelFactory = vi.fn((id: string) => `model:${id}`);
    const engine = new VercelAgentEngine(generate, modelFactory);
    const bizTool: AgentTool = { name: "get_current_datetime", description: "x", parameters: { type: "object", properties: {} }, execute: async () => ({}) };

    await engine.run({ ...BASE_OPTS, tools: [bizTool] });

    expect(modelFactory).toHaveBeenCalledWith("gpt-5.4-mini");
    const arg = (generate as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0]![0];
    expect(arg.model).toBe("model:gpt-5.4-mini");
    expect(Object.keys(arg.tools as object).sort()).toEqual(["get_current_datetime", "propose_next"]);
  });
});
