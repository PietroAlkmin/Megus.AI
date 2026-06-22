import { describe, expect, it, vi } from "vitest";
import { ComprovanteAnalyzer } from "../../../src/infrastructure/ai/ComprovanteAnalyzer";
import type { IAIProvider } from "../../../src/domain/ports/IAIProvider";
import type { ComprovanteInput } from "../../../src/domain/ports/IComprovanteAnalyzer";

const INPUT: ComprovanteInput = {
  media: { mimetype: "image/jpeg", base64: "AAAA" },
  expectedRecipientDoc: "12.345.678/0001-99",
  expectedRecipientName: "Consultório X",
};

function makeProvider(args: Record<string, unknown>): IAIProvider {
  return {
    completeWithTool: vi.fn(async () => ({
      name: "extract_receipt",
      arguments: args,
    })),
  };
}

describe("ComprovanteAnalyzer", () => {
  it("retorna amount, confidence e recipientMatches=true quando dígitos batem", async () => {
    const ai = makeProvider({
      amount: 300,
      payerName: "João",
      recipientDoc: "12345678000199",
      confidence: 0.9,
    });
    const analyzer = new ComprovanteAnalyzer(ai, "gpt-4o");

    const result = await analyzer.analyze(INPUT);

    expect(result.amount).toBe(300);
    expect(result.confidence).toBe(0.9);
    expect(result.recipientMatches).toBe(true);
    expect(result.payerName).toBe("João");
    expect(result.recipientDoc).toBe("12345678000199");
  });

  it("retorna recipientMatches=false quando CNPJ do recebedor difere", async () => {
    const ai = makeProvider({
      amount: 200,
      payerName: "Maria",
      recipientDoc: "99999999000199", // diferente do esperado
      confidence: 0.85,
    });
    const analyzer = new ComprovanteAnalyzer(ai, "gpt-4o");

    const result = await analyzer.analyze(INPUT);

    expect(result.recipientMatches).toBe(false);
  });

  it("retorna recipientMatches=false quando recipientDoc vem ausente", async () => {
    const ai = makeProvider({ confidence: 0.7 }); // sem recipientDoc
    const analyzer = new ComprovanteAnalyzer(ai, "gpt-4o");

    const result = await analyzer.analyze(INPUT);

    expect(result.recipientMatches).toBe(false);
    expect(result.recipientDoc).toBeNull();
  });

  it("usa fallbacks nulos/zero quando IA não preenche campos opcionais", async () => {
    const ai = makeProvider({ confidence: 0.3 });
    const analyzer = new ComprovanteAnalyzer(ai, "gpt-4o");

    const result = await analyzer.analyze(INPUT);

    expect(result.amount).toBeNull();
    expect(result.payerName).toBeNull();
    expect(result.confidence).toBe(0.3);
  });

  it("compara SÓ dígitos: formato com máscara vs sem máscara batem", async () => {
    // expectedRecipientDoc tem máscara; recipientDoc da IA vem só com dígitos
    const ai = makeProvider({
      recipientDoc: "12345678000199", // só dígitos
      confidence: 0.95,
    });
    const analyzer = new ComprovanteAnalyzer(ai, "gpt-4o");

    const result = await analyzer.analyze({
      ...INPUT,
      expectedRecipientDoc: "12.345.678/0001-99", // com máscara
    });

    expect(result.recipientMatches).toBe(true);
  });

  it("passa a imagem como parte image na mensagem user", async () => {
    type SpyFn = (opts: import("../../../src/domain/ports/IAIProvider").AICompleteOptions) => Promise<import("../../../src/domain/ports/IAIProvider").AIToolCall>;
    const createSpy = vi.fn<SpyFn>(async () => ({
      name: "extract_receipt",
      arguments: { confidence: 0.8 },
    }));
    const ai: IAIProvider = { completeWithTool: createSpy };
    const analyzer = new ComprovanteAnalyzer(ai, "gpt-4o");

    await analyzer.analyze(INPUT);

    const call = createSpy.mock.calls[0];
    expect(call).toBeDefined();
    const opts = call![0];
    const userMessage = opts?.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();
    const content = Array.isArray(userMessage?.content) ? userMessage.content : [];
    const imagePart = content.find((p) => p.type === "image");
    expect(imagePart).toBeDefined();
    if (imagePart?.type === "image") {
      expect(imagePart.mimetype).toBe("image/jpeg");
      expect(imagePart.base64).toBe("AAAA");
    }
  });
});
