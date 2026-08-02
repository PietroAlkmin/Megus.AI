import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Search, ShieldCheck } from "lucide-react";
import WhatsAppConnectPanel from "@/components/whatsapp/WhatsAppConnectPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Marco, TituloPagina } from "@/components/ui/megus";
import { useAtivacao } from "@/hooks/useAtivacao";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as agenteService from "@/services/agente";
import * as ferramentasService from "@/services/ferramentas";
import type { Ferramenta, FerramentaId } from "@/services/ferramentas";
import * as whatsappService from "@/services/whatsapp";
import { useNomeAgente } from "@/hooks/useNomeAgente";

/**
 * Integrações — diretório de conexões.
 *
 * Padrão de diretório (LangChain, Mailchimp): busca no topo, filtro por
 * categoria, e cada conexão como LINHA com marca, nome, descrição e ação à
 * direita. O cartão em grade de duas colunas fazia quatro conexões ocuparem meia
 * tela sem dizer mais — e piora conforme a lista crescer.
 *
 * **A marca de cada serviço faz o reconhecimento:** você acha o WhatsApp pelo
 * verde antes de ler a palavra. É o oposto da regra que vale no resto do produto
 * (nada de logo de terceiro) — e aqui a exceção se justifica, porque a tela é
 * literalmente sobre serviços de terceiros. Os logos ficam contidos num quadrado
 * de 36px com o fundo esmaecido, para não competirem com a paleta.
 *
 * ⚠️ **Não existe `POST /api/integracoes/:id/conectar`.** Cada conexão tem fluxo
 * próprio — QR para o WhatsApp, OAuth para a agenda, e "serviços" nem é conectar,
 * é preencher a Clínica. Por isso o botão ROTEIA para o fluxo certo em vez de
 * chamar uma rota agregada que daria 404.
 *
 * **Desconectar é rotina, não exceção:** trocar de número ou de conta Google
 * acontece (a ativação da primeira clínica dependeu disso — o número estava
 * pareado em duas instâncias). Fica ao lado de "Gerenciar", com confirmação que
 * mostra o alvo.
 */
