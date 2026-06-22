import type {
  ComprovanteAnalysis,
  ComprovanteInput,
  IComprovanteAnalyzer,
} from "../../domain/ports/IComprovanteAnalyzer";

/**
 * MOCK do analisador de comprovante — APENAS para demo/dev (COMPROVANTE_PROVIDER=mock).
 *
 * Auto-aprova: devolve recebedor batendo, o valor esperado injetado na composição
 * e confiança alta, para exercitar o fluxo COMPLETO (coleta → validação → emissão →
 * PDF) sem precisar de um comprovante real que case com o prestador.
 *
 * NUNCA usar em produção — o ato de "conferir pagamento" aqui é fake.
 */
export class MockComprovanteAnalyzer implements IComprovanteAnalyzer {
  constructor(private readonly cfg: { amount: number; confidence?: number }) {}

  async analyze(input: ComprovanteInput): Promise<ComprovanteAnalysis> {
    return {
      amount: this.cfg.amount,
      payerName: "Pagador (mock)",
      recipientDoc: input.expectedRecipientDoc.replace(/\D/g, ""),
      recipientMatches: true,
      confidence: this.cfg.confidence ?? 1,
      raw: "[mock] comprovante auto-aprovado (COMPROVANTE_PROVIDER=mock)",
    };
  }
}
