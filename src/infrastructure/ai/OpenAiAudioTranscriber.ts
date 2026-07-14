import { toFile } from "openai";
import type { AudioToTranscribe, IAudioTranscriber } from "../../domain/ports/IAudioTranscriber";

/** Cliente OpenAI mínimo de transcrição que usamos (injetável → testável sem rede). */
export interface OpenAiAudioClient {
  audio: { transcriptions: { create(args: unknown): Promise<{ text: string }> } };
}

/**
 * Adapter OpenAI da porta IAudioTranscriber. É o ÚNICO arquivo acoplado ao
 * endpoint audio.transcriptions da OpenAI. Modelo injetado (env: AI_MODEL_TRANSCRIBE).
 * Trocar de provedor = nova classe `XTranscriber implements IAudioTranscriber`.
 */
export class OpenAiAudioTranscriber implements IAudioTranscriber {
  constructor(private readonly client: OpenAiAudioClient, private readonly model: string) {}

  async transcribe(input: AudioToTranscribe): Promise<string> {
    const buffer = Buffer.from(input.base64, "base64");
    // nome/type derivam do mimetype real do webhook (ex.: "audio/ogg; codecs=opus")
    const file = await toFile(buffer, "audio.ogg", { type: input.mimetype });
    const res = await this.client.audio.transcriptions.create({ file, model: this.model });
    return (res.text ?? "").trim();
  }
}
