import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { segmentoLabel } from "@/lib/segmentos";
import { cn } from "@/lib/utils";
import * as atendimentosService from "@/services/atendimentos";
import type { Agente } from "@/services/atendimentos";

// Estilo/rótulo de cada status. "Atendendo" no lugar de "Operando" — atendente
// atende, máquina opera. Cores pelos tokens v2 (success/warning), não cruas.
const STATUS: Record<Agente["status"], { label: string; dot: string; badge: string }> = {
  operando: { label: "Atendendo", dot: "bg-success", badge: "bg-success/10 text-success" },
  atencao: { label: "Atenção", dot: "bg-warning", badge: "bg-warning/10 text-warning" },
  desconectado: { label: "Desconectado", dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
  pausado: { label: "Pausado", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

// Formata "5511999999999" → "+55 11 99999-9999" (fica legível no card).
function formatFone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : raw;
}

// Uma métrica — todas idênticas em escala e peso. `cor` é só semântica.
function Metrica({ valor, label, cor = "text-foreground" }: { valor: string | number; label: string; cor?: string }) {
  return (
    <div>
      <div className={cn("font-mono text-4xl font-light tracking-tight", cor)}>{valor}</div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function AgenteCard({ a, onOpen }: { a: Agente; onOpen: (id: string) => void }) {
  const st = STATUS[a.status] ?? STATUS.pausado;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(a.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(a.id); } }}
      className={cn(
        "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40",
        a.alerta ? "border-warning/40" : undefined,
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-success/10 font-brand text-base font-semibold text-success">
              {(a.nome ?? a.papel ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            <div>
              {/* sem agente configurado, o título é a própria integração (papel) */}
              <div className="font-semibold text-foreground">{a.nome ?? a.papel}</div>
              {a.nome && <div className="text-xs text-muted-foreground">Recepção · {a.papel}</div>}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.badge}`}>
            <span className={`size-1.5 rounded-full ${st.dot}`} /> {st.label}
          </span>
        </div>

        {/* rows só existem quando o dado existe — sem placeholder de "—" */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {a.numero && (
            <>
              <div className="text-muted-foreground">Número</div>
              <div className="text-right font-mono text-[13px] font-medium text-foreground">{formatFone(a.numero)}</div>
            </>
          )}
          {a.segmento && (
            <>
              <div className="text-muted-foreground">Segmento</div>
              <div className="text-right text-foreground">{segmentoLabel(a.segmento)}</div>
            </>
          )}
          <div className="text-muted-foreground">Conversas agora</div>
          <div className="text-right font-mono font-medium text-foreground">{a.conversas}</div>
          <div className="text-muted-foreground">Notas este mês</div>
          <div className="text-right font-mono font-medium text-foreground">{a.notasMes}</div>
        </div>

        {a.alerta && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{a.alerta}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AtendimentosView() {
  const navigate = useNavigate();
  const agentesQuery = useQuery({ queryKey: ["agentes"], queryFn: atendimentosService.listAgentes });
  const metricasQuery = useQuery({ queryKey: ["agentes", "metricas"], queryFn: atendimentosService.getMetricas });

  if (agentesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Carregando agentes…
      </div>
    );
  }

  if (agentesQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-rose-600">
          <TriangleAlert className="size-4" /> Não foi possível carregar os agentes. Tente recarregar a página.
        </CardContent>
      </Card>
    );
  }

  const agentes: Agente[] = agentesQuery.data ?? [];
  const m = metricasQuery.data;

  // Leitura da tela: "está tudo funcionando?". Saúde = agentes atendendo vs total.
  // Atenção = o que tira a pessoa do "tudo certo" (alertas + transferências).
  const tudoOk = m ? m.operando === m.total && m.total > 0 : false;
  const precisaAtencao = m ? m.alertas + m.transferencias : 0;

  return (
    <div className="space-y-6">
      {/* Métricas — todas no MESMO nível (mesma escala e peso). A cor é só
          semântica: verde = saúde ok, âmbar = precisa de atenção. */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-8 p-7 sm:grid-cols-3 sm:p-9 lg:grid-cols-5">
          <Metrica
            valor={m ? `${m.operando}/${m.total}` : "—"}
            label="atendendo"
            cor={tudoOk ? "text-success" : "text-foreground"}
          />
          <Metrica
            valor={m ? precisaAtencao : "—"}
            label="em manutenção"
            cor={precisaAtencao > 0 ? "text-warning" : "text-foreground"}
          />
          <Metrica valor={m?.abertas ?? "—"} label="conversas abertas" />
          <Metrica valor={m?.msgsMes ?? "—"} label="mensagens no mês" />
          <Metrica valor={m?.notasMes ?? "—"} label="notas no mês" />
        </CardContent>
      </Card>

      {/* Agentes */}
      {agentes.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-12 text-center text-sm text-muted-foreground">
            Nenhum agente ainda. Configure uma empresa e um agente para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agentes.map((a) => (
            <AgenteCard key={a.id} a={a} onOpen={(id) => { navigate(`/conversas?agente=${encodeURIComponent(id)}`); }} />
          ))}
        </div>
      )}
    </div>
  );
}