import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Marco, Num, Rotulo, Secao, Vazio } from "@/components/ui/megus";
import { cn, formatarBRL } from "@/lib/utils";
import type { EtapaFunil, EventoTrilha, Pendencia } from "@/services/hoje";

// Primitivos da marca vivem em ui/megus.tsx — reexportados para as telas de Hoje
// não precisarem de dois imports.
export { Marco, Num, Rotulo, Secao, Vazio };

// O tipo do bloqueio é dito por PALAVRA em micro-caps, não por iconezinho.
const ESTILO_PENDENCIA = {
  cpf: { rot: "CPF divergente", borda: "border-destructive", cor: "text-destructive" },
  pagamento: { rot: "Comprovante", borda: "border-terra", cor: "text-terra-ink" },
  humano: { rot: "Pediu humano", borda: "border-info", cor: "text-info" },
} as const;

/** Grade da tabela de pendências. Uma constante porque cabeçalho e linhas TÊM
 *  que usar exatamente a mesma — duas cópias divergem no primeiro ajuste. */
const COLUNAS = "md:grid md:grid-cols-[132px_minmax(0,1fr)_150px_92px_auto] md:items-center md:gap-4";

/**
 * A resposta que a pessoa vem buscar, escrita em uma frase.
 *
 * Quem abre esta tela três vezes por dia não quer navegar — quer saber se está
 * tudo bem. Então a resposta vem em display, no topo, em vez de ser deduzida de
 * um punhado de cartões. O segundo período fica em cinza: é contexto, não a
 * manchete.
 *
 * `pronto` existe porque "ainda não chegou" NÃO é "chegou zerado": sem esse ramo
 * a manchete afirma "Nada travado" com confiança durante todo o carregamento.
 * Numa tela cuja tese é a resposta escrita, resposta errada é o pior defeito.
 */
export function Resposta({ pronto, n }: { pronto: boolean; n: number }) {
  if (!pronto) return <span className="text-muted-foreground">Verificando o dia…</span>;
  if (!n) {
    return (
      <>
        Nada travado.
        <span className="text-muted-foreground"> O dia inteiro correu sozinho.</span>
      </>
    );
  }
  return (
    <>
      {n === 1 ? "Um caso travado." : `${n} casos travados.`}
      <span className="text-muted-foreground"> O resto do dia correu sozinho.</span>
    </>
  );
}

/**
 * O ciclo do dia com o dinheiro em cada degrau — o objeto herói da tela.
 *
 * A perda mora no vão ENTRE as etapas: é ali que o dinheiro não entrou, e o vão
 * é o lugar honesto para ela. A última etapa é terracota, porque o objetivo do
 * produto é a nota e a cor marca a chegada.
 *
 * No celular vira 2×2 e a perda acompanha o número, porque não há vão.
 */
