import type { ComprovanteAnalysis, ComprovanteInput, IComprovanteAnalyzer } from "../../domain/ports/IComprovanteAnalyzer";
import type { AITool, IAIProvider } from "../../domain/ports/IAIProvider";

const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");
const normalizePixKey = (s: string | null | undefined): string => (s ?? "")
  .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const EXTRACT_RECEIPT: AITool = {
  name: "extract_receipt",
  description: "Extrai dados do comprovante de pagamento (PIX/transferência).",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Valor pago em BRL" },
      payerName: { type: "string", description: "Nome de quem pagou" },
      recipientDoc: { type: "string", description: "CNPJ/CPF do recebedor (só dígitos)" },
      recipientPixKey: { type: "string", description: "Chave Pix do recebedor exibida no comprovante, exatamente como lida" },
      confidence: { type: "number", description: "0 a 1 — sua confiança na leitura" },
    },
    required: ["confidence"],
  },
};

/** Pausa antes da segunda tentativa — retry instantâneo tende a repetir o veredito. */
const RETRY_DELAY_MS = 600;

/**
 * Conferência de comprovante via visão — AGNÓSTICA de provedor (usa IAIProvider).
 * Modelo injetado (env: AI_MODEL_VISION). O cruzamento recebedor==prestador é
 * feito aqui (código), não pela IA.
 */
export class ComprovanteAnalyzer implements IComprovanteAnalyzer {
  constructor(private readonly ai: IAIProvider, private readonly model: string) {}

  async analyze(input: ComprovanteInput): Promise<ComprovanteAnalysis> {
    const call = await this.completeComRetry(input);
    const a = call.arguments as { amount?: number; payerName?: string; recipientDoc?: string; recipientPixKey?: string; confidence?: number };
    const recipientMatches =
      onlyDigits(a.recipientDoc) === onlyDigits(input.expectedRecipientDoc) && onlyDigits(a.recipientDoc).length > 0;
    const pixKeyMatches = input.expectedPixKey
      ? normalizePixKey(a.recipientPixKey) === normalizePixKey(input.expectedPixKey) && normalizePixKey(a.recipientPixKey).length > 0
      : false;
    return {
      amount: a.amount ?? null,
      payerName: a.payerName ?? null,
      recipientDoc: a.recipientDoc ?? null,
      recipientMatches,
      recipientPixKey: a.recipientPixKey ?? null,
      pixKeyMatches,
      confidence: a.confidence ?? 0,
      raw: JSON.stringify(a),
    };
  }

  /**
   * UMA segunda chance quando a chamada de visão falha.
   *
   * Motivo real (prod, 29/07): a moderação da OpenAI deu falso positivo num
   * comprovante legítimo (`400 Invalid prompt: flagged as potentially violating
   * our usage policy`) e a MESMA imagem passou nas tentativas seguintes — é
   * transitório, não é a imagem nem o prompt. Sem retry o paciente lê "não
   * consegui ler seu comprovante" por um erro que não é dele, e o teste com a
   * clínica trava achando que o reconhecimento não funciona.
   *
   * Vale para qualquer falha (timeout, 5xx), não só moderação: a resposta a um
   * erro de sistema é tentar de novo, e nenhum gate é afrouxado — o que a
   * segunda chamada devolver passa pela mesma conferência. Falhou de novo, o
   * erro SOBE: o chamador mantém a conversa aguardando e pede reenvio.
   */
  private async completeComRetry(input: ComprovanteInput) {
    const opts = {
      model: this.model,
      tool: EXTRACT_RECEIPT,
      messages: [
        { role: "system" as const, content: "Você lê comprovantes de pagamento e extrai valor, pagador, documento do recebedor e chave Pix exibida. Se a chave Pix não estiver legível ou não aparecer, devolva null e seja conservador na confiança." },
        { role: "user" as const, content: [
          { type: "text" as const, text: `Recebedor esperado: ${input.expectedRecipientName} (${input.expectedRecipientDoc}). Chave Pix esperada: ${input.expectedPixKey ?? "não informada"}. Extraia os dados do comprovante.` },
          { type: "image" as const, mimetype: input.media.mimetype, base64: input.media.base64, url: input.media.url },
        ] },
      ],
    };

    try {
      return await this.ai.completeWithTool(opts);
    } catch (err) {
      console.warn("[fiscal] visão falhou, tentando mais uma vez:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return await this.ai.completeWithTool(opts);
    }
  }
}
