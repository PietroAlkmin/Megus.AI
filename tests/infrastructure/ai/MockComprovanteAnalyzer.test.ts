import { describe, expect, it } from "vitest";
import { MockComprovanteAnalyzer } from "../../../src/infrastructure/ai/MockComprovanteAnalyzer";
import type { ComprovanteInput } from "../../../src/domain/ports/IComprovanteAnalyzer";

const INPUT: ComprovanteInput = {
  media: { mimetype: "image/jpeg", url: "http://x/fake.jpg" },
  expectedRecipientDoc: "66.008.326/0001-73",
  expectedRecipientName: "Consultório",
};

describe("MockComprovanteAnalyzer", () => {
  it("auto-aprova: recipientMatches=true, valor injetado e confiança 1 por padrão", async () => {
    const analyzer = new MockComprovanteAnalyzer({ amount: 180 });

    const result = await analyzer.analyze(INPUT);

    expect(result.recipientMatches).toBe(true);
    expect(result.amount).toBe(180);
    expect(result.confidence).toBe(1);
  });

  it("devolve o recebedor esperado só com dígitos (para casar no state machine)", async () => {
    const analyzer = new MockComprovanteAnalyzer({ amount: 180 });

    const result = await analyzer.analyze(INPUT);

    expect(result.recipientDoc).toBe("66008326000173");
  });

  it("respeita a confiança configurada", async () => {
    const analyzer = new MockComprovanteAnalyzer({ amount: 180, confidence: 0.5 });

    const result = await analyzer.analyze(INPUT);

    expect(result.confidence).toBe(0.5);
  });
});
