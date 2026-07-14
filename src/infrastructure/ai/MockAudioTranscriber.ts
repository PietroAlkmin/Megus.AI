import type { AudioToTranscribe, IAudioTranscriber } from "../../domain/ports/IAudioTranscriber";

/**
 * MOCK do transcritor — APENAS dev/testes (TRANSCRIBE_PROVIDER=mock). Devolve um
 * texto fixo, sem rede. NUNCA usar em produção: não "ouve" o áudio de verdade.
 */
export class MockAudioTranscriber implements IAudioTranscriber {
  constructor(private readonly fixedText: string = "transcrição simulada (mock)") {}

  async transcribe(_input: AudioToTranscribe): Promise<string> {
    return this.fixedText;
  }
}
