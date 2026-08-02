import type { Contact } from "../../domain/entities/Contact";
import type { IChargeRepository, IContactRepository } from "../../domain/ports/repositories";
import { parseCalendarAppointment, type CalendarEventInput } from "./CalendarEventParser";
import { variantes as variantesTelefone } from "../../domain/services/telefoneBR";

export type CalendarImportPlanItem =
  | { kind: "ready"; eventId: string; patientKey: string; amount: number; existingContactId: string | null; createContact: boolean; phone: string | null; fullName: string | null; cpf: string | null; warnings: string[] }
  | { kind: "duplicate"; eventId: string; patientKey: string }
  | { kind: "invalid"; eventId: string; patientKey: string; reason: string };

function norm(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * O TELEFONE é a identidade forte: é por ele que a conversa e a cobrança se
 * encontram no WhatsApp. Casar só por nome duplicava o paciente que JÁ tinha
 * conversado — esse contato nasce da mensagem recebida e vem **sem nome**, então
 * nunca casava, e o import criava um segundo cadastro: a cobrança ia pro novo e
 * o comprovante chegava no antigo (que não tinha cobrança) — o gate B nunca
 * rodava e o cérebro respondia genérico. Visto ao vivo no 1º dia da cliente.
 * O nome continua valendo como 2º critério, para o evento que não traz telefone.
 */
function matches(contact: Contact, key: string, discriminator: string | null, phone: string | null): boolean {
  // Tolerante ao nono dígito: "11 4284-2271" e "11 94284-2271" são o MESMO
  // celular. Comparação exata criava um 2º cadastro e a cobrança ia parar nele.
  if (phone && variantesTelefone(phone).includes(contact.whatsappNumber)) return true;
  if (!contact.fullName || !norm(contact.fullName).startsWith(norm(key))) return false;
  return !discriminator || contact.whatsappNumber.endsWith(discriminator);
}

/** Planeja sem escrita: a confirmação administrativa decide se o plano será aplicado. */
export class CalendarImportPlanner {
  constructor(private readonly d: { contacts: IContactRepository; charges: IChargeRepository }) {}

  async plan(integrationId: string, events: CalendarEventInput[]): Promise<CalendarImportPlanItem[]> {
    const known = [...await this.d.contacts.listByIntegration(integrationId)];
    const plan: CalendarImportPlanItem[] = [];
    for (const event of [...events].sort((a, b) => String(a.start?.dateTime ?? "").localeCompare(String(b.start?.dateTime ?? "")))) {
      const candidate = parseCalendarAppointment(event);
      if (await this.d.charges.findByCalendarEventId(integrationId, candidate.calendarEventId)) {
        plan.push({ kind: "duplicate", eventId: candidate.calendarEventId, patientKey: candidate.patientKey });
        continue;
      }
      if (candidate.errors.length) {
        plan.push({ kind: "invalid", eventId: candidate.calendarEventId, patientKey: candidate.patientKey, reason: candidate.errors.join(" ") });
        continue;
      }
      const found = known.filter((contact) => matches(contact, candidate.patientKey, candidate.discriminator, candidate.phone));
      if (found.length > 1) {
        plan.push({ kind: "invalid", eventId: candidate.calendarEventId, patientKey: candidate.patientKey, reason: "Paciente ambíguo: use discriminante no título." });
        continue;
      }
      if (found.length === 0 && !candidate.phone) {
        plan.push({ kind: "invalid", eventId: candidate.calendarEventId, patientKey: candidate.patientKey, reason: "Telefone obrigatório no primeiro atendimento." });
        continue;
      }
      const existing = found[0] ?? null;
      plan.push({ kind: "ready", eventId: candidate.calendarEventId, patientKey: candidate.patientKey, amount: candidate.amount!, existingContactId: existing?.id ?? null, createContact: !existing, phone: candidate.phone, fullName: candidate.fullName, cpf: candidate.cpf, warnings: candidate.warnings });
      // Torna um primeiro atendimento elegível para o próximo evento do mesmo lote.
      if (!existing) known.push({ id: `planned:${candidate.calendarEventId}`, integrationId, whatsappNumber: candidate.phone!, fullName: candidate.fullName ?? candidate.patientKey, cpf: candidate.cpf, cpfNameVerified: false, createdAt: new Date(), updatedAt: new Date() });
    }
    return plan;
  }
}
