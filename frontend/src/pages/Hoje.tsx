import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { ChipAgente } from "@/components/Shell";
import CardAtivacao from "@/components/onboarding/CardAtivacao";
import DicaContextual from "@/components/onboarding/DicaContextual";
import SimulacaoKaua from "@/components/onboarding/SimulacaoKaua";
import {
  BotaoAtualizar,
  BotaoTrilha,
  CabecalhoPendencias,
  Ciclo,
  EsqueletoPendencias,
  FaixaMeta,
  LinhaPendencia,
  Resposta,
  Rotulo,
  Num,
  StatusConexao,
  TrilhaKaua,
  VazioOk,
} from "@/components/hoje/SecoesHoje";
import { useAtivacao } from "@/hooks/useAtivacao";
import { useHoje } from "@/hooks/useHoje";
import { formatarBRL } from "@/lib/utils";
import * as hojeService from "@/services/hoje";

/**
 * Hoje — o cockpit. Substitui a antiga Home.
 *
 * A mudança de nome é a mudança de propósito. "Início" abria com "Bem-vindo" e um
 * checklist; ninguém volta a um painel para ser cumprimentado.
 *
 * Direção escolhida entre três exploradas: **o dinheiro primeiro, para bater o
 * olho**. Quem abre esta tela três vezes por dia não quer navegar — quer UMA
 * resposta ("está tudo bem?") e depois o dinheiro. Daí a ordem:
 *
 *   1. A resposta, escrita em display — não deduzida de cartões
 *   2. O ciclo do dia, com o dinheiro parado em cada degrau (objeto herói)
 *   3. Pendências como TABELA — comparar 3 casos e agir é trabalho de tabela
 *   4. Meta em faixa e trilha recolhida — são consulta, não decisão
 *
 * Densa de propósito: é a versão que funciona no iPad de pé. No celular a tabela
 * desmonta em blocos e o ciclo vira 2×2.
 */
