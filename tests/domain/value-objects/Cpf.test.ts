import { describe, expect, it } from "vitest";
import { Cpf } from "../../../src/domain/value-objects/Cpf";

describe("Cpf", () => {
  it("aceita CPF válido e normaliza dígitos", () => {
    const cpf = Cpf.tryCreate("529.982.247-25");
    expect(cpf).not.toBeNull();
    expect(cpf?.digits).toBe("52998224725");
    expect(cpf?.format()).toBe("529.982.247-25");
  });

  it("rejeita dígito verificador inválido", () => {
    expect(Cpf.isValid("529.982.247-24")).toBe(false);
    expect(Cpf.tryCreate("11111111111")).toBeNull();
  });
});
