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

  it("toolResults: devolve os resultados das tools de NEGÓCIO mapeados {name, output} — exclui a answer tool por segurança", async () => {
    const generate = vi.fn(async () => ({
      text: "",
      toolCalls: [
        { toolName: "GOOGLECALENDAR_CREATE_EVENT", input: {} },
        { toolName: "propose_next", input: { reply: ["Marcado!"], action: { type: "reply" } } },
      ],
      // a answer tool NÃO tem execute (ver VercelAgentEngine.run) — na prática o SDK
      // nunca a devolveria aqui, mas o fake simula essa entrada de propósito pra
      // travar o filtro defensivo ("filtrar por segurança", ver comentário do adapter).
      toolResults: [
        { toolName: "GOOGLECALENDAR_CREATE_EVENT", output: { data: { response_data: { id: "evt-123" } } } },
        { toolName: "propose_next", output: { reply: ["Marcado!"], action: { type: "reply" } } },
      ],
    })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);

    const r = await engine.run(BASE_OPTS);

    expect(r.toolResults).toEqual([
      { name: "GOOGLECALENDAR_CREATE_EVENT", output: { data: { response_data: { id: "evt-123" } } } },
    ]);
  });

  it("toolResults: sem chamadas de tool, devolve array vazio (nunca undefined)", async () => {
    const generate = vi.fn(async () => ({ text: "oi", toolCalls: [], toolResults: [] })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);

    const r = await engine.run(BASE_OPTS);

    expect(r.toolResults).toEqual([]);
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

  it("nativeTools (Composio/etc.) entram no record de tools do SDK junto das nossas", async () => {
    const generate = vi.fn(async () => ({ text: "", toolCalls: [], steps: [] })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);
    const bizTool: AgentTool = { name: "get_current_datetime", description: "x", parameters: { type: "object", properties: {} }, execute: async () => ({}) };

    await engine.run({ ...BASE_OPTS, tools: [bizTool], nativeTools: { X_TOOL: {} } });

    const arg = (generate as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0]![0];
    expect(Object.keys(arg.tools as object).sort()).toEqual(["X_TOOL", "get_current_datetime", "propose_next"]);
  });

  it("colisão de nome: nossa answer tool prevalece sobre a nativeTool de mesmo nome", async () => {
    const generate = vi.fn(async () => ({ text: "", toolCalls: [], steps: [] })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);
    const nativeStub = { fake: "composio-tool" }; // stand-in por uma tool nativa do SDK do motor

    // colidente + não-colidente na MESMA chamada: distingue "nossa prevalece"
    // de "nativeTools ignoradas por inteiro" (X_TOOL tem que sobreviver).
    await engine.run({ ...BASE_OPTS, nativeTools: { propose_next: nativeStub, X_TOOL: {} } });

    const arg = (generate as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0]![0];
    expect((arg.tools as Record<string, unknown>).propose_next).not.toBe(nativeStub);
    expect(Object.keys(arg.tools as object)).toContain("X_TOOL");
  });

  it("system do composer vai em `instructions` — NUNCA como message (ai@7 rejeita em runtime)", async () => {
    // Regressão do InvalidPromptError visto em prod (11/07): "System messages are
    // not allowed in the prompt or messages fields. Use the instructions option instead."
    const generate = vi.fn(async () => ({ text: "", toolCalls: [], steps: [] })) as unknown as SdkGenerateText;
    const engine = new VercelAgentEngine(generate, (id) => id);

    await engine.run({
      ...BASE_OPTS,
      messages: [
        { role: "system", content: "Você é o Kaua." },
        { role: "user", content: "olá" },
      ],
    });

    const arg = (generate as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock.calls[0]![0];
    expect(arg.instructions).toBe("Você é o Kaua.");
    const roles = (arg.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).toEqual(["user"]); // nenhum system escapa pro messages
  });
});