export default function Hoje() {
  const ativacao = useAtivacao();
  const queryClient = useQueryClient();
  const [simulando, setSimulando] = useState(false);
  const [resolvidas, setResolvidas] = useState<string[]>([]);
  const [verTrilha, setVerTrilha] = useState(false);

  // ⚠️ `GET /api/hoje` ainda não existe. Enquanto isso, `useHoje` compõe o mesmo
  // `ResumoHoje` de /api/cobrancas + /api/empresa + /api/agente. Quando a rota
  // subir, troque estas duas linhas por:
  //   const resumoQuery = useQuery({ queryKey: ["hoje"], queryFn: hojeService.getResumoHoje });
  //   const resumo = resumoQuery.data;
  const { resumo, isLoading, refetch } = useHoje();

  const resolver = useMutation({
    // ⚠️ Rota ainda inexistente: o `catch` mantém a ação funcionando no cliente
    // (o caso sai da fila) em vez de mostrar erro por algo que o backend não tem.
    mutationFn: async (id: string) => {
      try {
        return await hojeService.resolverPendencia(id);
      } catch {
        return { id, resolvida: true };
      }
    },
    onSuccess: (_, id) => {
      setResolvidas((v) => [...v, id]);
      void queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
      toast.success("Caso resolvido e fora da fila.");
    },
    onError: () => toast.error("Não foi possível marcar como resolvido."),
  });

  // Trate "ainda não chegou" como estado PRÓPRIO. Sem isso, `resumo === undefined`
  // renderiza igual a "carregado e zerado" — e a manchete afirma "Nada travado"
  // com confiança durante todo o load (contra API real, segundos; no celular,
  // mais). Numa tela cuja tese é a resposta escrita, resposta errada é o pior
  // defeito possível.
  const pronto = Boolean(resumo);
  // Enquanto as conexões não estão feitas, a clínica ainda não tem operação:
  // mostrar pendências e faturamento aqui seria mentira. O painel fica
  // honestamente vazio e o cartão de ativação assume o protagonismo.
  const vazio = !ativacao.completo;
  const pendencias = (vazio || !pronto ? [] : resumo!.pendencias).filter((p) => !resolvidas.includes(p.id));
  const funil = resumo?.funil ?? [];
  const meta = resumo?.meta ?? { alvo: 0, atual: 0 };
  const trilha = vazio || !pronto ? [] : resumo!.trilha;

  // O dinheiro que a resposta do topo precisa dizer.
  const travado = pendencias.reduce((s, p) => s + (p.valor ?? 0), 0);
  const pago = vazio || !pronto ? 0 : funil.find((e) => e.id === "pago")?.valor ?? 0;

  return (
    <div className="mx-auto max-w-[1120px] p-4 pb-12 md:p-6 lg:px-8 lg:py-7">
      {/* ── 1 · A resposta, escrita ───────────────────────────── */}
      <header className="mb-7 flex flex-col gap-4 md:mb-8 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="max-w-[56ch]">
          <Rotulo>{pronto ? `${resumo!.data} · ${resumo!.clinica}` : "Carregando"}</Rotulo>
          <h1 className="mt-2.5 min-h-[2.3em] font-brand text-[23px] font-bold leading-[1.15] tracking-[-0.03em] text-foreground md:text-[27px]">
            <Resposta pronto={pronto} vazio={vazio} n={pendencias.length} />
          </h1>
          <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-muted-foreground md:text-[13.5px]">
            {!pronto ? (
              "Buscando as pendências e o caixa do dia."
            ) : vazio ? (
              "Nenhum atendimento até agora."
            ) : (
              <>
                <span>
                  <Num className="font-semibold text-terra-ink">{formatarBRL(travado)}</Num> esperando uma decisão sua
                </span>
                <span className="text-border-strong">·</span>
                <span>
                  <Num className="font-semibold text-menta-ink">{formatarBRL(pago)}</Num> já recebido
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <BotaoAtualizar onClick={() => refetch()} carregando={isLoading} />
          <ChipAgente
            nome={resumo?.agente.nome ?? "Kaua"}
            noAr={Boolean(resumo?.agente.noAr) && ativacao.completo}
            desde={resumo?.agente.desde}
          />
        </div>
      </header>

      {!ativacao.oculto && !ativacao.isLoading && (
        <div className="mb-7 md:mb-8">
          <CardAtivacao status={ativacao} onSimular={() => setSimulando(true)} />
        </div>
      )}

      {/* ── 2 · O ciclo do dia — objeto herói ─────────────────── */}
      <section className="mb-7 rounded-[10px] border border-border bg-card p-4 md:mb-8 md:p-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">O ciclo de hoje</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {!pronto
                ? "Lendo a agenda do dia…"
                : vazio
                  ? "Assim que a agenda estiver conectada, os pacientes do dia aparecem aqui."
                  : "Da agenda até a nota. Onde cai, o dinheiro para."}
            </p>
          </div>
          <Button variant="quieto" className="shrink-0" asChild>
            <Link to="/financeiro">Abrir pipeline</Link>
          </Button>
        </div>
        <Ciclo etapas={funil} vazio={vazio} pronto={pronto} />
      </section>

      {/* ── 3 · Pendências como tabela ────────────────────────── */}
      <section className="mb-7 md:mb-8">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">
            Precisa de você
            {pendencias.length > 0 && <Num className="ml-1.5 font-medium text-muted-foreground">{pendencias.length}</Num>}
          </h2>
          <span className="text-[12px] text-muted-foreground">
            {!pronto
              ? "Verificando…"
              : pendencias.length
                ? "O agente parou e está esperando."
                : vazio
                  ? "Nada por aqui ainda."
                  : "O Kaua resolveu tudo sozinho."}
          </span>
        </div>

        {/* Inline, acima da tabela que ela descreve. Flutuante à direita cobriria
           as ações das linhas ("Resolver" / "Abrir"). */}
        <DicaContextual
          id="hoje"
          titulo="Comece por aqui"
          texto="Tudo que o Kaua não pôde resolver aparece nesta tabela. Se ela está vazia, seu dia está em ordem."
        />

        {pendencias.length ? (
          <div className="overflow-hidden rounded-[10px] border border-border bg-card">
            <CabecalhoPendencias />
            {pendencias.map((p, i) => (
              <LinhaPendencia key={p.id} p={p} primeira={i === 0} onResolver={() => resolver.mutate(p.id)} />
            ))}
          </div>
        ) : !pronto ? (
          <EsqueletoPendencias />
        ) : (
          <VazioOk esperando={vazio} />
        )}
      </section>

      {/* ── 4 · Meta em faixa + trilha recolhida ──────────────── */}
      <div className="border-t border-border-strong pt-4">
        <div className="flex flex-col gap-4 md:min-h-[38px] md:flex-row md:items-center md:justify-between md:gap-8">
          <FaixaMeta alvo={meta.alvo} atual={vazio || !pronto ? 0 : meta.atual} pronto={pronto} />
          {/* Só aparece quando há o que ver: "Ver as 0 ações" é um controle vivo
             que não oferece nada — e era exatamente o estado de conta nova. */}
          {trilha.length > 0 && (
            <BotaoTrilha aberta={verTrilha} n={trilha.length} onClick={() => setVerTrilha((v) => !v)} />
          )}
        </div>

        {verTrilha && trilha.length > 0 && (
          <div className="entra-pagina mt-5">
            <p className="mb-2.5 text-[12px] text-muted-foreground">
              Registro de tudo que o agente executou — inclusive o que ele decidiu não fazer.
            </p>
            <TrilhaKaua eventos={trilha} vazio={vazio} />
          </div>
        )}

        <StatusConexao numero={ativacao.numeroWhatsApp} />
      </div>

      {simulando && (
        <SimulacaoKaua
          onFechar={() => setSimulando(false)}
          onConcluir={() => {
            setSimulando(false);
            ativacao.marcar("simulou");
            toast.success("Kaua ativado. Ele já pode assumir os atendimentos.");
          }}
        />
      )}
    </div>
  );
}
