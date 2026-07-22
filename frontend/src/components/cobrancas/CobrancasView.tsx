import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, TriangleAlert } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import * as cobrancasService from "@/services/cobrancas";
import type { Cobranca } from "@/services/cobrancas";

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Rótulo/estilo do status pelos flags. Tokens v2: verde = entrou (pago),
// âmbar = aguardando. "Pendente" é neutro — não é erro, só ainda-não-aconteceu;
// vermelho aqui seria alarme falso.
function statusDe(c: Cobranca): { label: string; cls: string } {
  if (c.pago && c.notaEmitida) return { label: "Pago · nota emitida", cls: "bg-success/10 text-success" };
  if (c.pago) return { label: "Pago", cls: "bg-success/10 text-success" };
  if (c.cobrado) return { label: "Cobrado · aguardando", cls: "bg-warning/10 text-warning" };
  return { label: "Pendente", cls: "bg-muted text-muted-foreground" };
}

export default function CobrancasView() {
  const queryClient = useQueryClient();
  // Polling: pagamentos acontecem FORA da tela (comprovante no WhatsApp → nota →
  // baixa) — sem isto, só um F5 mostrava a atualização (smoke 12/07). 8s cobre o
  // ciclo sem pesar; refetch ao focar cobre quem voltou de outra aba.
  const LIVE = { refetchInterval: 8000, refetchOnWindowFocus: "always" as const, staleTime: 0 };
  const cobrancasQuery = useQuery({ queryKey: ["cobrancas"], queryFn: cobrancasService.listCobrancas, ...LIVE });
  const metricasQuery = useQuery({ queryKey: ["cobrancas", "metricas"], queryFn: cobrancasService.getMetricas, ...LIVE });

  const cobrarMutation = useMutation({
    mutationFn: cobrancasService.cobrar,
    onSuccess: () => {
      // o backend registra a cobrança (chargeSentAt); o disparo automático no
      // WhatsApp ainda não existe pra este fluxo — não prometer o que não aconteceu
      toast.success("Cobrança registrada.");
      queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível enviar a cobrança.");
    },
  });

  // Charge (Task 4): o Kaua dispara a mensagem de verdade no WhatsApp do paciente.
  const cobrarChargeMutation = useMutation({
    mutationFn: cobrancasService.cobrarCharge,
    onSuccess: () => {
      toast.success("Cobrança enviada pelo WhatsApp.");
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
        <CardContent className="flex items-center gap-2 p-6 text-sm text-destructive">
          <TriangleAlert className="size-4" /> Não foi possível carregar as cobranças. Tente recarregar a página.
        </CardContent>
      </Card>
    );
  }

  const cobrancas = cobrancasQuery.data ?? [];
  const m = metricasQuery.data;

  // "Entrou" = soma dos valores das cobranças pagas (dados reais da própria
  // lista). "Falta" = valorPendente, que o backend já entrega. Somamos no front
  // porque a rota de métricas dá a CONTAGEM de pagos, não a soma em R$.
  // Volume de uma clínica cabe sem paginação; se um dia paginar, mover pro backend.
  const entrou = cobrancas.reduce((s, c) => (c.pago ? s + c.valor : s), 0);
  const falta = m?.valorPendente ?? 0;
  const previsto = entrou + falta;
  const pct = previsto > 0 ? Math.round((entrou / previsto) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Hero: o número que importa — quanto entrou, quanto falta (proposta v2) */}
      <Card>
        <CardContent className="p-7 sm:p-9">
          <div className="text-sm text-muted-foreground">Entrou este mês</div>
          <div className="mt-3 font-mono text-5xl font-light tracking-tight text-success sm:text-6xl">
            {formatBRL(entrou)}
          </div>
          {/* barra de progresso: entrou vs previsto */}
          <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{pct}% do previsto</span>
            <span>
              faltam <span className="font-mono font-light text-warning">{formatBRL(falta)}</span>
            </span>
          </div>
          {/* contexto discreto embaixo — o que eram cards vira uma linha */}
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 border-t pt-5 text-sm text-muted-foreground">
            <span><b className="font-mono font-medium text-foreground">{m?.agendados ?? "—"}</b> agendados</span>
            <span><b className="font-mono font-medium text-foreground">{m?.pagos ?? "—"}</b> pagos</span>
            <span><b className="font-mono font-medium text-warning">{m?.aCobrar ?? "—"}</b> a cobrar</span>
            <span><b className="font-mono font-medium text-foreground">{m?.notasEmitidas ?? "—"}</b> notas emitidas</span>
          </div>
        </CardContent>
      </Card>

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
                    // Charge (Task 4): o botão fica disponível até "paga" (dá pra
                    // reenviar mesmo já "cobrada"); EmissionIntent mantém a regra
                    // de sempre — some assim que "cobrado" registra o fato.
                    const podeCobrar = c.charge ? !c.pago : !c.pago && !c.cobrado;
                    const mutation = c.charge ? cobrarChargeMutation : cobrarMutation;
                    return (
                      <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.servico}</td>
                        <td className="px-4 py-3 font-mono text-[13px] text-foreground">{formatBRL(c.valor)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] text-muted-foreground">{c.notaNum ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {podeCobrar ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mutation.isPending}
                              onClick={() => mutation.mutate(c.id)}
                            >
                              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
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