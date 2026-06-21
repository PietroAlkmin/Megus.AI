import type { ComprovanteAnalysis, ComprovanteInput, IComprovanteAnalyzer } from "../../domain/ports/IComprovanteAnalyzer";
import type { AITool, IAIProvider } from "../../domain/ports/IAIProvider";

const onlyDigits = (s: string | null | undefined): string => (s ?? "").replace(/\D/g, "");

const EXTRACT_RECEIPT: AITool = {
  name: "extract_receipt",
  description: "Extrai dados do comprovante de pagamento (PIX/transferência).",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Valor pago em BRL" },
      payerName: { type: "string", description: "Nome de quem pagou" },
      recipientDoc: { type: "string", description: "CNPJ/CPF do recebedor (só dígitos)" },
      confidence: { type: "number", description: "0 a 1 — sua confiança na leitura" },
    },
    required: ["confidence"],
  },
};

/**
 * Conferência de comprovante via visão — AGNÓSTICA de provedor (usa IAIProvider).
 * Modelo injetado (env: AI_MODEL_VISION). O cruzamento recebedor==prestador é
 * feito aqui (código), não pela IA.
 */
export class ComprovanteAnalyzer implements IComprovanteAnalyzer {
  constructor(private readonly ai: IAIProvider, private readonly model: string) {}

  async analyze(input: ComprovanteInput): Promise<ComprovanteAnalysis> {
    const call = await this.ai.completeWithTool({
      model: this.model,
      tool: EXTRACT_RECEIPT,
      messages: [
        { role: "system", content: "Você lê comprovantes de pagamento e extrai valor, pagador e recebedor. Seja conservador na confiança." },
        { role: "user", content: [
          { type: "text", text: `Recebedor esperado: ${input.expectedRecipientName} (${input.expectedRecipientDoc}). Extraia os dados do comprovante.` },
          { type: "image", mimetype: input.media.mimetype, base64: input.media.base64, url: input.media.url },
        ] },
      ],
    });
    const a = call.arguments as { amount?: number; payerName?: string; recipientDoc?: string; confidence?: number };
    const recipientMatches =
      onlyDigits(a.recipientDoc) === onlyDigits(input.expectedRecipientDoc) && onlyDigits(a.recipientDoc).length > 0;
    return {
      amount: a.amount ?? null,
      payerName: a.payerName ?? null,
      recipientDoc: a.recipientDoc ?? null,
      recipientMatches,
      confidence: a.confidence ?? 0,
      raw: JSON.stringify(a),
    };
  }
}
