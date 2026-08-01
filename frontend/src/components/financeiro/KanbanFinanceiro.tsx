import { useState } from "react";
import { Check, Clock, FileText, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rotulo } from "@/components/ui/megus";
import { cn, formatarBRL } from "@/lib/utils";
import type { Cobranca } from "@/services/cobrancas";
import { ETAPAS, etapaDe, paradoDe, situacaoNota, temperatura, type EtapaId } from "@/services/pipeline";

/** "hoje 09:00" / "04/08 09:00" — no card cabe pouco, então o dia some quando é hoje. */
function formatarQuandoCurto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "agendado";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  if (mesmoDia) return `hoje ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

interface KanbanProps {
  cobrancas: Cobranca[];
  selecionadas: string[];
  onSelecionar: (id: string, comShift: boolean) => void;
  onAbrir: (c: Cobranca) => void;
  onMover: (c: Cobranca, etapa: EtapaId) => void;
  /** Marca a nota como emitida pela clínica (ação da coluna "Nota pedida"). */
  onEmitir: (c: Cobranca) => void;
}

/**
 * Kanban do ciclo agendamento → nota.
 *
 * Referências: HubSpot (total por coluna no cabeçalho) e Attio (card denso, com
 * a informação secundária em cinza). O que acrescentamos e não vimos nas duas:
 *
 *  · ENVELHECIMENTO. O card esfria com o tempo parado (ok → morno → frio). Num
 *    pipeline de vendas o estágio é o dado; aqui o estágio é normal e o TEMPO
 *    parado é o problema — é ali que o dinheiro trava.
 *
 *  · A coluna "Nota pedida" é a FILA DA CLÍNICA — quem emite a nota é ela, no
 *    sistema fiscal dela. Por isso o card ali tem ação própria ("Já emiti") em
 *    vez de esperar arrastar: é a única coluna onde a pessoa TRABALHA.
 *
 *  · A última coluna é terracota. "Nota emitida" é a chegada, e a cor marca isso
 *    sem precisar de rótulo extra.
 *
 * Arrastar usa HTML5 nativo — não vale uma dependência de dnd para 5 colunas.
 */
export default function KanbanFinanceiro({
  cobrancas,
  selecionadas,
  onSelecionar,
  onAbrir,
  onMover,
  onEmitir,
}: KanbanProps) {
  const [arrastando, setArrastando] = useState<Cobranca | null>(null);
  const [alvo, setAlvo] = useState<EtapaId | null>(null);

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3 xl:grid-cols-5">
      {ETAPAS.map((etapa, i) => {
        const daEtapa = cobrancas.filter((c) => etapaDe(c) === etapa.id);
        const total = daEtapa.reduce((soma, c) => soma + c.valor, 0);
        const ultima = i === ETAPAS.length - 1;
        const quente = ultima || Boolean(etapa.fila);
        const ehAlvo = alvo === etapa.id && arrastando && etapaDe(arrastando) !== etapa.id;

        return (
          <div
            key={etapa.id}
            onDragOver={(e) => {
              e.preventDefault();
              setAlvo(etapa.id);
            }}
            onDragLeave={() => setAlvo((v) => (v === etapa.id ? null : v))}
            onDrop={() => {
              if (arrastando && etapaDe(arrastando) !== etapa.id) onMover(arrastando, etapa.id);
              setArrastando(null);
              setAlvo(null);
            }}
            className={cn(
              "flex w-[268px] shrink-0 snap-start flex-col rounded-[10px] border bg-card p-2.5 transition-colors md:w-auto md:shrink md:snap-align-none",
              ehAlvo ? (quente ? "border-terra bg-terra-soft" : "border-menta bg-menta-soft") : "border-border",
              // A fila da clínica se destaca mesmo sem arrastar: é onde há trabalho.
              !ehAlvo && etapa.fila && daEtapa.length > 0 && "border-terra/50",
            )}
          >
            <header className="mb-2.5 px-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold text-foreground">{etapa.label}</span>
                <span className="shrink-0 rounded-[3px] bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary-foreground">
                  {daEtapa.length}
                </span>
              </div>
              <div className={cn("mt-0.5 font-mono text-[11.5px] font-bold", quente ? "text-terra-ink" : "text-menta-ink")}>
                {formatarBRL(total)}
              </div>
            </header>

            <div className="flex flex-col gap-2">
              {daEtapa.map((c) => (
                <CardPaciente
                  key={c.id}
                  c={c}
                  selecionada={selecionadas.includes(c.id)}
                  onSelecionar={(shift) => onSelecionar(c.id, shift)}
                  onAbrir={() => onAbrir(c)}
                  onEmitir={() => onEmitir(c)}
                  onDragStart={() => setArrastando(c)}
                  onDragEnd={() => {
                    setArrastando(null);
                    setAlvo(null);
                  }}
                />
              ))}
              {daEtapa.length === 0 && (
                <p className="rounded-[10px] border border-dashed border-border px-2 py-4 text-center text-[11.5px] text-muted-foreground">
                  {etapa.ajuda}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardPaciente({
  c,
  selecionada,
  onSelecionar,
  onAbrir,
  onEmitir,
  onDragStart,
  onDragEnd,
}: {
  c: Cobranca;
  selecionada: boolean;
  onSelecionar: (comShift: boolean) => void;
  onAbrir: () => void;
  onEmitir: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const dias = paradoDe(c);
  const temp = temperatura(dias);
  const nota = situacaoNota(c);

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => (e.shiftKey || e.metaKey ? onSelecionar(true) : onAbrir())}
      className={cn(
        "group cursor-pointer rounded-[10px] border bg-background p-2.5 transition-all hover:-translate-y-px hover:bg-card hover:shadow-media",
        selecionada ? "border-menta ring-1 ring-menta" : "border-border hover:border-border-strong",
        temp === "frio" && "border-l-[2.5px] border-l-terra",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold text-foreground">{c.nome}</span>
          <span className="mt-px block truncate text-[11px] text-muted-foreground">{c.servico}</span>
        </span>
        <GripVertical
          size={13}
          className="mt-0.5 shrink-0 text-border-strong opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[12.5px] font-bold text-foreground">{formatarBRL(c.valor)}</span>
        <span
          className={cn(
            "shrink-0 text-[10.5px]",
            temp === "ok" && "text-muted-foreground",
            temp === "morno" && "text-terra-ink",
            temp === "frio" && "rounded-[5px] bg-terra-soft px-1.5 py-0.5 font-bold text-terra-ink",
          )}
        >
          {dias === 0 ? "hoje" : `parado ${dias}d`}
        </span>
      </div>

      {c.notaNum && (
        <div className="mt-2 flex items-center gap-1.5 font-mono text-[10.5px] text-menta-ink">
          <FileText size={11} /> {c.notaNum}
        </div>
      )}

      {/* Agendado fica VISÍVEL no card: sem isso a cobrança aparece parada em "A
          cobrar" como qualquer outra, e a clínica clica Cobrar — o paciente
          receberia a mensagem duas vezes. */}
      {c.agendadaPara && !c.cobrado && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Clock size={11} /> envio {formatarQuandoCurto(c.agendadaPara)}
        </div>
      )}

      {/* A fila da clínica: ação no próprio card, porque é aqui que ela trabalha.
         `stopPropagation` para o clique não abrir a gaveta. */}
      {nota === "pedida" && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <Rotulo className="text-terra-ink">Pediu nota</Rotulo>
          <Button
            size="sm"
            variant="outline"
            className="mt-1.5 h-7 w-full text-[11.5px]"
            onClick={(ev) => {
              ev.stopPropagation();
              onEmitir();
            }}
          >
            <Check size={12} strokeWidth={2.6} /> Já emiti
          </Button>
        </div>
      )}

      {/* "Não quis" é ciclo fechado; "aguardando" é o agente ainda perguntando.
         Fundir os dois faria a clínica emitir nota de quem não pediu. */}
      {nota === "dispensada" && <div className="mt-2 text-[10.5px] text-muted-foreground">Não quis nota</div>}
      {nota === "aguardando" && (
        <div className="mt-2 text-[10.5px] text-muted-foreground">Perguntando sobre a nota…</div>
      )}

      {temp === "frio" && !c.notaNum && nota !== "pedida" && (
        <div className="mt-2 inline-flex items-center gap-[7px] text-[11px] font-semibold text-terra-ink">
          <span className="h-[6px] w-[6px] shrink-0 rounded-[1.5px] bg-terra" /> Travado há {dias} dias
        </div>
      )}
    </article>
  );
}
