import { describe, it, expect } from "vitest";
import { composePrompt } from "../../../src/application/agent/PromptComposer";
import type { AgentContext } from "../../../src/domain/ports/IAgentBrain";

function ctx(over: Partial<AgentContext> = {}): AgentContext {
  return {
    persona: { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "Seja gentil.", fewShotDialogs: [] },
    business: { companyName: "Clínica X", services: [{ description: "Massagem", price: 180, emissivel: true }, { description: "Consulta", price: 250, emissivel: false }] },
    state: "new", history: [], collected: { cpfNameVerified: false, fullNameMasked: null, cpfMasked: null, emissionStatus: null }, today: "sábado, 5 de julho de 2026",
    ...over,
  };
}
describe("composePrompt", () => {
  it("system carrega nome, empresa, catálogo com preços e a data", () => {
    const msgs = composePrompt(ctx());
    expect(msgs[0]!.role).toBe("system");
    const sys = msgs[0]!.content as string;
    expect(sys).toContain("Kaua");
    expect(sys).toContain("Clínica X");
    expect(sys).toContain("Massagem");
    expect(sys).toContain("180");
    expect(sys).toContain("2026");
  });
  it("tom/emojis/idioma mudam o system (snapshot por config)", () => {
    const formalNoEmoji = composePrompt(ctx({ persona: { ...ctx().persona, tone: "formal", emojis: false, lang: "en" } }))[0]!.content as string;
    expect(formalNoEmoji).toContain("senhor");
    expect(formalNoEmoji.toLowerCase()).toContain("não use emoji");
  });
  it("few-shot entra como pares user/assistant antes do histórico", () => {
    const msgs = composePrompt(ctx({ persona: { ...ctx().persona, fewShotDialogs: [{ q: "oi", a: "olá!" }] } }));
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toBe("oi");
    expect(msgs[2]!.role).toBe("assistant");
    expect(msgs[2]!.content).toBe("olá!");
  });
  it("regra fiscal está no system (nunca dizer que emitiu)", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).toMatch(/nunca diga que emitiu/i);
  });
});
