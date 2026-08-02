import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rotulo } from "@/components/ui/megus";
import { cn } from "@/lib/utils";

/**
 * Agendador de envio de cobrança.
 *
 * O `datetime-local` nativo foi descartado por três razões, nessa ordem:
 *
 *   1. Oferece precisão que não existe no problema. Clínica agenda "amanhã de
 *      manhã", não "03:47". A cadência de cobrança é em dias, e o campo aceitava
 *      madrugada — hora em que mandar cobrança a paciente é erro, não opção.
 *   2. É do navegador, não nosso: azul #1A73E8 fixo, fora da paleta, e desenho
 *      diferente em cada SO. "Padrão da indústria" nem sequer é consistente.
 *   3. Nenhuma referência usa (Mailchimp, Loops, Basecamp — todas próprias).
 *
 * Desenho: atalhos primeiro (Basecamp), calendário + hora atrás de "outra data"
 * (Loops/Mailchimp). O caso comum vira um clique.
 */

const H_INICIO = 7;
const H_FIM = 20;
const HORA_PADRAO = 9;

/** Grade de 30min entre 7h e 20h: fora disso é madrugada. */
const HORAS = (() => {
  const out: string[] = [];
  for (let h = H_INICIO; h <= H_FIM; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    if (h < H_FIM) out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

const DIAS_SEM = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

const comHora = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
};

/** ISO → "04/08 às 09:00". Mostra o ano só quando não é o corrente — sem ele um
 *  agendamento distante fica ambíguo; com ele sempre, vira ruído. */
export function formatarQuando(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const outroAno = d.getFullYear() !== new Date().getFullYear();
  return d
    .toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: outroAno ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(", ", " às ");
}

/** Versão curta para o card: "04/08 09:00". */
export function quandoCurto(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d
    .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(", ", " ");
}

/**
 * Encaixa uma hora qualquer na grade de 30min, dentro da janela de trabalho.
 *
 * Necessário porque `agendadaPara` pode vir de fora da UI (backend, agendamento
 * antigo, outro cliente) com minuto quebrado — 13:34. Um `<select>` cujo `value`
 * não casa com nenhuma `<option>` mostra a PRIMEIRA opção enquanto o estado
 * guarda o valor original: a pessoa vê 07:00, confirma, e grava 13:34.
 * Arredondar na hidratação garante que o que se vê é o que se grava.
 */
function naGrade(d: Date) {
  const min = d.getMinutes() >= 45 ? 60 : d.getMinutes() >= 15 ? 30 : 0;
  let h = d.getHours() + (min === 60 ? 1 : 0);
  let m = min === 60 ? 0 : min;
  if (h < H_INICIO) {
    h = H_INICIO;
    m = 0;
  }
  if (h > H_FIM || (h === H_FIM && m > 0)) {
    h = H_FIM;
    m = 0;
  }
  const s = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return HORAS.includes(s) ? s : `${String(HORA_PADRAO).padStart(2, "0")}:00`;
}

/** Os atalhos que cobrem a maioria dos casos — sempre às 9h. */
function atalhos() {
  const base = new Date();
  base.setHours(HORA_PADRAO, 0, 0, 0);
  const mais = (n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  const lista: { r: string; d: Date }[] = [];
  if (new Date() < base) lista.push({ r: "Hoje de manhã", d: base });
  lista.push({ r: "Amanhã de manhã", d: mais(1) }, { r: "Depois de amanhã", d: mais(2) });

  const proxSegunda = (() => {
    const d = new Date(base);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d;
  })();
  // Só oferece "próxima segunda" se não for repetir um atalho acima.
  if (!lista.some((a) => mesmoDia(a.d, proxSegunda))) lista.push({ r: "Próxima segunda", d: proxSegunda });
  return lista;
}

export default function Agendador({
  atual,
  onConfirmar,
  onCancelar,
}: {
  atual?: string | null;
  onConfirmar: (quando: Date) => void;
  onCancelar: () => void;
}) {
  const inicial = atual ? new Date(atual) : null;
  const [aberto, setAberto] = useState(Boolean(inicial)); // calendário visível?
  const [dia, setDia] = useState<Date | null>(inicial);
  const [hora, setHora] = useState(inicial ? naGrade(inicial) : `${String(HORA_PADRAO).padStart(2, "0")}:00`);
  const [mes, setMes] = useState(() => {
    const d = inicial ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (!aberto) {
    return (
      <div className="rounded-[7px] border border-border bg-background p-2.5">
        <Rotulo>Enviar quando</Rotulo>
        <div className="mt-2 flex flex-col gap-1">
          {atalhos().map((a) => (
            <button
              key={a.r}
              type="button"
              onClick={() => onConfirmar(a.d)}
              className="flex items-center justify-between gap-3 rounded-[6px] px-2.5 py-2 text-left transition-colors hover:bg-muted"
            >
              <span className="text-[12.5px] font-semibold text-foreground">{a.r}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {quandoCurto(a.d.toISOString())}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[12.5px] font-semibold text-secondary-foreground transition-colors hover:bg-muted"
          >
            <CalendarDays size={13} /> Escolher outra data
          </button>
        </div>
        <div className="mt-1 flex justify-end border-t border-border pt-2">
          <Button size="sm" variant="quieto" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const celulas: (Date | null)[] = [];
  for (let i = 0; i < primeiro.getDay(); i++) celulas.push(null);
  const ultimoDia = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= ultimoDia; d++) celulas.push(new Date(mes.getFullYear(), mes.getMonth(), d));

  const mudarMes = (n: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1));
  const podeVoltar = mes > new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  return (
    <div className="rounded-[7px] border border-border bg-background p-2.5">
      <header className="flex items-center justify-between gap-2 px-0.5 pb-2">
        <strong className="text-[12.5px] font-semibold text-foreground">
          {MESES[mes.getMonth()]} {mes.getFullYear()}
        </strong>
        <span className="flex gap-0.5">
          <button
            type="button"
            onClick={() => mudarMes(-1)}
            disabled={!podeVoltar}
            aria-label="Mês anterior"
            className="grid h-6 w-6 place-items-center rounded-[5px] text-secondary-foreground transition-colors hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => mudarMes(1)}
            aria-label="Próximo mês"
            className="grid h-6 w-6 place-items-center rounded-[5px] text-secondary-foreground transition-colors hover:bg-muted"
          >
            <ChevronRight size={13} />
          </button>
        </span>
      </header>

      <div className="grid grid-cols-7 gap-0.5">
        {DIAS_SEM.map((d, i) => (
          <span
            key={i}
            className="grid h-6 place-items-center font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground"
          >
            {d}
          </span>
        ))}
        {celulas.map((d, i) => {
          if (!d) return <span key={i} />;
          const passado = d < hoje;
          const sel = dia && mesmoDia(d, dia);
          return (
            <button
              key={i}
              type="button"
              disabled={passado}
              onClick={() => setDia(d)}
              className={cn(
                "grid h-7 place-items-center rounded-[5px] font-mono text-[11.5px] tabular-nums transition-colors",
                passado && "text-border-strong",
                !passado && !sel && "text-foreground hover:bg-muted",
                sel && "bg-primary font-semibold text-white",
                !sel && !passado && mesmoDia(d, new Date()) && "font-semibold text-menta-ink",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
        <Rotulo className="shrink-0">Às</Rotulo>
        <select
          value={hora}
          onChange={(e) => setHora(e.target.value)}
          className="h-8 rounded-[6px] border border-border bg-card px-2 font-mono text-[12px] tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          {HORAS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="flex-1" />
        <Button size="sm" variant="quieto" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button size="sm" disabled={!dia} onClick={() => dia && onConfirmar(comHora(dia, hora))}>
          Marcar
        </Button>
      </div>
    </div>
  );
}