export function Ciclo({ etapas, pronto = true }: { etapas: EtapaFunil[]; pronto?: boolean }) {
  const dados = etapas;
  // Sem dado ainda: régua fantasma com a altura final, para a página não pular.
  if (!pronto) {
    return (
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:flex sm:gap-7">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="min-w-0 sm:flex-1">
            <span className="block h-2 w-20 animate-pulse rounded-[2px] bg-border" />
            <span className="mt-3 block h-6 w-12 animate-pulse rounded-[3px] bg-border" />
            <span className="mt-3 block h-[5px] animate-pulse rounded-[2px] bg-border" />
          </div>
        ))}
      </div>
    );
  }
  if (!dados.length) return <div className="h-16 rounded-[6px] border border-dashed border-border" />;
  const max = Math.max(1, dados[0]?.n ?? 1);

  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:flex sm:items-stretch sm:gap-0">
      {dados.map((e, i) => {
        const anterior = dados[i - 1];
        const perda = anterior ? anterior.n - e.n : 0;
        const ultima = i === dados.length - 1;
        return (
          <Fragment key={e.id}>
            {i > 0 && (
              <div className="hidden w-[54px] shrink-0 flex-col items-center justify-center gap-1 sm:flex">
                {perda > 0 ? (
                  <>
                    <Num className="text-[12px] font-semibold text-terra-ink">−{perda}</Num>
                    <span className="h-px w-6 bg-border-strong" />
                  </>
                ) : (
                  <span className="h-px w-6 bg-border" />
                )}
              </div>
            )}
            <div className="min-w-0 sm:flex-1">
              <Rotulo>{e.label}</Rotulo>
              <div className="mt-2 flex items-baseline gap-2">
                <Num
                  className={cn(
                    "font-brand text-[24px] font-bold leading-none tracking-[-0.03em] md:text-[27px]",
                    ultima ? "text-terra-ink" : "text-foreground",
                  )}
                >
                  {e.n}
                </Num>
                <Num className="text-[12px] text-muted-foreground">{formatarBRL(e.valor)}</Num>
                {perda > 0 && <Num className="text-[11px] font-medium text-terra-ink sm:hidden">−{perda}</Num>}
              </div>
              <div className="mt-3 h-[5px] overflow-hidden rounded-[2px] bg-border">
                <span
                  className={cn(
                    "block h-full transition-[width] duration-500",
                    ultima ? "bg-terra-dark" : "bg-menta-dark",
                  )}
                  style={{ width: `${(e.n / max) * 100}%` }}
                />
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Cabeçalho da tabela de pendências. Só no desktop: no celular a linha se
 *  explica sozinha e uma faixa de rótulos seria ruído. */
export function CabecalhoPendencias() {
  return (
    <div className={cn("hidden border-b border-border bg-muted/60 px-4 py-2", COLUNAS)}>
      <Rotulo>Motivo</Rotulo>
      <Rotulo>Caso</Rotulo>
      <Rotulo>Paciente</Rotulo>
      <Rotulo className="text-right">Valor</Rotulo>
      <span />
    </div>
  );
}

/**
 * Um caso esperando decisão humana — uma LINHA de tabela, não um cartão.
 *
 * Comparar três casos e agir é trabalho de tabela: motivo, caso, paciente,
 * valor, ação. Cartões de galeria obrigam a ler cada um por inteiro para
 * escolher qual atacar primeiro.
 *
 * O motivo técnico do bloqueio (o CPF que veio, o valor que não bateu) fica logo
 * abaixo do título: é o dado que decide, e esconder isso obrigaria a abrir a
 * conversa. No celular a linha desmonta em blocos empilhados.
 */
export function LinhaPendencia({
  p,
  primeira,
  onResolver,
}: {
  p: Pendencia;
  primeira?: boolean;
  onResolver: () => void;
}) {
  const estilo = ESTILO_PENDENCIA[p.tipo];

  return (
    <div className={cn("px-4 py-3.5 transition-colors duration-150 hover:bg-accent/40 md:py-3", !primeira && "border-t border-border", COLUNAS)}>
      <div className={cn("border-l-2 pl-2.5", estilo.borda)}>
        <Rotulo className={estilo.cor}>{estilo.rot}</Rotulo>
        <Num className="mt-1 block text-[10.5px] text-muted-foreground">{p.quando}</Num>
      </div>

      <div className="mt-2.5 min-w-0 md:mt-0">
        <span className="block text-[13.5px] font-semibold leading-snug text-foreground md:truncate">{p.titulo}</span>
        {p.motivo && (
          /* A cor acompanha o TIPO da linha: "pediu humano" é info, não erro.
             Vermelho fixo aqui contradizia o rótulo e a borda da própria linha. */
          <Num className={cn("mt-1 block text-[11px] md:truncate", estilo.cor)}>
            {p.motivo.chave}: {p.motivo.valor}
          </Num>
        )}
      </div>

      <div className="mt-2.5 flex min-w-0 items-center justify-between gap-2 md:mt-0 md:justify-start">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar nome={p.paciente} s={26} />
          <span className="truncate text-[12.5px] text-secondary-foreground">{p.paciente}</span>
        </span>
        {/* No celular o valor acompanha o paciente; no desktop tem coluna. */}
        <Num className="shrink-0 text-[13px] font-semibold text-foreground md:hidden">
          {p.valor ? formatarBRL(p.valor) : "—"}
        </Num>
      </div>

      <Num className="hidden text-right text-[13px] font-semibold text-foreground md:block">
        {p.valor ? formatarBRL(p.valor) : "—"}
      </Num>

      <div className="mt-3 flex shrink-0 items-center gap-2 md:mt-0">
        {p.conversaId && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/conversas">Abrir</Link>
          </Button>
        )}
        <Button size="sm" onClick={onResolver}>
          Resolver
        </Button>
      </div>
    </div>
  );
}

// Rótulo do evento em micro-caps + marca quadrada. Sem pílula colorida.
const TAG_TRILHA = {
  nota: ["nota", "ok"],
  pago: ["pago", "ok"],
  alerta: ["bloqueado", "alerta"],
  cobranca: ["cobrança", "quente"],
  humano: ["humano", "info"],
  sync: ["agenda", "neutro"],
} as const;

/**
 * Trilha de auditoria — o que o agente fez, inclusive o que decidiu NÃO fazer.
 *
 * A linha "emissão interrompida" é a mais importante da lista. Registro de IA que
 * só mostra acerto não constrói confiança nenhuma; ver o agente se conter, sim.
 *
 * Recolhida por padrão: é consulta, não decisão. Quem precisa auditar abre.
 */
export function TrilhaKaua({ eventos }: { eventos: EventoTrilha[] }) {
  return (
    <ul className="flex flex-col">
      {eventos.map((e) => {
        const [rotulo, tom] = TAG_TRILHA[e.tag] ?? ["evento", "neutro"];
        return (
          <li
            key={e.id}
            className="flex flex-col gap-1 border-b border-border py-2.5 transition-colors last:border-b-0 hover:bg-accent/45 sm:flex-row sm:items-baseline sm:gap-0"
          >
            <div className="flex shrink-0 items-baseline gap-2.5 sm:w-[172px]">
              <Num className="w-[34px] shrink-0 text-[11px] text-muted-foreground">{e.hora}</Num>
              <Marco t={rotulo} tom={tom} className="text-[11px]" />
            </div>
            <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-secondary-foreground">{e.texto}</span>
            {e.valor !== null && (
              <Num className="shrink-0 whitespace-nowrap pl-[46px] text-[12px] font-semibold text-foreground sm:pl-4">
                {formatarBRL(e.valor)}
              </Num>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Meta do mês como FAIXA de rodapé, não cartão.
 *
 * A meta é acompanhamento, não decisão: ninguém abre o painel para olhar a meta.
 * Ela merece uma linha no pé — com o único número em terracota da tela, porque
 * meta é aspiração, não status.
 */
export function FaixaMeta({ alvo, atual, pronto = true }: { alvo: number; atual: number; pronto?: boolean }) {
  const pct = Math.round((atual / Math.max(1, alvo)) * 100);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <Rotulo className="shrink-0">Meta do mês</Rotulo>
      {/* Sem dado ainda: barra e números como esqueleto. "faltam R$ 0,00" lê
         como meta batida — numa faixa cuja função é o dinheiro, essa é a pior
         linha possível para estar confiantemente errada. */}
      {!pronto ? (
        <>
          <div className="h-[5px] w-[220px] max-w-full shrink-0 animate-pulse rounded-[2px] bg-border" />
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="my-1 block h-[13px] w-56 max-w-full animate-pulse rounded-[3px] bg-border" />
          </span>
        </>
      ) : (
        <>
          <div className="h-[5px] w-full max-w-[220px] shrink-0 overflow-hidden rounded-[2px] bg-border">
            <span
              className="block h-full bg-terra-dark transition-[width] duration-500"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Num className="text-[14px] font-semibold text-terra-ink">{formatarBRL(atual)}</Num>
            <span className="text-[11.5px] text-muted-foreground">
              de <Num>{formatarBRL(alvo)}</Num>
              <span className="text-border-strong"> · </span>
              faltam <Num>{formatarBRL(Math.max(0, alvo - atual))}</Num>
            </span>
          </span>
        </>
      )}
    </div>
  );
}

/** Esqueleto da tabela de pendências — reserva o cabeçalho (26px) e a altura
 *  real da linha (64px), senão a página pula quando os casos chegam. */
export function EsqueletoPendencias() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="hidden h-[26px] border-b border-border bg-muted/60 md:block" />
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn("flex h-16 items-center gap-4 px-4", i > 0 && "border-t border-border")}>
          <span className="h-[26px] w-[26px] shrink-0 animate-pulse rounded-full bg-border" />
          <span className="h-3 flex-1 animate-pulse rounded-[3px] bg-border" />
          <span className="h-3 w-16 shrink-0 animate-pulse rounded-[3px] bg-border" />
        </div>
      ))}
    </div>
  );
}

/** Botão que recolhe/abre a trilha. Quem chama só renderiza quando há eventos:
 *  "Ver as 0 ações" é um controle vivo que não oferece nada. */
export function BotaoTrilha({ aberta, n, onClick }: { aberta: boolean; n: number; onClick: () => void }) {
  return (
    <Button variant="quieto" className="shrink-0 self-start md:self-auto" onClick={onClick} aria-expanded={aberta}>
      {aberta ? "Ocultar o que o Kaua fez" : `Ver as ${n} ações do Kaua`}
      <ChevronDown size={13} className={cn("transition-transform", aberta && "rotate-180")} />
    </Button>
  );
}

/** Estado vazio positivo — aqui "nada aqui" é boa notícia. */
export function VazioOk() {
  return (
    <Vazio
      titulo="Tudo em dia"
      texto="Nenhuma emissão bloqueada, nenhum pagamento em dúvida, ninguém esperando."
    />
  );
}

/** Linha de conexão do WhatsApp no pé da tela — marca quadrada, sem cartão. */
export function StatusConexao({ numero }: { numero?: string | null }) {
  const noAr = Boolean(numero);
  return (
    <div className="mt-5 flex items-center gap-2.5 border-t border-border pt-3.5">
      <Marco tom={noAr ? "ok" : "neutro"} pulsa={noAr} t={noAr ? "WhatsApp no ar" : "WhatsApp desconectado"} />
      {noAr && (
        <Num className="hidden min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground sm:block">{numero}</Num>
      )}
      <Link
        to="/integracoes"
        className="ml-auto text-[12.5px] font-semibold text-secondary-foreground underline decoration-border-strong underline-offset-[3px] transition-colors hover:text-foreground hover:decoration-foreground"
      >
        Ver
      </Link>
    </div>
  );
}

/** Botão de recarregar — gira enquanto busca. */
export function BotaoAtualizar({ onClick, carregando }: { onClick: () => void; carregando?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={carregando}>
      <RefreshCw size={14} className={cn(carregando && "animate-spin")} /> Atualizar
    </Button>
  );
}

/** Atalho "ver tudo" no cabeçalho de uma seção. */
export function LinkSecao({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-secondary-foreground underline decoration-border-strong underline-offset-[3px] transition-colors hover:text-foreground hover:decoration-foreground"
    >
      {children} <ArrowRight size={13} />
    </Link>
  );
}