export default function Integracoes() {
  const { nome: nomeAgente } = useNomeAgente();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  // Pareamento do WhatsApp acontece NESTA tela. A v4.1 roteava para /agentes com
  // um toast "leia o QR lá" — e /agentes não tem painel de QR: o fluxo morria no
  // meio. Quem gera o QR, faz o polling e some ao conectar é o painel abaixo.
  const [pareando, setPareando] = useState(false);
  const [cat, setCat] = useState<CatId>("todas");

  const { data: ferramentas } = useQuery({
    queryKey: ["ferramentas"],
    queryFn: ferramentasService.listFerramentasFallback,
  });
  // `capabilities.agenda` decide se o AGENTE usa a agenda. Conta conectada e
  // agente agendando são coisas diferentes — a tela não deve fundir as duas.
  const { data: agente } = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });
  // O contador do cabeçalho vem da ATIVAÇÃO, não do tamanho da lista: clínica que
  // emite nota por fora não tem passo fiscal, e contar "3 de 4" nela seria a
  // mesma mentira que travava a barra de ativação em 80%.
  const ativacao = useAtivacao();

  function recarregar() {
    void queryClient.invalidateQueries({ queryKey: ["ferramentas"] });
    void queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
  }

  /** Roteia para o fluxo real de cada conexão. */
  const conectar = useMutation({
    mutationFn: async (id: FerramentaId) => {
      if (id === "whatsapp") {
        // O painel cuida de gerar o QR e do polling — aqui só o revelamos.
        return { tipo: "qr" as const };
      }
      if (id === "agenda") {
        const { url } = await ferramentasService.agendaConectar();
        // OAuth do Google precisa de janela própria — não abre em iframe.
        window.open(url, "_blank", "noopener");
        return { tipo: "oauth" as const };
      }
      if (id === "servicos") return { tipo: "navegar" as const };
      return { tipo: "indisponivel" as const };
    },
    onSuccess: (r, id) => {
      recarregar();
      if (r.tipo === "qr") setPareando(true);
      if (r.tipo === "oauth") toast.info("Autorize a conta Google na aba que abriu.");
      if (r.tipo === "navegar") navigate("/clinica");
      if (r.tipo === "indisponivel") toast.info(`${nomeDe(ferramentas, id)} ainda não tem integração disponível.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível conectar."),
  });

  const desconectar = useMutation({
    mutationFn: async (id: FerramentaId) => {
      if (id === "whatsapp") return whatsappService.desconectar();
      if (id === "agenda") return ferramentasService.agendaDesconectar();
      throw new Error("sem fluxo de desconexão");
    },
    // Erro do provedor NÃO limpa o estado: a lista é recarregada do servidor.
    onSuccess: (_, id) => {
      recarregar();
      toast.success(id === "whatsapp" ? "Número desconectado." : "Conta Google removida.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível desconectar."),
  });

  function pedirDesconexao(f: Ferramenta) {
    // A confirmação mostra o ALVO — desconectar o número errado custa caro.
    const alvo = f.detalhe ? ` (${f.detalhe})` : "";
    if (window.confirm(`Desconectar ${f.nome}${alvo}? ${nomeAgente} para de usar esta conexão até você religar.`)) {
      desconectar.mutate(f.id);
    }
  }

  const todas = ferramentas ?? [];
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todas.filter((f) => {
      const passaBusca = !q || [f.nome, f.desc].some((x) => (x ?? "").toLowerCase().includes(q));
      const passaCat = cat === "todas" || CAT_DE[f.id] === cat;
      return passaBusca && passaCat;
    });
  }, [todas, busca, cat]);

  const conta = (c: CatId) => (c === "todas" ? todas.length : todas.filter((f) => CAT_DE[f.id] === c).length);

  return (
    <div className="mx-auto max-w-[880px] p-4 pb-12 md:p-6 lg:p-7">
      <TituloPagina titulo="Integrações" sub={`O que ${nomeAgente} precisa para trabalhar. Cada conexão liga uma parte do ciclo.`}>
        {!ativacao.isLoading && (
          <Marco
            t={`${ativacao.concluidos} de ${ativacao.total} conectadas`}
            tom={ativacao.completo ? "ok" : "quente"}
          />
        )}
      </TituloPagina>

      {/* Busca + categorias. Com 4 itens parece generoso; com 15 é o que evita
         rolar a página inteira para achar uma conexão. */}
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={busca}
            onChange={(ev) => setBusca(ev.target.value)}
            placeholder="Buscar integração…"
            className="h-9 w-full rounded-[6px] border border-border bg-card pl-9 pr-3 text-[12.5px] outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-border-strong focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {CATS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors active:scale-[.98]",
                cat === c.id
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-card text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              {c.label}
              <span className={cn("font-mono text-[9.5px]", cat === c.id ? "text-white/60" : "text-muted-foreground")}>
                {conta(c.id)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-card">
        {lista.map((f, i) => {
          const podeDesconectar = f.connected && (f.id === "whatsapp" || f.id === "agenda");
          // Agenda conectada, mas o agente sem a capacidade: dizer só "conectado"
          // esconderia o motivo de o agente não marcar nada.
          const agendaSemUso = f.id === "agenda" && f.connected && agente?.capabilities.agenda === false;

          return (
            <div
              key={f.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-3.5 py-3.5",
                i > 0 && "border-t border-border",
              )}
            >
              <Logo id={f.id} />

              <div className="min-w-0 flex-1 basis-[220px]">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <strong className="whitespace-nowrap text-[13.5px] font-semibold text-foreground">{f.nome}</strong>
                  <Marco
                    t={f.connected ? "conectado" : "pendente"}
                    tom={f.connected ? "ok" : "quente"}
                    className="shrink-0 text-[11px]"
                  />
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{f.desc}</p>
                {f.connected && f.detalhe && (
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted-foreground">{f.detalhe}</span>
                )}
                {agendaSemUso && (
                  <p className="mt-1 text-[11.5px] text-terra-ink">
                    Conectada, mas o agente não usa a agenda — ligue em Agentes.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {f.connected ? (
                  <>
                    {podeDesconectar && (
                      <Button size="sm" variant="quieto" onClick={() => pedirDesconexao(f)} disabled={desconectar.isPending}>
                        Desconectar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => navigate(destinoDe(f.id))}>
                      Gerenciar
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => conectar.mutate(f.id)} disabled={conectar.isPending}>
                    Conectar
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {!lista.length && (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
            {busca ? `Nenhuma integração encontrada para “${busca}”.` : "Nenhuma integração nesta categoria."}
          </p>
        )}
      </div>

      {/* Fica aqui embaixo (e não em modal) porque ler QR exige a tela parada e o
          celular na mão. */}
      {pareando && (
        <div className="mt-5">
          <WhatsAppConnectPanel
            onConnected={() => {
              setPareando(false);
              recarregar();
              toast.success("Número conectado.");
            }}
          />
        </div>
      )}
    </div>
  );
}

type CatId = "todas" | "mensageria" | "agenda" | "fiscal";

const CATS: { id: CatId; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "mensageria", label: "Mensageria" },
  { id: "agenda", label: "Agenda" },
  { id: "fiscal", label: "Fiscal" },
];

const CAT_DE: Record<string, CatId> = {
  whatsapp: "mensageria",
  agenda: "agenda",
  fiscal: "fiscal",
  servicos: "fiscal",
};

/**
 * Marca de cada serviço — SVG mínimo, na cor da própria marca.
 *
 * Suficiente para reconhecer sem virar ilustração. O quadrado de 36px com fundo
 * a 10% contém a cor do terceiro: ela identifica a linha sem disputar com a
 * paleta do produto.
 */
function Logo({ id }: { id: FerramentaId }) {
  if (id === "whatsapp") {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[#25D366]/10">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="#1FA855" aria-hidden="true">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.24 8.24 0 0 1 0 16.47Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.09-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.23.25-.86.84-.86 2.05s.88 2.38 1 2.54c.13.17 1.74 2.65 4.2 3.72.59.25 1.05.4 1.4.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
        </svg>
      </span>
    );
  }

  if (id === "agenda") {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-border bg-white">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" fill="#fff" stroke="#4285F4" strokeWidth="1.5" />
          <path d="M3.5 8.6h17" stroke="#4285F4" strokeWidth="1.5" />
          <path d="M8 3v3M16 3v3" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="10.4" y="11.4" width="3.4" height="3.4" rx=".6" fill="#EA4335" />
        </svg>
      </span>
    );
  }

  if (id === "servicos") {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-info-soft">
        <ShieldCheck size={18} className="text-info" />
      </span>
    );
  }

  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-terra-soft">
      <FileText size={18} className="text-terra-ink" />
    </span>
  );
}

function nomeDe(fs: Ferramenta[] | undefined, id: FerramentaId) {
  return fs?.find((f) => f.id === id)?.nome ?? "Esta conexão";
}

/** Onde cada conexão é gerenciada de fato. */
function destinoDe(id: FerramentaId) {
  if (id === "servicos") return "/clinica";
  return "/agentes";
}
