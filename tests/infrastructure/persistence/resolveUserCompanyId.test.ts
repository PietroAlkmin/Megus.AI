import { describe, expect, it } from "vitest";
import { resolveUserCompanyId } from "../../../src/infrastructure/persistence/prisma/resolveUserCompanyId";
import { DomainError } from "../../../src/domain/errors/DomainError";

describe("resolveUserCompanyId — sem fallback silencioso", () => {
  it("devolve o companyId da 1ª membership (mais antiga)", () => {
    expect(resolveUserCompanyId([{ companyId: "co-a" }, { companyId: "co-b" }])).toBe("co-a");
  });

  it("sem membership → LANÇA (invariante violada, não vira '')", () => {
    expect(() => resolveUserCompanyId([])).toThrow(DomainError);
  });

  it("companyId vazio na 1ª membership → também LANÇA", () => {
    expect(() => resolveUserCompanyId([{ companyId: "" }])).toThrow(DomainError);
  });
});
