import { describe, expect, it } from "vitest";
import { pilotIntegrationUpdate } from "../../../src/infrastructure/persistence/pilotIntegration";

describe("pilotIntegrationUpdate — sem número fake", () => {
  const now = new Date("2026-07-10T00:00:00Z");

  it("com número → grava whatsappNumber (aponta o piloto pro chip)", () => {
    const u = pilotIntegrationUpdate("5512997843384", now);
    expect(u.whatsappNumber).toBe("5512997843384");
    expect(u.evolutionInstance).toBe("Megus");
    expect(u.updatedAt).toBe(now);
  });

  it("sem número (undefined) → NÃO inclui whatsappNumber (preserva o do banco, nunca inventa)", () => {
    const u = pilotIntegrationUpdate(undefined, now);
    expect("whatsappNumber" in u).toBe(false);
    expect(u.evolutionInstance).toBe("Megus");
  });

  it("número vazio ('') → também NÃO grava (nunca sobrescreve com vazio)", () => {
    const u = pilotIntegrationUpdate("", now);
    expect("whatsappNumber" in u).toBe(false);
  });
});
