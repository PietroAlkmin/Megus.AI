import { Cpf } from "../../domain/value-objects/Cpf";

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
  /** Ressalvas que NÃO impedem a criação da cobrança (ex.: CPF descartado). */
  warnings: string[];
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

/**
 * Extrai o nome do paciente do título. A palavra "consulta" marca o evento como
 * atendimento e pode vir em QUALQUER posição: quem escreve a agenda usa a ordem
 * natural dela ("Bê consulta", "ANTONIO VIOLA-CONSULTA 60MIN") e não a nossa —
 * exigir "Consulta NOME" reprovava eventos corretos e obrigava a clínica a
 * reaprender o próprio jeito de trabalhar. Duração ("60MIN") e separadores saem
 * junto; o que sobra é o nome. Sem a palavra "consulta" → não é atendimento.
 */
function extrairPaciente(summary: string): string {
  const MARCADOR = /\bconsultas?\b/iu;
  if (!MARCADOR.test(summary)) return "";
  return summary
    .replace(MARCADOR, " ")
    .replace(/\b\d{1,3}\s*min(?:utos)?\b/giu, " ") // "60MIN", "45 minutos"
    .replace(/[-–—|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCalendarAppointment(event: CalendarEventInput): CalendarAppointmentCandidate {
  const summary = (event.summary ?? "").replace(/^\[[^\]]+\]\s*/u, "").trim();
  const title = extrairPaciente(summary);
  const keyParts = title.match(/^(.*?)(?:\s+(\d{4,}))?$/u);
  const description = event.description ?? "";
  const rawAmount = field(description, ["valor"]);
  const rawPhone = field(description, ["telefone", "celular", "whatsapp"]);
  const rawCpf = field(description, ["cpf"]);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!title) errors.push("Título precisa ter a palavra 'consulta' e o nome do paciente.");
  // Dígito verificador é matemática pura (offline) — a única conferência de CPF
  // possível hoje, já que não há provedor oficial. Um typo da secretária NÃO
  // bloqueia a cobrança (o CPF nem é usado sem fiscal), mas também não entra no
  // banco como se fosse válido: é descartado e reportado na prévia.
  const cpfDigits = rawCpf?.replace(/\D/g, "") ?? null;
  const cpfValido = cpfDigits && Cpf.isValid(cpfDigits) ? cpfDigits : null;
  if (cpfDigits && !cpfValido) warnings.push(`CPF inválido no evento (${cpfDigits}) — ignorado.`);
  const amountDigits = rawAmount?.replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = amountDigits ? Number(amountDigits) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Valor obrigatório e maior que zero.");
  return {
    calendarEventId: event.id,
    patientKey: keyParts?.[1]?.trim() ?? "",
    discriminator: keyParts?.[2] ?? null,
    fullName: field(description, ["nome completo", "nome"]),
    phone: rawPhone?.replace(/\D/g, "") ?? null,
    cpf: cpfValido,
    // A resposta real do Composio já devolveu "Endere?o" (perda do ç). Aceitamos
    // essa variação degradada sem tornar o campo opcional para o parser.
    address: field(description, ["endereco", "endereco do paciente", "endere?o", "endere?o do paciente"]),
    amount: Number.isFinite(amount) ? amount : null,
    startAt: event.start?.dateTime ?? null,
    errors,
    warnings,
  };
}
