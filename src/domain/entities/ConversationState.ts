/**
 * Estados da conversa do Kaua (atendente).
 *
 * Só o ENUM (conceito de domínio) vive aqui. A LÓGICA de transição é a Seção 2 do
 * design (a desenhar/aprovar) e ficará na camada Application — não implementar aqui.
 */
export enum ConversationState {
  New = "new",
  CollectingIdentity = "collecting_identity", // pede nome + CPF
  ValidatingCpf = "validating_cpf", // confere dígito + CPF↔nome (ICpfProvider)
  AwaitingComprovante = "awaiting_comprovante",
  VerifyingComprovante = "verifying_comprovante", // IComprovanteAnalyzer
  AwaitingNotaAnswer = "awaiting_nota_answer", // pagamento OK: quer nota fiscal? (recado p/ a clínica)
  ReadyToEmit = "ready_to_emit", // EmissionIntent montado e validado
  Emitting = "emitting", // IFiscalProvider (determinístico)
  Done = "done",
  HumanHandoff = "human_handoff", // bot calado, humano assumiu
}
