import { describe, expect, it } from "vitest";
import { MockAudioTranscriber } from "../../../src/infrastructure/ai/MockAudioTranscriber";

describe("MockAudioTranscriber", () => {
  it("devolve o texto configurado", async () => {
    const t = new MockAudioTranscriber("meu nome é João da Silva, CPF 111");
    expect(await t.transcribe({ mimetype: "audio/ogg", base64: "AAAA" })).toBe("meu nome é João da Silva, CPF 111");
  });

  it("tem um default não-vazio quando não configurado", async () => {
    const t = new MockAudioTranscriber();
    const out = await t.transcribe({ mimetype: "audio/ogg", base64: "AAAA" });
    expect(out.length).toBeGreaterThan(0);
  });
});
