import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Activity, Bot, FileText, Loader2, MessageSquare, TriangleAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { segmentoLabel } from "@/lib/segmentos";
import { cn } from "@/lib/utils";
import * as atendimentosService from "@/services/atendimentos";
import type { Agente } from "@/services/atendimentos";

// Estilo/rótulo de cada status.
const STATUS: Record<Agente["status"], { label: string; dot: string; badge: string }> = {
  operando: { label: "Operando", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  atencao: { label: "Atenção", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700" },
  desconectado: { label: "Desconectado", dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700" },
  pausado: { label: "Pausado", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}

function MetricCard({ icon, label, value }: MetricCardProps) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
        <div>
          <div className="text-xl font-bold leading-none text-foreground">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
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
        a.alerta ? "border-amber-300" : undefined,
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Bot className="size-5" />
            </span>
            <div>
              {/* sem agente configurado, o título é a própria integração (papel) */}
              <div className="font-semibold text-foreground">{a.nome ?? a.papel}</div>
              {a.nome && <div className="text-xs text-muted-foreground">{a.papel}</div>}
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
              <div className="text-right font-medium text-foreground">{a.numero}</div>
            </>
          )}
          {a.segmento && (
            <>
              <div className="text-muted-foreground">Segmento</div>
              <div className="text-right text-foreground">{segmentoLabel(a.segmento)}</div>
            </>
          )}
          <div className="text-muted-foreground">Conversas abertas</div>
          <div className="text-right text-foreground">{a.conversas}</div>
          <div className="text-muted-foreground">Notas este mês</div>
          <div className="text-right text-foreground">{a.notasMes}</div>
        </div>

        {a.alerta && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
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

  return (
    <div className="space-y-6">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={<Activity className="size-4" />} label="Operando" value={m ? `${m.operando}/${m.total}` : "—"} />
        <MetricCard icon={<MessageSquare className="size-4" />} label="Conversas abertas" value={m?.abertas ?? "—"} />
        <MetricCard icon={<FileText className="size-4" />} label="Notas este mês" value={m?.notasMes ?? "—"} />
        <MetricCard icon={<MessageSquare className="size-4" />} label="Mensagens este mês" value={m?.msgsMes ?? "—"} />
        <MetricCard icon={<Activity className="size-4" />} label="Transferências" value={m?.transferencias ?? "—"} />
        <MetricCard icon={<TriangleAlert className="size-4" />} label="Alertas" value={m?.alertas ?? "—"} />
      </div>

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