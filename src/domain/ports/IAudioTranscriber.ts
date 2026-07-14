/**
 * Porta de TRANSCRIÇÃO de áudio (voz → texto).
 *
 * O voice note do paciente vira texto ANTES da lógica de negócio; o resto do
 * pipeline trata como mensagem digitada (universal, agnóstico a segmento). O
 * adapter real usa OpenAI (mesma chave da visão); o mock devolve texto fixo
 * (dev/testes). Trocar de provedor = nova implementação desta porta.
 */
export interface AudioToTranscribe {
  mimetype: string;
  base64: string;
}

export interface IAudioTranscriber {
  /** Transcreve o áudio para texto. Lança em erro de rede/modelo (o chamador trata). */
  transcribe(input: AudioToTranscribe): Promise<string>;
}
