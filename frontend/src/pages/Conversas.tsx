import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Copy, Download, Eye, FileText, Headphones, Image as ImageIcon, MessageSquare, Search, Send, User, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Rotulo } from "@/components/ui/megus";
import * as conversasService from "@/services/conversas";
import type { Conversa, Mensagem } from "@/services/conversas";
import type { LinhaRaciocinio } from "@/services/raciocinio";
import * as raciocinioService from "@/services/raciocinio";
import type { FichaPaciente as Ficha } from "@/services/ficha";
import * as fichaService from "@/services/ficha";
import { useNomeAgente } from "@/hooks/useNomeAgente";

/**
 * Conversas — inbox de atendimento.
 *
 * Três colunas, e a da direita é o diferencial: além de ler a conversa, o usuário
 * vê O QUE O AGENTE ENTENDEU em cada passo — e é o que permite confiar sem reler
 * tudo.
 *
 * Desenho: esta é a única tela do app que não é documento — é uma CAIXA DE
 * ENTRADA. Por isso o cabeçalho é uma barra fina (não o bloco de título das
 * outras telas), a lista não usa fio entre itens (a seleção e o hover bastam) e
 * o vazio ocupa a área inteira em vez de deixar buraco.
 *
 * O filtro padrão é "Precisa de você", não "Todas": a fila humana é o que traz o
 * usuário a esta tela. Abrir em "Todas" o obrigaria a filtrar antes de trabalhar.
 */
const FILTROS = [
  // Rótulos curtos de propósito: quatro chips com frase inteira não cabem em
  // 292px e quebravam em duas fileiras. "Travadas" é a palavra da casa — a Hoje
  // diz "casos travados", o Financeiro diz "travado há 2 dias".
  { id: "precisa", label: "Travadas", status: "AGUARDANDO" as const },
  { id: "kaua", label: "agente", status: "BOT" as const }, // rótulo trocado pelo nome real em runtime
  { id: "humano", label: "Humano", status: "HUMANO" as const },
  { id: "todas", label: "Todas", status: null },
] as const;

const TAG_STATUS: Record<string, { t: string; cls: string }> = {
  AGUARDANDO: { t: "Precisa de você", cls: "bg-terra-soft text-terra-ink" },
  BOT: { t: "agente", cls: "bg-menta-soft text-menta-ink" }, // `t` trocado pelo nome real em runtime
  HUMANO: { t: "Humano", cls: "bg-info-soft text-info" },
  // O agente perguntando "vai precisar de nota?" — está conduzindo, não travado.
  AGUARDANDO_NOTA: { t: "Perguntando da nota", cls: "bg-menta-soft text-menta-ink" },
};

/**
 * O backend evolui `ConversationState` (ganhou `awaiting_nota_answer`), então um
 * status desconhecido é questão de quando, não de se. Sem fallback,
 * `TAG_STATUS[x].cls` derruba a tela inteira por causa de um rótulo.
 */
/** `nomeAgente` troca o rótulo do estado BOT: quem conduz tem nome, e é o da clínica. */
const tagDe = (status: string, nomeAgente: string) => {
  const base = TAG_STATUS[status] ?? { t: "Em andamento", cls: "bg-muted text-secondary-foreground" };
  return status === "BOT" ? { ...base, t: nomeAgente } : base;
};

