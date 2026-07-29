import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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

/**
 * Integrações — as conexões que ligam cada parte do ciclo.
 *
 * Cada cartão é uma conexão, com fio à esquerda indicando o estado (menta =
 * conectado, cinza = pendente). Sem logotipo de terceiro em quadrado colorido:
 * o nome já identifica, e logos alheios sujam a paleta.
 *
 * ⚠️ **Não existe `POST /api/integracoes/:id/conectar`.** Cada conexão tem fluxo
 * próprio e já existente — QR para o WhatsApp, OAuth para a agenda, e "serviços"
 * nem é conectar, é preencher a Clínica. Por isso o botão ROTEIA para o fluxo
 * certo em vez de chamar uma rota agregada que daria 404.
 *
 * **Desconectar é operação de rotina, não exceção:** trocar de número ou de conta
 * Google acontece (a ativação da primeira clínica dependeu disso — o número
 * estava pareado em duas instâncias). Por isso o botão fica ao lado de
 * "Gerenciar", com confirmação que mostra o alvo.
 */
export default function Integracoes() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ativacao = useAtivacao();

  const { data: ferramentas } = useQuery({
    queryKey: ["ferramentas"],
    queryFn: ferramentasService.listFerramentasFallback,
  });
  // `capabilities.agenda` decide se o AGENTE usa a agenda. Conta conectada e
  // agente agendando são coisas diferentes — a tela não deve fundir as duas.
  const { data: agente } = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });

  function recarregar() {
    void queryClient.invalidateQueries({ queryKey: ["ferramentas"] });
    void queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
  }

  /** Roteia para o fluxo real de cada conexão. */
  const conectar = useMutation({
    mutationFn: async (id: FerramentaId) => {
      if (id === "whatsapp") {
        await whatsappService.connect();
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
      if (r.tipo === "qr") toast.info("Instância criada. Leia o QR em Agentes para parear o número.");
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
    if (window.confirm(`Desconectar ${f.nome}${alvo}? O Kaua para de usar esta conexão até você religar.`)) {
      desconectar.mutate(f.id);
    }
  }

  return (
    <div className="mx-auto max-w-[880px] p-4 pb-12 md:p-6 lg:p-7">
      <TituloPagina
        titulo="Integrações"
        sub="O que o Kaua precisa para trabalhar. Cada conexão liga uma parte do ciclo."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {(ferramentas ?? []).map((f) => {
          const podeDesconectar = f.connected && (f.id === "whatsapp" || f.id === "agenda");
          // Agenda conectada, mas o agente sem a capacidade: dizer só "conectado"
          // esconderia o motivo de o agente não marcar nada.
          const agendaSemUso = f.id === "agenda" && f.connected && agente?.capabilities.agenda === false;

          return (
            <div
              key={f.id}
              className={cn(
                "flex flex-col gap-3 rounded-[8px] border border-l-2 border-border bg-card p-4",
                f.connected ? "border-l-menta-dark" : "border-l-border-strong",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <strong className="text-[13.5px] font-semibold text-foreground">{f.nome}</strong>
                  <Marco
                    t={f.connected ? "conectado" : "pendente"}
                    tom={f.connected ? "ok" : "quente"}
                    className="text-[11px]"
                  />
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{f.desc}</p>
                {agendaSemUso && (
                  <p className="mt-1.5 text-[11.5px] text-terra-ink">
                    Conectada, mas o agente não usa a agenda — ligue em Agentes.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border pt-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{f.detalhe}</span>
                {podeDesconectar && (
                  <Button size="sm" variant="quieto" onClick={() => pedirDesconexao(f)} disabled={desconectar.isPending}>
                    Desconectar
                  </Button>
                )}
                {f.connected ? (
                  <Button size="sm" variant="outline" onClick={() => navigate(destinoDe(f.id))}>
                    Gerenciar
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => conectar.mutate(f.id)} disabled={conectar.isPending}>
                    Conectar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!ativacao.completo && (
        <p className="mt-5 text-[12px] text-muted-foreground">
          Faltam {ativacao.total - ativacao.concluidos} de {ativacao.total} passos para o Kaua trabalhar sozinho.
        </p>
      )}
    </div>
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
