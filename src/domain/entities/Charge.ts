/**
 * Charge = cobrança de um agendamento. Nasce "pendente" quando o Kaua marca um
 * evento (nunca cobra na hora); a clínica decide quando cobrar (botão no painel
 * dispara o WhatsApp) e o gate B (comprovante+nota) quita ("paga").
 */
export type ChargeStatus = "pendente" | "cobrada" | "paga";

export interface Charge {
  id: string;
  integrationId: string;
  contactId: string;
  serviceId: string | null;
  description: string;
  amount: number;
  status: ChargeStatus;
  calendarEventId: string | null; // evento da agenda que originou a cobrança (best-effort)
  chargedAt: Date | null; // quando o botão "Cobrar" disparou a mensagem
  paidAt: Date | null; // quando o gate B confirmou o pagamento
  /**
   * O cliente quer nota fiscal deste atendimento? Perguntado DEPOIS do pagamento
   * confirmado. `null` = ainda não respondeu/não foi perguntado.
   *
   * É um RECADO PARA A CLÍNICA, não um gatilho de sistema: quem emite é ela, no
   * sistema fiscal dela. Serve pra ela saber de quem emitir sem reler conversa.
   */
  notaSolicitada: boolean | null;
  /** Quando a clínica marcou no painel que já emitiu. null = ainda na lista dela. */
  notaEmitidaEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
