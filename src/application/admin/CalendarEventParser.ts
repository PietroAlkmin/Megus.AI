import { Cpf } from "../../domain/value-objects/Cpf";
import * as telefoneBR from "../../domain/services/telefoneBR";

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

/**
 * O Google Calendar guarda a descrição como HTML quando o texto é colado ou
 * formatado: as linhas viram `<br>` e o conteúdo pode vir embrulhado em `<span>`.
 * Sem desmontar isso, a descrição inteira vira UMA linha e nenhum campo é lido —
 * o evento é reprovado por "valor obrigatório" com o valor logo ali (visto ao
 * vivo no 1º dia). Digitado direto continua chegando em texto puro e passa igual.
 */
function textoPuro(descricao: string): string {
  return descricao
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&"); // por último: senão "&amp;lt;" viraria "<"
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
 * Rótulo SEM dois-pontos, no meio da linha: `Cpf 04373972974`, `Tel 11987789989`.
 *
 * A clínica escreve tudo numa linha só, do jeito que sai — e o `field()` acima
 * só enxerga `Rótulo: valor` no começo da linha. Medido na agenda real (04/08):
 * de 17 eventos, os únicos que passavam eram os TRÊS que nós mesmos criamos.
 */
function fieldSolto(description: string, names: string[]): string | null {
  const alvo = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const m = new RegExp(`\\b(?:${alvo})\\b[:\\s]*([\\d.\\-/() ]{8,})`, "iu").exec(normalized(description));
  return m?.[1]?.trim() || null;
}

/**
 * Valor escrito como ela escreve: `R$280`, `R$ 1.500,00`, `280,00`.
 *
 * Exige `R$` ou vírgula decimal quando não há rótulo `Valor:` — número solto na
 * descrição é telefone ou CPF muito mais vezes do que é preço, e cobrar
 * "R$ 11.942.842.271" seria pior que não importar.
 */
function valorSolto(description: string): string | null {
  const comMoeda = /r\$\s*([\d.,]+)/iu.exec(description);
  if (comMoeda?.[1]) return comMoeda[1];
  const comVirgula = /(?:^|\s)(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s|$)/u.exec(description);
  return comVirgula?.[1] ?? null;
}

/**
 * Números soltos na descrição, separados em CPF e telefone SEM rótulo nenhum —
 * `11942842271` sozinho é telefone; `04373972974` sozinho é CPF.
 *
 * O que desempata é o formato, não a ordem: DDD válido (11-99) com 10/11
 * dígitos é telefone; 11 dígitos com dígito verificador correto é CPF. Chutar
 * aqui manda cobrança para o número errado, então na dúvida devolve nada.
 */
function numerosSoltos(description: string): { telefone: string | null; cpf: string | null } {
  let telefone: string | null = null;
  let cpf: string | null = null;
  for (const bruto of description.match(/[\d][\d.\-() ]{8,}[\d]/gu) ?? []) {
    const d = bruto.replace(/\D/g, "");
    const ddd = Number(d.slice(0, 2));
    const ehTelefone = (d.length === 10 || d.length === 11) && ddd >= 11 && ddd <= 99 && (d.length === 10 || d[2] === "9");
    if (!telefone && ehTelefone) telefone = d;
    else if (!cpf && d.length === 11 && Cpf.isValid(d)) cpf = d;
  }
  return { telefone, cpf };
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

/**
 * Valor do evento em reais, aceitando como a clínica escreve — inclusive com
 * PONTO decimal.
 *
 * A versão anterior apagava todo ponto como separador de milhar: `150.00` virava
 * `15000` e a cobrança saía **cem vezes maior**. Ninguém tinha esbarrado porque
 * os testes usaram inteiros (`200`, `2`), mas "150.00" é escrita comum.
 *
 * Regra: com vírgula presente, convenção brasileira pura (ponto=milhar,
 * vírgula=decimal). Só com ponto é ambíguo — `1.500` é mil e quinhentos e
 * `150.00` é cento e cinquenta —, então decide pelo tamanho do último grupo:
 * exatamente 3 dígitos é milhar, qualquer outra quantidade é decimal.
 */
export function parseValorBR(raw: string | null | undefined): number {
  const limpo = (raw ?? "").replace(/[^0-9,.-]/g, "").trim();
  if (!limpo) return NaN;
  if (limpo.includes(",")) return Number(limpo.replace(/\./g, "").replace(",", "."));

  const partes = limpo.split(".");
  if (partes.length === 1) return Number(limpo);
  const ultimo = partes[partes.length - 1]!;
  if (ultimo.length === 3) return Number(partes.join("")); // 1.500 · 12.000
  return Number(partes.slice(0, -1).join("") + "." + ultimo); // 150.00 · 0.10 · 1.500.00
}

export function parseCalendarAppointment(event: CalendarEventInput): CalendarAppointmentCandidate {
  const summary = (event.summary ?? "").replace(/^\[[^\]]+\]\s*/u, "").trim();
  const description = textoPuro(event.description ?? "");
  // Três camadas, da mais explícita para a mais solta — a clínica escreve tudo
  // numa linha só ("Cpf 04373972974 Tel: 11987789989 R$280") e o formato
  // `Rótulo: valor` por linha era o único que o parser enxergava.
  const soltos = numerosSoltos(description);
  const rawAmount = field(description, ["valor"]) ?? valorSolto(description);
  const rawPhone =
    field(description, ["telefone", "celular", "whatsapp"]) ??
    fieldSolto(description, ["telefone", "celular", "whatsapp", "tel", "cel", "fone"]) ??
    soltos.telefone;
  const rawCpf = field(description, ["cpf"]) ?? fieldSolto(description, ["cpf"]) ?? soltos.cpf;
  const fullName = field(description, ["nome completo", "nome"]);
  // Quem o paciente é: o "Nome completo" da descrição manda (é o dado explícito);
  // sem ele, o título limpo. Assim o título pode ser escrito de qualquer jeito.
  const title = fullName?.trim() || extrairPaciente(summary);
  const keyParts = title.match(/^(.*?)(?:\s+(\d{4,}))?$/u);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!title) errors.push("Sem nome do paciente: preencha 'Nome completo' na descrição ou o nome no título.");
  // Telefone TORTO reprova o evento: sem número discável a cobrança nasce morta
  // — não dá para enviar (o provedor recusa) e nunca será quitada, porque
  // mensagem nenhuma vai casar com ele. Melhor a clínica corrigir na agenda,
  // vendo o motivo na prévia, do que ficar com uma cobrança fantasma no painel.
  const telefone = telefoneBR.normalizar(rawPhone);
  if (telefone && !telefoneBR.ehValido(telefone))
    errors.push(`Telefone inválido no evento (${rawPhone?.trim()}): use DDD + número, ex.: 11 91234-5678.`);

  // Dígito verificador é matemática pura (offline) — a única conferência de CPF
  // possível hoje, já que não há provedor oficial. Um typo da secretária NÃO
  // bloqueia a cobrança (o CPF nem é usado sem fiscal), mas também não entra no
  // banco como se fosse válido: é descartado e reportado na prévia.
  const cpfDigits = rawCpf?.replace(/\D/g, "") ?? null;
  const cpfValido = cpfDigits && Cpf.isValid(cpfDigits) ? cpfDigits : null;
  if (cpfDigits && !cpfValido) warnings.push(`CPF inválido no evento (${cpfDigits}) — ignorado.`);
  const amount = parseValorBR(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("Valor obrigatório e maior que zero.");
  return {
    calendarEventId: event.id,
    patientKey: keyParts?.[1]?.trim() ?? "",
    discriminator: keyParts?.[2] ?? null,
    fullName,
    phone: telefone,
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
