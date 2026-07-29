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
 * Nome do paciente a partir do TÍTULO, seja como for que a clínica escreva:
 * "Consulta Maria", "Bê consulta", "ANTONIO VIOLA-CONSULTA 60MIN" ou só o nome.
 * A palavra "consulta" (opcional), a duração e os separadores são ruído —
 * o que sobra é o nome.
 *
 * O que marca o evento como ATENDIMENTO COBRÁVEL não é o título e sim o `Valor:`
 * preenchido na descrição (checado adiante): é ato deliberado de quem agenda,
 * enquanto nomenclatura é convenção que o cliente não tem como adivinhar — e
 * errou 3× seguidas tentando. Reunião/pessoal/spam não têm valor e seguem fora.
 */
function extrairPaciente(summary: string): string {
  return summary
    .replace(/\bconsultas?\b/giu, " ")
    .replace(/\b\d{1,3}\s*min(?:utos)?\b/giu, " ") // "60MIN", "45 minutos"
    .replace(/[-–—|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCalendarAppointment(event: CalendarEventInput): CalendarAppointmentCandidate {
  const summary = (event.summary ?? "").replace(/^\[[^\]]+\]\s*/u, "").trim();
  const description = event.description ?? "";
  const rawAmount = field(description, ["valor"]);
  const rawPhone = field(description, ["telefone", "celular", "whatsapp"]);
  const rawCpf = field(description, ["cpf"]);
  const fullName = field(description, ["nome completo", "nome"]);
  // Quem o paciente é: o "Nome completo" da descrição manda (é o dado explícito);
  // sem ele, o título limpo. Assim o título pode ser escrito de qualquer jeito.
  const title = fullName?.trim() || extrairPaciente(summary);
  const keyParts = title.match(/^(.*?)(?:\s+(\d{4,}))?$/u);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!title) errors.push("Sem nome do paciente: preencha 'Nome completo' na descrição ou o nome no título.");
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
    fullName,
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
