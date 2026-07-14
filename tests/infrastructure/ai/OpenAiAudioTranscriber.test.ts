import { describe, expect, it, vi } from "vitest";
import { OpenAiAudioTranscriber } from "../../../src/infrastructure/ai/OpenAiAudioTranscriber";
import type { OpenAiAudioClient } from "../../../src/infrastructure/ai/OpenAiAudioTranscriber";

function makeClient(text: unknown): { client: OpenAiAudioClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async () => ({ text }) as { text: string });
  return { client: { audio: { transcriptions: { create } } }, create };
}

describe("OpenAiAudioTranscriber", () => {
  it("base64 → buffer, chama create com o modelo e um file, devolve o texto (trim)", async () => {
    const { client, create } = makeClient("  Olá, quero marcar uma consulta  ");
    const t = new OpenAiAudioTranscriber(client, "gpt-4o-transcribe");

    const out = await t.transcribe({
      mimetype: "audio/ogg; codecs=opus",
      base64: Buffer.from("bytes-de-audio-opus").toString("base64"),
    });

    expect(out).toBe("Olá, quero marcar uma consulta");
    const arg = create.mock.calls[0]![0] as { model: string; file: unknown };
    expect(arg.model).toBe("gpt-4o-transcribe");
    expect(arg.file).toBeDefined();
  });

  it("text vazio/undefined → devolve string vazia (chamador trata como 'não ouvi')", async () => {
    const { client } = makeClient(undefined);
    const t = new OpenAiAudioTranscriber(client, "whisper-1");
    expect(await t.transcribe({ mimetype: "audio/ogg", base64: "AAAA" })).toBe("");
  });
});