export default function Conversas() {
  const { nome, Nome } = useNomeAgente();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("precisa");
  const [selId, setSelId] = useState<string | null>(null);
  // Celular: mestre-detalhe. `aberto` diz se o chat cobre a lista.
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [rascunho, setRascunho] = useState("");
  const rolagem = useRef<HTMLDivElement>(null);

  // "todos" = todas as integrações da empresa (o backend resolve por tenant).
  const conversasQuery = useQuery({
    queryKey: ["conversas"],
    queryFn: () => conversasService.listConversas("todos"),
    // 15s: a lista é a fila de trabalho da recepção. Meio minuto era tempo
    // demais para "chegou paciente novo" aparecer.
    refetchInterval: 15_000,
  });
  const conversas = conversasQuery.data ?? [];

  /** Casa com o texto digitado — avaliado à parte para a fixação abaixo. */
  const passaBusca = useCallback(
    (c: Conversa) => {
      const q = busca.trim().toLowerCase();
      return !q || [c.nome, c.telefone].some((x) => (x ?? "").toLowerCase().includes(q));
    },
    [busca],
  );

  const filtrada = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!;
    return conversas.filter((c) => (!f.status || c.status === f.status) && passaBusca(c));
  }, [conversas, filtro, passaBusca]);

  /**
   * A conversa ABERTA fica na lista mesmo quando deixa de casar com o FILTRO.
   *
   * Sem isso, assumir uma conversa a expulsa de "Travadas" — e o auto-select
   * abaixo joga o usuário em OUTRO paciente, logo depois de ele agir. Ele nunca
   * chega a responder (o compositor só existe na conversa assumida) e ainda
   * corre o risco de responder a pessoa errada.
   *
   * A busca NÃO entra nessa exceção: filtro é "mostre esta categoria", busca é
   * "ache esta pessoa". Fixar contra a busca devolveria um paciente que não casa
   * com o que foi digitado — resultado mentiroso.
   */
  const fixada = useMemo(() => {
    if (!selId || filtrada.some((c) => c.id === selId)) return null;
    return conversas.find((c) => c.id === selId && passaBusca(c)) ?? null;
  }, [conversas, filtrada, selId, passaBusca]);
  const lista = useMemo(() => (fixada ? [fixada, ...filtrada] : filtrada), [fixada, filtrada]);

  // Auto-seleciona quando o filtro ou a busca muda e nada válido está aberto.
  // `lista` já inclui a fixada, então assumir/devolver não disparam isso.
  useEffect(() => {
    if (!lista.length) {
      setSelId(null);
      return;
    }
    if (!lista.some((c) => c.id === selId)) setSelId(lista[0].id);
  }, [lista, selId]);

  const mensagensQuery = useQuery({
    queryKey: ["conversas", selId, "mensagens"],
    queryFn: () => conversasService.listMensagens(selId!),
    enabled: Boolean(selId),
    // Isto é um CHAT: quem assumiu a conversa está esperando a resposta do
    // paciente agora. Sem intervalo era preciso recarregar a página para ver a
    // mensagem chegar — o que inviabiliza atender pelo painel.
    refetchInterval: 5_000,
  });
  const racQuery = useQuery({
    queryKey: ["conversas", selId, "raciocinio"],
    queryFn: () => raciocinioService.getRaciocinio(selId!),
    enabled: Boolean(selId),
    // Acompanha as mensagens: o raciocínio muda no mesmo turno em que o
    // paciente responde.
    refetchInterval: 5_000,
  });
  // A ficha cresce durante a conversa (o paciente vai respondendo endereço,
  // nascimento…), então acompanha as mensagens no mesmo ritmo.
  const fichaQuery = useQuery({
    queryKey: ["conversas", selId, "ficha"],
    queryFn: () => fichaService.getFicha(selId!),
    enabled: Boolean(selId),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollTop = rolagem.current.scrollHeight;
  }, [mensagensQuery.data]);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["conversas"] });
  };

  const assumir = useMutation({
    mutationFn: () => conversasService.assumir(selId!),
    onSuccess: () => {
      invalidar();
      toast.success(`Você assumiu a conversa. ${Nome} está pausado aqui.`);
    },
    onError: () => toast.error("Não foi possível assumir a conversa."),
  });

  const retomar = useMutation({
    mutationFn: () => conversasService.retomar(selId!),
    onSuccess: () => {
      invalidar();
      toast.success(`Conversa devolvida para ${nome}.`);
    },
    onError: () => toast.error("Não foi possível devolver a conversa."),
  });

  const enviar = useMutation({
    mutationFn: (texto: string) => conversasService.enviar(selId!, texto),
    onSuccess: () => {
      setRascunho("");
      void queryClient.invalidateQueries({ queryKey: ["conversas", selId, "mensagens"] });
      invalidar();
    },
    onError: () => toast.error("Não foi possível enviar a mensagem."),
  });

  const sel = conversas.find((c) => c.id === selId);
  const conta = (status: string | null) => conversas.filter((c) => !status || c.status === status).length;
  const rac = racQuery.data ?? [];
  const naFila = conta("AGUARDANDO");
  const buscando = busca.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Barra fina, não bloco de título: caixa de entrada se navega, não se lê.
          O resumo à direita responde "por que estou aqui" sem parágrafo. */}
      <header
        className={cn(
          "shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card px-4 py-3 md:flex md:px-6",
          aberto ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex items-baseline gap-3">
          <h1 className="font-brand text-[19px] font-bold leading-none tracking-[-0.025em] text-foreground">Conversas</h1>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">o que {nome} entendeu de cada mensagem</span>
        </div>
        {naFila > 0 && (
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-terra-soft px-3 py-1 text-[11.5px] font-semibold text-terra-ink">
            <span className="h-[6px] w-[6px] animate-pulso rounded-full bg-terra" />
            {naFila} esperando você
          </span>
        )}
      </header>

      {/* Duas colunas, não três: o raciocínio virou um bloco DENTRO do chat.
          Como coluna fixa ele custava 296px permanentes para exibir 4 linhas —
          o resto era ar — e repetia o que a mensagem de sistema já dizia. */}
      <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[292px_1fr]">
        {/* lista */}
        <div className={cn("min-h-0 flex-col border-border/70 bg-card md:flex md:border-r", aberto ? "hidden md:flex" : "flex")}>
          <div className="flex flex-col gap-2.5 px-3 py-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar paciente…"
                className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-[12.5px] outline-none transition-shadow focus:ring-2 focus:ring-ring"
              />
            </div>
            {/* Barra segmentada, não chips soltos: quatro células iguais cabem
               em 292px sem quebrar, e o número em cima vira um resumo da fila. */}
            <div className="flex rounded-[9px] bg-muted p-0.5">
              {FILTROS.map((f) => {
                const on = filtro === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltro(f.id)}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-0.5 rounded-[7px] py-1.5 transition-all duration-150",
                      on ? "bg-card shadow-sutil" : "hover:bg-card/60",
                    )}
                  >
                    <span className={cn("font-mono text-[12.5px] font-semibold leading-none tabular-nums", on ? "text-foreground" : "text-muted-foreground")}>
                      {conta(f.status)}
                    </span>
                    <span className={cn("text-[10px] font-semibold leading-none", on ? "text-secondary-foreground" : "text-muted-foreground")}>
                      {f.id === "kaua" ? nome : f.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sem fio entre itens: a seleção e o hover já separam. Fio em toda
             linha endurece uma tela que é, no fundo, uma pilha de pessoas. */}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
            {lista.map((c, i) => (
              <ItemConversa
                key={c.id}
                c={c}
                i={i}
                ativo={c.id === selId}
                presa={Boolean(fixada && c.id === fixada.id)}
                onClick={() => {
                  setSelId(c.id);
                  setAberto(true);
                }}
              />
            ))}
            {!lista.length && (
              <div className="px-3 py-10 text-center">
                <p className="text-[12.5px] text-muted-foreground">
                  {buscando ? "Nenhum paciente com esse nome." : "Nada neste filtro."}
                </p>
                {!buscando && filtro !== "todas" && (
                  <button
                    type="button"
                    onClick={() => setFiltro("todas")}
                    className="mt-2 text-[12px] font-semibold text-menta-ink underline-offset-2 hover:underline"
                  >
                    Ver todas as conversas
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* chat */}
        <div className={cn("min-h-0 flex-col bg-background md:flex", aberto ? "flex" : "hidden md:flex")}>
          {!sel ? (
            <VazioChat vazioTotal={!lista.length} buscando={buscando} />
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2.5 border-b border-border/70 bg-card px-3 py-2.5 md:px-4">
                {/* Celular: caminho de volta para a lista */}
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  title="Voltar à lista"
                  className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                >
                  <ArrowLeft size={16} strokeWidth={1.9} />
                </button>
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">
                  {sel.nome.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[13.5px] text-foreground">{sel.nome}</strong>
                  <span className="font-mono text-[11px] text-muted-foreground">{sel.telefone}</span>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em]",
                    tagDe(sel.status, nome).cls,
                  )}
                >
                  {tagDe(sel.status, nome).t}
                </span>
              </div>

              <div key={sel.id} ref={rolagem} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto px-3.5 py-4 md:px-6 md:py-5">
                {mensagensQuery.isLoading ? (
                  <Digitando />
                ) : (
                  (mensagensQuery.data ?? []).map((m, i) => <Bolha key={m.id} m={m} i={i} />)
                )}
              </div>

              {/* Ficha acima do raciocínio: a tarefa da recepção (recadastrar o
                  paciente no sistema da clínica) vem antes da auditoria do que
                  o agente entendeu. */}
              <FichaDoPaciente conversa={sel} ficha={fichaQuery.data ?? null} />

              <Raciocinio itens={rac} bloqueado={sel.status === "AGUARDANDO"} chave={sel.id} />

              <div className="shrink-0 border-t border-border/70 bg-card px-3 py-3 md:px-4">
                {sel.status === "HUMANO" ? (
                  <div className="flex animate-in flex-wrap items-end gap-2 fade-in slide-in-from-bottom-1">
                    <textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (rascunho.trim()) enviar.mutate(rascunho.trim());
                        }
                      }}
                      rows={1}
                      placeholder="Escreva como a recepção…"
                      className="max-h-28 min-h-[40px] flex-1 resize-y rounded-[14px] border border-border bg-background px-3.5 py-2.5 text-[12.5px] leading-relaxed outline-none transition-shadow focus:ring-2 focus:ring-ring"
                    />
                    <Button onClick={() => enviar.mutate(rascunho.trim())} disabled={!rascunho.trim() || enviar.isPending}>
                      <Send size={14} /> Enviar
                    </Button>
                    <Button variant="outline" onClick={() => retomar.mutate()}>
                      Devolver para {nome}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      <Eye size={14} /> Modo monitoramento — {nome} está conduzindo
                    </span>
                    <Button onClick={() => assumir.mutate()} disabled={assumir.isPending}>
                      <Headphones size={14} /> Assumir conversa
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

const CAMPOS_FICHA: { k: keyof Ficha | "telefone"; rot: string; largo?: boolean; fmt?: (v: string) => string }[] = [
  { k: "nome", rot: "Nome" },
  { k: "sobrenome", rot: "Sobrenome" },
  { k: "cpf", rot: "CPF" },
  { k: "nascimento", rot: "Nascimento", fmt: (v) => v.split("-").reverse().join("/") },
  { k: "sexo", rot: "Sexo", fmt: (v) => (v === "F" ? "Feminino" : v === "M" ? "Masculino" : v) },
  { k: "telefone", rot: "Telefone" },
  { k: "email", rot: "E-mail" },
  { k: "cep", rot: "CEP" },
  { k: "endereco", rot: "Endereço", largo: true },
  { k: "cidade", rot: "Cidade" },
  { k: "uf", rot: "UF" },
  { k: "convenio", rot: "Convênio" },
];

/**
 * A ficha que a clínica vai RECADASTRAR no sistema dela (Amplimed e afins).
 *
 * O Megus não é prontuário. A clínica no ar digita o paciente novo no sistema
 * dela na mão, e as instruções do agente já pedem esses dados no primeiro
 * contato — mas eles morriam no histórico e ela relia mensagem por mensagem.
 *
 * Fica na CONVERSA, não no Financeiro: aqui o paciente é uma pessoa, e é aqui
 * que o dado foi coletado. No Financeiro ele é uma cobrança, e o que interessa
 * lá são os campos fiscais.
 *
 * **O que falta é tão informativo quanto o que veio.** Campo em branco diz "o
 * agente não perguntou isso" — por isso os ausentes aparecem em vez de sumirem.
 */
function FichaDoPaciente({ conversa, ficha }: { conversa: Conversa; ficha: Ficha | null }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const f = (ficha ?? {}) as Record<string, string | boolean | undefined>;
  // O telefone vem da CONVERSA, não da ficha: é o identificador do WhatsApp.
  const val = (campo: (typeof CAMPOS_FICHA)[number]): string | undefined =>
    campo.k === "telefone" ? conversa.telefone : (f[campo.k as string] as string | undefined);
  const mostrar = (campo: (typeof CAMPOS_FICHA)[number], v: string) => (campo.fmt ? campo.fmt(v) : v);
  const preenchidos = CAMPOS_FICHA.filter((x) => val(x));
  const faltam = CAMPOS_FICHA.length - preenchidos.length;

  const copiarTudo = () => {
    void navigator.clipboard.writeText(preenchidos.map((x) => `${x.rot}: ${mostrar(x, val(x)!)}`).join("\n"));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  };

  const baixarCsv = () => {
    const cab = preenchidos.map((x) => x.rot).join(",");
    const vals = preenchidos.map((x) => `"${mostrar(x, val(x)!)}"`).join(",");
    // BOM para o Excel abrir com acento certo — planilha é o formato que todo
    // sistema importa, inclusive os que não têm API.
    const url = URL.createObjectURL(new Blob([`﻿${cab}\n${vals}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `paciente-${String(f.nome ?? "sem-nome").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex min-h-0 flex-col border-t border-border/70 bg-card", aberto ? "shrink" : "shrink-0")}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full shrink-0 items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 md:px-4"
      >
        <User size={13} className="shrink-0 text-muted-foreground" />
        <strong className="shrink-0 text-[12px] font-semibold text-foreground">Ficha do paciente</strong>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          {faltam === 0 ? "completa" : `${faltam} ${faltam > 1 ? "campos em branco" : "campo em branco"}`}
          {f.novo ? " · paciente novo" : ""}
        </span>
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")}
        />
      </button>

      {aberto && (
        <div className="max-h-[38vh] min-h-0 overflow-auto border-t border-border/70 px-3 pb-3 pt-2.5 md:px-4">
          <dl className="grid gap-x-5 sm:grid-cols-2">
            {CAMPOS_FICHA.map((campo) => {
              const v = val(campo);
              return (
                <div
                  key={String(campo.k)}
                  className={cn(
                    "flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5",
                    campo.largo && "sm:col-span-2",
                  )}
                >
                  <Rotulo className="shrink-0">{campo.rot}</Rotulo>
                  {v ? (
                    /* Clicar num campo copia SÓ ele: às vezes ela precisa de um
                       dado só, e copiar a ficha toda obrigaria a limpar o resto. */
                    <button
                      type="button"
                      title={mostrar(campo, v)}
                      onClick={() => void navigator.clipboard.writeText(mostrar(campo, v))}
                      className="min-w-0 truncate text-right font-mono text-[12px] text-foreground hover:underline"
                    >
                      {mostrar(campo, v)}
                    </button>
                  ) : (
                    <span className="text-right text-[11.5px] text-muted-foreground/70">não perguntado</span>
                  )}
                </div>
              );
            })}
          </dl>

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={copiarTudo}>
              {copiado ? <Check size={12} strokeWidth={2.6} /> : <Copy size={12} />}
              {copiado ? "Copiado" : "Copiar ficha"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={baixarCsv}>
              <Download size={12} /> Baixar CSV
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * O que o Kaua entendeu — acima do compositor, não numa coluna à parte.
 *
 * Era uma terceira coluna de 296px. O problema não foi o conteúdo, foi o
 * formato: quatro linhas de leitura ocupando uma coluna inteira, com ~350px de
 * ar embaixo, repetindo o que a mensagem de sistema da conversa já dizia.
 *
 * Aqui ele fica encostado na decisão que você vai tomar — e o chat recupera a
 * largura. Recolhido quando o Kaua está conduzindo (nada a decidir); aberto
 * quando ele travou, que é quando o motivo importa.
 */
function Raciocinio({ itens, bloqueado, chave }: { itens: LinhaRaciocinio[]; bloqueado: boolean; chave: string }) {
  const { nome, Nome } = useNomeAgente();
  const [aberto, setAberto] = useState(bloqueado);
  // Reabre ao trocar para uma conversa travada, recolhe nas demais.
  useEffect(() => {
    setAberto(bloqueado);
  }, [chave, bloqueado]);

  if (!itens.length) return null;
  const falhou = itens.filter((r) => !r.ok).length;

  return (
    <div className={cn("shrink-0 border-t border-border/70 bg-card", bloqueado && "border-l-2 border-l-terra bg-terra-soft/25")}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 md:px-4"
      >
        <Zap size={13} className={bloqueado ? "text-terra-ink" : "text-muted-foreground"} />
        <strong className="shrink-0 text-[12px] text-foreground">{bloqueado ? `${Nome} parou aqui` : `O que ${nome} entendeu`}</strong>
        {/* Recolhido, o resumo já entrega o essencial: quantas conferências e se
           alguma falhou. Abrir vira opção, não obrigação. */}
        {!aberto && (
          <span className="truncate text-[11.5px] text-muted-foreground">
            {falhou > 0 ? (
              <>
                · <span className="text-destructive">{falhou} não {falhou === 1 ? "bate" : "batem"}</span>
              </>
            ) : (
              `· ${itens.length} conferências, tudo certo`
            )}
          </span>
        )}
        <ChevronDown size={13} className={cn("ml-auto shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="px-3 pb-3 md:px-4">
          {/* Em duas colunas: quatro conferências cabem em duas fileiras e o
             bloco não rouba altura do chat. */}
          <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
            {itens.map((r, n) => (
              <div key={n} style={{ "--i": n } as CSSProperties} className="flex animate-entra-item items-start gap-2">
                <span className={cn("mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full", r.ok ? "bg-menta-dark" : "bg-destructive")} />
                <div className="min-w-0">
                  {/* Span próprio em vez de <Rotulo>: o `leading-none` dele
                     colapsa quando o rótulo quebra em duas linhas
                     ("NOME INFORMADO") e o valor sobe por cima. */}
                  <span className="block font-mono text-[9.5px] font-medium uppercase leading-[1.4] tracking-[0.14em] text-muted-foreground">
                    {r.chave}
                  </span>
                  <span className={cn("mt-0.5 block text-[12px] font-semibold leading-snug", r.ok ? "text-foreground" : "text-destructive")}>
                    {r.valor}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {bloqueado && (
            <p className="mt-3 border-t border-border/70 pt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Ele não insiste nem adivinha quando um dado não confere. Assuma a conversa para resolver.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O vazio precisa dizer o que está acontecendo, não só que está vazio.
 *
 * Dois casos diferentes: não há conversa nenhuma no filtro (silêncio real — e
 * silêncio aqui é boa notícia) ou há lista e nada aberto (só falta escolher).
 */
function VazioChat({ vazioTotal, buscando }: { vazioTotal: boolean; buscando: boolean }) {
  const { nome, Nome } = useNomeAgente();
  return (
    <div className="grid flex-1 place-items-center px-8 py-12 text-center">
      <div className="max-w-[34ch] animate-in fade-in">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
          {/* O ícone segue o TEXTO: busca sem resultado não é sucesso. Ramificar só
             por `vazioTotal` punha um ✓ de tarefa cumprida sobre "Nada encontrado". */}
          {buscando ? (
            <Search size={22} strokeWidth={1.8} />
          ) : vazioTotal ? (
            <Check size={22} strokeWidth={2.4} />
          ) : (
            <MessageSquare size={22} strokeWidth={1.8} />
          )}
        </span>
        {vazioTotal ? (
          <>
            <strong className="mt-4 block text-[14px] font-semibold text-foreground">
              {buscando ? "Nada encontrado" : "Ninguém esperando"}
            </strong>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {buscando
                ? "Nenhum paciente com esse nome nas conversas deste filtro."
                : `${Nome} está conduzindo tudo sozinho. Quando travar em algo, a conversa aparece aqui.`}
            </p>
          </>
        ) : (
          <>
            <strong className="mt-4 block text-[14px] font-semibold text-foreground">Escolha uma conversa</strong>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Além das mensagens, você vê o que {nome} entendeu de cada uma — e onde parou.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Enquanto as mensagens carregam — movimento no lugar de "Carregando…". */
function Digitando() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-[14px] rounded-bl-[4px] border border-border bg-card px-3.5 py-3">
        {[0, 1, 2].map((n) => (
          <span key={n} className="h-[6px] w-[6px] animate-ponto rounded-full bg-border-strong" style={{ animationDelay: `${n * 0.16}s` }} />
        ))}
      </div>
    </div>
  );
}

function ItemConversa({
  c,
  i,
  ativo,
  presa,
  onClick,
}: {
  c: Conversa;
  i: number;
  ativo: boolean;
  presa: boolean;
  onClick: () => void;
}) {
  const { nome: nomeAgente } = useNomeAgente();
  const tag = tagDe(c.status, nomeAgente);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ "--i": i } as CSSProperties}
      className={cn(
        "relative flex w-full animate-entra-item items-start gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition-colors duration-150",
        ativo ? "bg-background" : "hover:bg-background/70",
        // Fora do filtro, mas mantida à vista por estar aberta.
        presa && "ring-1 ring-inset ring-border",
      )}
    >
      {/* Marca da seleção: cresce em vez de piscar. */}
      <span
        className={cn(
          "absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-gesto transition-all duration-200",
          ativo ? "h-7 opacity-100" : "h-0 opacity-0",
        )}
      />
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">
        {c.nome.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] font-bold text-foreground">{c.nome}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{horaCurta(c.hora)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{c.ultima}</span>
        <span className={cn("mt-1.5 inline-flex rounded-full px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em]", tag.cls)}>
          {tag.t}
        </span>
      </span>
    </button>
  );
}

/** ISO → "21:48"; de outro dia, "29/07 21:48". Sem data válida, string vazia. */
function horaCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return hora;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/**
 * "[image]" / "[document]" é o corpo que o provedor grava para mídia — rótulo
 * técnico, não fala do paciente. Renderizado embaixo do anexo virava ruído.
 */
function ehPlaceholderDeMidia(texto: string | null | undefined): boolean {
  return !texto || /^\[(image|audio|document|video|sticker)\]$/i.test(texto.trim());
}

function Bolha({ m, i }: { m: Mensagem; i: number }) {
  if (m.autor === "cliente" && !m.texto && !m.attach) return null;

  const humano = m.autor === "humano";
  const meu = humano || m.autor === "bot";

  return (
    <div className={cn("flex animate-entra-bolha", meu && "justify-end")} style={{ "--i": i } as CSSProperties}>
      <div
        className={cn(
          "max-w-[74%] min-w-0 overflow-hidden break-words rounded-[14px] px-3.5 py-2.5 text-[12.5px] leading-relaxed shadow-sutil",
          humano
            ? "rounded-br-[4px] bg-info-soft text-foreground"
            : meu
              ? "rounded-br-[4px] bg-menta-soft text-foreground"
              : "rounded-bl-[4px] border border-border bg-card text-foreground",
        )}
      >
        {humano && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-info">Recepção</div>}
        {m.attach && (
          <div className="mb-1.5 flex items-center gap-2 rounded-[9px] border border-border bg-white/70 px-2.5 py-2">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                m.attach.type === "pdf" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {m.attach.type === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold">{m.attach.name}</span>
          </div>
        )}
        {!ehPlaceholderDeMidia(m.texto) && m.texto}
        <div className="mt-1 text-right text-[9.5px] opacity-55">{horaCurta(m.hora)}</div>
      </div>
    </div>
  );
}
