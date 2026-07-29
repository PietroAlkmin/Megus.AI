import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DicaContextual from "@/components/onboarding/DicaContextual";
import KanbanFinanceiro from "@/components/financeiro/KanbanFinanceiro";
import { BotaoAtualizar } from "@/components/hoje/SecoesHoje";
import { cn, formatarBRL } from "@/lib/utils";
import { Rotulo } from "@/components/ui/megus";
import * as cobrancasService from "@/services/cobrancas";
import type { Cobranca } from "@/services/cobrancas";
import { ETAPAS, etapaDe, paradoDe, situacaoNota, temperatura, type EtapaId } from "@/services/pipeline";

/**
 * Financeiro — o ciclo agendamento → nota, por paciente.
 *
 * Substitui a antiga tela Cobranças (lista + métricas). A troca de lista por
 * kanban não foi estética: numa lista, "quem está travado" exige ler linha por
 * linha. Num kanban com envelhecimento, o problema salta — e o dinheiro parado
 * é o que essa tela existe para mostrar.
 */
export default function Financeiro() {
  const queryClient = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [aberta, setAberta] = useState<Cobranca | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "travadas">("todas");

  const cobrancasQuery = useQuery({ queryKey: ["cobrancas"], queryFn: cobrancasService.listCobrancas });
  const metricasQuery = useQuery({ queryKey: ["cobrancas", "metricas"], queryFn: cobrancasService.getMetricas });
  const todas = cobrancasQuery.data ?? [];

  const cobrar = useMutation({
    // As duas rotas devolvem shapes diferentes (`{id,cobrado}` vs `{id,status}`).
    // Normalizamos para `{id}` — é tudo que a tela usa.
    mutationFn: async (c: Cobranca): Promise<{ id: string }> =>
      c.charge ? cobrancasService.cobrarCharge(c.id) : cobrancasService.cobrar(c.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
      toast.success("Cobrança enviada pelo WhatsApp.");
    },
    onError: () => toast.error("Não foi possível enviar a cobrança."),
  });

  const emitir = useMutation({
    // ⚠️ Quem emite a nota é a CLÍNICA, no sistema fiscal dela. Esta rota só
    // registra que ela emitiu — é o que fecha o ciclo e limpa a fila dela.
    mutationFn: (c: Cobranca) => cobrancasService.marcarNotaEmitida(c.id, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
      toast.success("Nota marcada como emitida.");
    },
    onError: () => toast.error("Não foi possível marcar a nota."),
  });

  const cobrancas = useMemo(
    () => (filtro === "travadas" ? todas.filter((c) => temperatura(paradoDe(c)) !== "ok") : todas),
    [todas, filtro],
  );

  // O gargalo: a etapa com mais dinheiro parado. É a única leitura que o usuário
  // precisa fazer se abrir a tela com pressa.
  const gargalo = useMemo(() => {
    // "Nota pedida" fica de fora do gargalo: ela tem destaque próprio no kanban e
    // não é dinheiro travado — já foi pago.
    const porEtapa = ETAPAS.filter((e) => e.id !== "nota" && e.id !== "nota_pedida").map((e) => {
      const presos = todas.filter((c) => etapaDe(c) === e.id && temperatura(paradoDe(c)) !== "ok");
      return { etapa: e, n: presos.length, valor: presos.reduce((s, c) => s + c.valor, 0) };
    });
    return porEtapa.sort((a, b) => b.valor - a.valor)[0];
  }, [todas]);

  function alternarSelecao(id: string, comShift: boolean) {
    if (!comShift) return;
    setSelecionadas((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }

  function moverEtapa(c: Cobranca, etapa: EtapaId) {
    // Só "cobrar" tem rota real hoje; as outras transições dependem de
    // POST /api/cobrancas/:id/etapa (ver services/pipeline.ts).
    if (etapa === "cobrado" && !c.cobrado) {
      cobrar.mutate(c);
      return;
    }
    toast.info(`Mover para "${ETAPAS.find((e) => e.id === etapa)?.label}" depende da rota de etapa no backend.`);
  }

  const selecionadasObj = todas.filter((c) => selecionadas.includes(c.id));
  const metricas = metricasQuery.data;

  return (
    <div className="mx-auto max-w-[1240px] p-4 md:p-6 lg:p-7 pb-24">
      <header className="mb-5 flex items-start justify-between gap-5">
        <div>
          <h1 className="font-brand text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground">Financeiro</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Da consulta agendada à nota emitida. Arraste um paciente para mudar a etapa.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {metricas && (
            <div className="text-right">
              <Rotulo>A receber</Rotulo>
              <div className="mt-1.5 font-brand text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-terra-ink">
                {formatarBRL(metricas.valorPendente)}
              </div>
              <div className="text-[10.5px] text-terra-ink/75">a receber</div>
            </div>
          )}
          <BotaoAtualizar onClick={() => void cobrancasQuery.refetch()} carregando={cobrancasQuery.isFetching} />
        </div>
      </header>

      {/* Gargalo — onde o dinheiro está parado */}
      {gargalo && gargalo.n > 0 && (
        <div className="relative mb-4 pl-3.5">
          <span className="absolute left-0 top-[3px] h-[calc(100%-6px)] w-[2px] rounded-[1px] bg-terra" />
          <Rotulo className="text-terra-ink">Gargalo</Rotulo>
          <span className="mt-1.5 block min-w-0 flex-1 text-[13px] leading-relaxed text-terra-ink">
            <strong className="font-bold">{formatarBRL(gargalo.valor)}</strong> parados em{" "}
            <strong className="font-bold">{gargalo.etapa.label}</strong> — {gargalo.n}{" "}
            {gargalo.n === 1 ? "paciente" : "pacientes"} sem avançar.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setFiltro(filtro === "travadas" ? "todas" : "travadas")}
          >
            {filtro === "travadas" ? "Ver todos" : "Ver só travados"}
          </Button>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2.5">
        <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
          <SelectTrigger className="h-9 w-[190px] text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos os pacientes</SelectItem>
            <SelectItem value="travadas">Só os travados</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[12px] text-muted-foreground">
          {cobrancas.length} de {todas.length} · shift+clique para selecionar vários
        </span>
      </div>

      <DicaContextual
        id="financeiro"
        titulo="O dinheiro anda da esquerda para a direita"
        texto="Cada coluna é uma etapa entre a consulta e a nota. Se um paciente fica parado tempo demais numa delas, o card esfria e avisa — é aí que o dinheiro trava."
      />

      <KanbanFinanceiro
        cobrancas={cobrancas}
        selecionadas={selecionadas}
        onSelecionar={alternarSelecao}
        onAbrir={setAberta}
        onMover={moverEtapa}
        onEmitir={(c) => emitir.mutate(c)}
      />

      {/* Ações em lote */}
      {selecionadas.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit items-center gap-3 rounded-[8px] bg-primary py-2.5 pl-3.5 pr-2.5 text-white shadow-alta md:bottom-6">
          <span className="grid h-5 min-w-5 place-items-center rounded-[3px] bg-menta px-1.5 font-mono text-[11px] font-medium text-primary">
            {selecionadas.length}
          </span>
          <span className="text-[12.5px] font-semibold">selecionados</span>
          <Button
            size="sm"
            className="bg-white text-primary hover:bg-white/90"
            onClick={() => {
              selecionadasObj.filter((c) => !c.cobrado).forEach((c) => cobrar.mutate(c));
              setSelecionadas([]);
            }}
          >
            <MessageCircle size={13} /> Cobrar todos
          </Button>
          <button
            type="button"
            onClick={() => setSelecionadas([])}
            className="grid h-8 w-8 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {aberta && (
        <Gaveta
          c={aberta}
          onFechar={() => setAberta(null)}
          onCobrar={() => cobrar.mutate(aberta)}
          onEmitir={() => emitir.mutate(aberta)}
        />
      )}
    </div>
  );
}

/** Detalhe do paciente — abre à direita, sem tirar o kanban de vista. */
function Gaveta({
  c,
  onFechar,
  onCobrar,
  onEmitir,
}: {
  c: Cobranca;
  onFechar: () => void;
  onCobrar: () => void;
  onEmitir: () => void;
}) {
  const dias = paradoDe(c);
  const temp = temperatura(dias);
  const nota = situacaoNota(c);
  const etapa = ETAPAS.find((e) => e.id === etapaDe(c));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-primary/20 animate-in fade-in" onClick={onFechar} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[380px] animate-in slide-in-from-right flex-col border-l border-border bg-card shadow-alta duration-200">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">
            {c.nome.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-[15px] text-foreground">{c.nome}</strong>
            <span className="text-[11.5px] text-muted-foreground">{c.servico}</span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
          >
            <X size={16} />
          </button>
        </header>

        {temp !== "ok" && (
          <div className="relative border-b border-border px-5 py-3.5">
            <span className="absolute left-5 top-[17px] h-[calc(100%-30px)] w-[2px] rounded-[1px] bg-terra" />
            <div className="pl-3.5">
              <Rotulo className="text-terra-ink">Parado há {dias} dias</Rotulo>
              <p className="mt-0.5 text-[11.5px] opacity-85">
                Em {etapa?.label.toLowerCase()} desde então, sem avançar no ciclo.
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-5">
          <dl className="flex flex-col">
            {[
              ["Etapa", etapa?.label ?? "—"],
              ["Valor", formatarBRL(c.valor)],
              ["Agendamento", c.agendamento ?? "—"],
              ["Cobrado", c.cobrado ? (c.cobradoEm ?? "sim") : "não"],
              ["Pago", c.pago ? (c.pagoEm ?? "sim") : "não"],
              [
                "Nota",
                nota === "emitida"
                  ? (c.notaNum ?? "emitida pela clínica")
                  : nota === "pedida"
                    ? "pediu — falta emitir"
                    : nota === "dispensada"
                      ? "não quis"
                      : nota === "aguardando"
                        ? "perguntando"
                        : "—",
              ],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border py-2.5">
                <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className={cn("text-right text-[13px] font-semibold text-foreground", k !== "Etapa" && "font-mono")}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {!c.pago ? (
          <footer className="border-t border-border px-5 py-4">
            <Button className="w-full" onClick={onCobrar}>
              <MessageCircle size={14} /> {c.cobrado ? "Cobrar de novo" : "Cobrar pelo WhatsApp"}
            </Button>
          </footer>
        ) : nota === "pedida" ? (
          <footer className="border-t border-border px-5 py-4">
            <Button className="w-full" variant="outline" onClick={onEmitir}>
              <Check size={14} strokeWidth={2.6} /> Já emiti a nota
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Você emite no seu sistema fiscal; aqui só registramos.
            </p>
          </footer>
        ) : null}
      </aside>
    </>
  );
}
