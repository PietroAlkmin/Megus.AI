import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { VercelAgentEngine } from "../../../src/infrastructure/ai/VercelAgentEngine";
import { currentDateTimeTool } from "../../../src/infrastructure/ai/tools/currentDateTimeTool";
import type { AITool } from "../../../src/domain/ports/IAIProvider";

const ANSWER: AITool = {
  name: "propose_next",
  description: "Responde o cliente e propõe a próxima ação.",
  parameters: {
    type: "object",
    properties: { reply: { type: "array", items: { type: "string" } }, action: { type: "object", properties: { type: { type: "string" } } } },
    required: ["reply", "action"],
  },
};

const run = process.env.OPENAI_API_KEY ? describe : describe.skip;

run("VercelAgentEngine (ao vivo)", () => {
  it("o modelo chama a tool de data e conclui pela answer tool", async () => {
    const sdk = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const engine = new VercelAgentEngine(generateText as any, (id) => sdk(id));

    const r = await engine.run({
      model: process.env.AI_MODEL_CHAT ?? "gpt-5.4-mini",
      messages: [
        { role: "system", content: "Você é um atendente. Se perguntarem que dia é hoje, use a tool get_current_datetime antes de responder. Termine SEMPRE chamando propose_next com a resposta." },
        { role: "user", content: "Que dia é hoje?" },
      ],
      tools: [currentDateTimeTool],
      answerTool: ANSWER,
      maxSteps: 4,
    });

    expect(r.toolCalls.map((c) => c.name)).toContain("get_current_datetime");
    expect(Array.isArray(r.answer.reply) || r.text.length > 0).toBe(true);
  }, 30_000);
});
