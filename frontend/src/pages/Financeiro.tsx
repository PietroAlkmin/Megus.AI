import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import KanbanFinanceiro from "@/components/financeiro/KanbanFinanceiro";
import Agendador, { formatarQuando } from "@/components/financeiro/Agendador";
import DadosDaNota from "@/components/financeiro/DadosDaNota";
import { BotaoAtualizar } from "@/components/hoje/SecoesHoje";
import { cn, formatarBRL } from "@/lib/utils";
import { Rotulo } from "@/components/ui/megus";
import * as cobrancasService from "@/services/cobrancas";
import * as empresaService from "@/services/empresa";
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

  // O pagamento entra sem ninguém tocar na tela: o paciente manda o comprovante
  // no WhatsApp e o gate B baixa a cobrança. Sem intervalo, o kanban ficava
  // parado mostrando como pendente algo que já foi pago. A mesma chave alimenta
  // a Hoje — quem estiver aberto recebe a atualização.
  const cobrancasQuery = useQuery({
    queryKey: ["cobrancas"],
    queryFn: cobrancasService.listCobrancas,
    refetchInterval: 60_000,
  });
  const metricasQuery = useQuery({
    queryKey: ["cobrancas", "metricas"],
    queryFn: cobrancasService.getMetricas,
    refetchInterval: 60_000,
  });
  // Serviços trazem o código ISS, e a empresa o endereço do emissor — os dois
  // entram na gaveta quando a tarefa é emitir a nota. Sem intervalo: cadastro
  // só muda por ação de quem está olhando.
  const servicosQuery = useQuery({ queryKey: ["servicos"], queryFn: empresaService.listServicos });
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });
  const todas = cobrancasQuery.data ?? [];

  const cobrar = useMutation({
    // As duas rotas devolvem shapes diferentes (`{id,cobrado}` vs `{id,status}`).
    // Normalizamos para `{id}` — é tudo que a tela usa.
    //
    // ⚠️ Cobrar AGORA vence o agendamento: `cobrarCharge(id)` sem `quando` manda
    // na hora e o backend limpa `agendadaPara`. Sem isso o card continuaria
    // dizendo "envio 04/08" para algo que já foi enviado.
    mutationFn: async (c: Cobranca): Promise<{ id: string }> =>
      c.charge ? cobrancasService.cobrarCharge(c.id) : cobrancasService.cobrar(c.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
      toast.success("Cobrança enviada pelo WhatsApp.");
    },
    onError: () => toast.error("Não foi possível enviar a cobrança."),
  });

  /**
   * Agenda (ou desmarca) o envio da cobrança.
   *
   * Só existe no fluxo Charge: é ele que tem envio automático. O `EmissionIntent`
   * antigo não dispara sozinho — oferecer agendamento nele seria promessa falsa.
   * `quando: null` desmarca.
   */
  const agendar = useMutation({
    mutationFn: ({ c, quando }: { c: Cobranca; quando: Date | null }) =>
      cobrancasService.cobrarCharge(c.id, quando),
    onSuccess: (_, { quando }) => {
      void queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
      toast.success(quando ? "Envio agendado." : "Agendamento cancelado.");
    },
    onError: () => toast.error("Não foi possível agendar o envio."),
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
  // Quem o botão de lote vai REALMENTE cobrar agora. Cobrança já agendada fica
  // de fora: incluí-la mandaria a mensagem duas vezes ao mesmo paciente — e a
  // clínica só descobriria pela reclamação dele.
  const aCobrarAgora = selecionadasObj.filter((c) => !c.cobrado && !c.agendadaPara);
  const agendadasNaSelecao = selecionadasObj.filter((c) => c.agendadaPara && !c.cobrado).length;
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
            disabled={!aCobrarAgora.length}
            onClick={() => {
              aCobrarAgora.forEach((c) => cobrar.mutate(c));
              setSelecionadas([]);
            }}
          >
            <MessageCircle size={13} /> Cobrar {aCobrarAgora.length > 0 ? aCobrarAgora.length : "todos"}
          </Button>
          {/* Diz por que o número do botão é menor que o da seleção. */}
          {agendadasNaSelecao > 0 && (
            <span className="text-[11.5px] text-white/60">
              {agendadasNaSelecao} já agendada{agendadasNaSelecao > 1 ? "s" : ""}
            </span>
          )}
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
          onAgendar={(quando) => agendar.mutate({ c: aberta, quando })}
          onEmitir={() => emitir.mutate(aberta)}
          servico={(servicosQuery.data ?? []).find((s) => s.description === aberta.servico)}
          portal={(empresaQuery.data as { portalNfse?: string | null } | undefined)?.portalNfse}
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
  onAgendar,
  onEmitir,
  servico,
  portal,
}: {
  c: Cobranca;
  onFechar: () => void;
  onCobrar: () => void;
  onAgendar: (quando: Date | null) => void;
  onEmitir: () => void;
  servico?: empresaService.Servico;
  portal?: string | null;
}) {
  const [marcando, setMarcando] = useState(false);
  // Pediu nota e ainda não saiu → a tarefa é emitir, e os dados do tomador vêm
  // primeiro. Nos outros estados a gaveta segue sendo o histórico da cobrança.
  const paraEmitir = situacaoNota(c) === "pedida";
  /** ISO → dd/mm/aaaa. Sem isso a gaveta mostrava "2026-08-02T22:18:11.594Z". */
  const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : null);
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

        <div className="flex-1 overflow-auto">
          {/* Quem abre um card em "Nota pedida" tem UMA tarefa: passar os dados
              para o emissor da prefeitura. O estado interno da cobrança (etapa,
              cobrado, pago) serve para depurar, não para emitir — desce. */}
          {paraEmitir && <DadosDaNota c={c} servico={servico} portal={portal} />}

          <div className="px-5 py-5">
            {paraEmitir && <Rotulo className="mb-1 block">Histórico</Rotulo>}
          <dl className="flex flex-col">
            {[
              ["Etapa", etapa?.label ?? "—"],
              ["Valor", formatarBRL(c.valor)],
              ["Agendamento", dt(c.agendamento) ?? "—"],
              ["Cobrado", c.cobrado ? (dt(c.cobradoEm) ?? "sim") : "não"],
              ["Pago", c.pago ? (dt(c.pagoEm) ?? "sim") : "não"],
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
        </div>

        {!c.pago ? (
          <footer className="flex flex-col gap-2.5 border-t border-border px-5 py-4">
            <Button className="w-full" onClick={onCobrar}>
              <MessageCircle size={14} />{" "}
              {c.cobrado ? "Cobrar de novo" : c.agendadaPara ? "Cobrar agora" : "Cobrar pelo WhatsApp"}
            </Button>

            {/* Agendar só existe no fluxo Charge: é ele que tem envio automático. */}
            {c.charge &&
              !c.cobrado &&
              (marcando ? (
                <Agendador
                  atual={c.agendadaPara}
                  onConfirmar={(quando) => {
                    onAgendar(quando);
                    setMarcando(false);
                  }}
                  onCancelar={() => setMarcando(false)}
                />
              ) : c.agendadaPara ? (
                <div className="flex items-center gap-2 rounded-[7px] bg-muted px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-secondary-foreground">
                    <Clock size={12} className="mr-1 inline align-[-2px]" />
                    Envio marcado para <strong className="font-semibold">{formatarQuando(c.agendadaPara)}</strong>
                  </span>
                  <Button size="sm" variant="quieto" onClick={() => setMarcando(true)}>
                    Alterar
                  </Button>
                  <Button size="sm" variant="quieto" onClick={() => onAgendar(null)}>
                    Desmarcar
                  </Button>
                </div>
              ) : (
                <Button className="w-full" variant="outline" onClick={() => setMarcando(true)}>
                  <Clock size={14} /> Agendar envio
                </Button>
              ))}
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
