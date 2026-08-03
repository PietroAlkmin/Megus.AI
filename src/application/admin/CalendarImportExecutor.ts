import { randomUUID } from "node:crypto";
import type { IChargeRepository, IContactRepository } from "../../domain/ports/repositories";
import type { CalendarImportPlanItem } from "./CalendarImportPlanner";

/** Aplica SOMENTE itens já aprovados pelo administrador; nunca interpreta Agenda. */
export class CalendarImportExecutor {
  constructor(private readonly d: { contacts: IContactRepository; charges: IChargeRepository }) {}

  async execute(integrationId: string, plan: CalendarImportPlanItem[]): Promise<number> {
    let created = 0;
    const resolved = new Map<string, string>();
    for (const item of plan) {
      if (item.kind !== "ready") continue;
      if (await this.d.charges.findByCalendarEventId(integrationId, item.eventId)) continue;
      // O planner adiciona um contato temporário ao lote para reconhecer uma
      // remarcação sem telefone. No executor, o contato realmente criado no
      // mesmo lote tem precedência sobre esse id temporário.
      let contactId = resolved.get(item.patientKey) ?? item.existingContactId;
      if (!contactId) {
        if (!item.phone) continue; // defesa: plano válido de primeiro atendimento sempre tem telefone
        contactId = randomUUID();
        // A Agenda é preenchida pela própria clínica e só chega aqui após a
        // confirmação administrativa. Portanto, nome + CPF desse primeiro
        // atendimento são uma identidade confiável para o fluxo de cobrança;
        // não é equivalente a dados alegados pelo paciente no WhatsApp.
        await this.d.contacts.save({ id: contactId, integrationId, whatsappNumber: item.phone, fullName: item.fullName ?? item.patientKey, cpf: item.cpf, cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() });
        resolved.set(item.patientKey, contactId);
      }
      // Paciente que já tinha conversado existe apenas como telefone (o contato
      // nasce da mensagem recebida, sem nome). Se a agenda trouxe nome/CPF,
      // completamos o cadastro — sem sobrescrever o que já estava preenchido.
      const existente = await this.d.contacts.getById(contactId);
      if (existente && ((!existente.fullName && (item.fullName ?? item.patientKey)) || (!existente.cpf && item.cpf))) {
        await this.d.contacts.save({
          ...existente,
          fullName: existente.fullName ?? item.fullName ?? item.patientKey,
          cpf: existente.cpf ?? item.cpf,
          updatedAt: new Date(),
        });
      }

      const now = new Date();
      await this.d.charges.save({ id: randomUUID(), integrationId, contactId, serviceId: null, description: "Consulta", amount: item.amount, status: "pendente", calendarEventId: item.eventId, chargedAt: null, paidAt: null, scheduledFor: null, paymentRef: null, paidBy: null, receiptHash: null, notaSolicitada: null, notaEmitidaEm: null, createdAt: now, updatedAt: now });
      created += 1;
    }
    return created;
  }
}
