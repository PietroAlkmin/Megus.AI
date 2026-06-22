import { describe, expect, it } from "vitest";
import { buildNotaPdf } from "../../../src/infrastructure/http/notaPdf";

describe("buildNotaPdf", () => {
  it("gera um PDF bem-formado (header, conteúdo, xref, trailer)", () => {
    const pdf = buildNotaPdf();
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-1.")).toBe(true);
    expect(s).toContain("MEGUS AI");
    expect(s).toContain("startxref");
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("o offset da xref aponta para dentro do arquivo", () => {
    const s = buildNotaPdf().toString("latin1");
    const startxref = Number(s.match(/startxref\n(\d+)/)?.[1]);
    expect(startxref).toBeGreaterThan(0);
    expect(s.slice(startxref, startxref + 4)).toBe("xref");
  });
});
