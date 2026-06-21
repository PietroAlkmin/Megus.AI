/**
 * EmissionIntent = dados estruturados e VALIDADOS, prontos para a emissão.
 *
 * Regra de segurança (decisão do Pietro): a IA NUNCA emite. Ela só preenche este
 * objeto; quem emite é o IFiscalProvider (determinístico, server-side, com escaping
 * próprio). A camada probabilística (LLM/visão) nunca dispara o ato fiscal.
 */
export type EmissionIntentStatus =
  | "draft"
  | "ready"
  | "emitting"
  | "emitted"
  | "failed";

export interface EmissionIntent {
  id: string;
  conversationId: string;
  contactId: string;
  integrationId: string;
  status: EmissionIntentStatus;

  // Tomador (paciente) — já validado
  tomadorName: string;
  tomadorCpf: string; // 11 dígitos

  // Serviço / valor
  serviceId: string | null; // serviço NFS-e vinculado
  description: string;
  amount: number;

  // Conferência do comprovante
  paymentVerified: boolean;
  paymentConfidence: number; // 0..1 — abaixo do limiar ⇒ handoff humano

  // Resultado da emissão
  fiscalKey: string | null; // chave de acesso da NFS-e
  pdfUrl: string | null; // DANFSe a devolver ao paciente

  createdAt: Date;
  updatedAt: Date;
}
