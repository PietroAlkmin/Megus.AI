/**
 * Porta de análise de COMPROVANTE de pagamento (visão/LLM).
 *
 * Extrai valor/pagador/recebedor do comprovante e cruza contra a identidade do
 * prestador (cliente Megus). Resultado é PROBABILÍSTICO: abaixo do limiar de
 * confiança ⇒ handoff humano (nunca confirma pagamento "no chute").
 */
export interface ComprovanteInput {
  media: { mimetype: string; base64?: string; url?: string };
  expectedRecipientDoc: string; // CNPJ/CPF do prestador
  expectedRecipientName: string;
  /** Chave Pix efetivamente informada na cobrança; ausente = não há como validá-la. */
  expectedPixKey?: string | null;
}

export interface ComprovanteAnalysis {
  amount: number | null;
  payerName: string | null;
  recipientDoc: string | null;
  recipientMatches: boolean;
  recipientPixKey?: string | null;
  pixKeyMatches?: boolean;
  confidence: number; // 0..1
  raw: string; // texto extraído, para auditoria
}

export interface IComprovanteAnalyzer {
  analyze(input: ComprovanteInput): Promise<ComprovanteAnalysis>;
}
