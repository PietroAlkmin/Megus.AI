import { describe, expect, it } from "vitest";
import { nameMatch } from "../../../src/domain/services/nameMatch";

describe("nameMatch", () => {
  it("bate ignorando acento e caixa", () => {
    expect(nameMatch("joao da silva", "João da Silva")).toBe(true);
  });
  it("tolera nome do meio ausente (subconjunto na ordem)", () => {
    expect(nameMatch("Maria Souza", "Maria Aparecida Souza")).toBe(true);
  });
  it("recusa quando sobrenome não bate", () => {
    expect(nameMatch("Maria Souza", "Maria Oliveira")).toBe(false);
  });
  it("recusa string vazia", () => {
    expect(nameMatch("", "João Silva")).toBe(false);
  });
});
