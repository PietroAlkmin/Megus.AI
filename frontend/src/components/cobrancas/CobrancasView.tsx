import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock, CheckCircle2, Clock, FileText, Loader2, Send, TriangleAlert,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import * as cobrancasService from "@/services/cobrancas";
import type { Cobranca } from "@/services/cobrancas";

function formatBRL(value: number): string {
  return "R$ " + value.toFixed(2).replace(".", ",");
}

// Deriva o rótulo/estilo do status de uma cobrança a partir dos flags.
function statusDe(c: Cobranca): { label: string; cls: string } {
  if (c.pago && c.notaEmitida) return { label: "Pago · nota emitida", cls: "bg-emerald-100 text-emerald-700" };
  if (c.pago) return { label: "Pago", cls: "bg-emerald-100 text-emerald-700" };
  if (c.cobrado) return { label: "Cobrado · aguardando", cls: "bg-amber-100 text-amber-700" };
  return { label: "Pendente", cls: "bg-rose-100 text-rose-700" };
}

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

export default function CobrancasView() {
  const queryClient = useQueryClient();
  const cobrancasQuery = useQuery({ queryKey: ["cobrancas"], queryFn: cobrancasService.listCobrancas });
  const metricasQuery = useQuery({ queryKey: ["cobrancas", "metricas"], queryFn: cobrancasService.getMetricas });

  const cobrarMutation = useMutation({
    mutationFn: cobrancasService.cobrar,
    onSuccess: () => {
      // o backend registra a cobrança (chargeSentAt); o disparo automático no
      // WhatsApp ainda não existe — não prometer o que não aconteceu
      toast.success("Cobrança registrada.");
      queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível enviar a cobrança.");
    },
  });

  if (cobrancasQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Carregando cobranças…
      </div>
    );
  }

  if (cobrancasQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-rose-600">
          <TriangleAlert className="size-4" /> Não foi possível carregar as cobranças. Tente recarregar a página.
        </CardContent>
      </Card>
    );
  }

  const cobrancas = cobrancasQuery.data ?? [];
  const m = metricasQuery.data;

  return (
    <div className="space-y-6">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard icon={<CalendarClock className="size-4" />} label="Agendados" value={m?.agendados ?? "—"} />
        <MetricCard icon={<CheckCircle2 className="size-4" />} label="Pagos" value={m?.pagos ?? "—"} />
        <MetricCard icon={<Clock className="size-4" />} label="Pendentes" value={m?.pendentes ?? "—"} />
        <MetricCard icon={<FileText className="size-4" />} label="Notas emitidas" value={m?.notasEmitidas ?? "—"} />
        <MetricCard icon={<Send className="size-4" />} label="A cobrar" value={m?.aCobrar ?? "—"} />
        <MetricCard icon={<TriangleAlert className="size-4" />} label="Valor pendente" value={m ? formatBRL(m.valorPendente) : "—"} />
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cobranças</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cobrancas.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              Nenhuma cobrança ainda. Elas aparecem aqui conforme os atendimentos geram emissões.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Paciente</th>
                    <th className="px-4 py-3 font-medium">Serviço</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Nota</th>
                    <th className="px-4 py-3 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {cobrancas.map((c) => {
                    const st = statusDe(c);
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.servico}</td>
                        <td className="px-4 py-3 text-foreground">{formatBRL(c.valor)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.notaNum ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {!c.pago && !c.cobrado ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cobrarMutation.isPending}
                              onClick={() => cobrarMutation.mutate(c.id)}
                            >
                              {cobrarMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                              Cobrar
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}