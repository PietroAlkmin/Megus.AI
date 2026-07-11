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
  createdAt: Date;
  updatedAt: Date;
}
