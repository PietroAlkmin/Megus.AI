export interface CalendarEventInput {
  id: string;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null } | null;
}

export interface CalendarAppointmentCandidate {
  calendarEventId: string;
  patientKey: string;
  discriminator: string | null;
  fullName: string | null;
  phone: string | null;
  cpf: string | null;
  address: string | null;
  amount: number | null;
  startAt: string | null;
  errors: string[];
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function field(description: string, names: string[]): string | null {
  const lines = description.split(/\r?\n/);
  for (const line of lines) {
    const [label, ...parts] = line.split(":");
    if (label && names.includes(normalized(label).trim())) return parts.join(":").trim() || null;
  }
  return null;
}

export function parseCalendarAppointment(event: CalendarEventInput): CalendarAppointmentCandidate {
  const summary = (event.summary ?? "").replace(/^\[[^\]]+\]\s*/u, "").trim();
  const title = /^consulta\s+(.+)$/iu.exec(summary)?.[1]?.trim() ?? "";
  const keyParts = title.match(/^(.*?)(?:\s+(\d{4,}))?$/u);
  const description = event.description ?? "";
  const rawAmount = field(description, ["valor"]);
  const rawPhone = field(description, ["telefone", "celular", "whatsapp"]);
  const rawCpf = field(description, ["cpf"]);
  const errors: string[] = [];
  if (!title) errors.push("Título deve começar com 'Consulta '.");
  const amountDigits = rawAmount?.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = amountDigits ? Number(amountDigits) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Valor obrigatório e maior que zero.");
  return {
    calendarEventId: event.id,
    patientKey: keyParts?.[1]?.trim() ?? "",
    discriminator: keyParts?.[2] ?? null,
    fullName: field(description, ["nome completo", "nome"]),
    phone: rawPhone?.replace(/\D/g, "") ?? null,
    cpf: rawCpf?.replace(/\D/g, "") ?? null,
    // A resposta real do Composio já devolveu "Endere?o" (perda do ç). Aceitamos
    // essa variação degradada sem tornar o campo opcional para o parser.
    address: field(description, ["endereco", "endereco do paciente", "endere?o", "endere?o do paciente"]),
    amount: Number.isFinite(amount) ? amount : null,
    startAt: event.start?.dateTime ?? null,
    errors,
  };
}
