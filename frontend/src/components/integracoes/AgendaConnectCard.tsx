import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarCheck, CalendarDays, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as ferramentasService from "@/services/ferramentas";

const PASSOS = [
  "Clique em Conectar — uma aba do Google vai abrir",
  "Entre com a conta Google cuja agenda o agente vai usar",
  "Autorize o acesso ao calendário e volte para esta tela",
];

/**
 * Conexão da agenda (Google Calendar) da empresa logada. Mesmo padrão do
 * WhatsAppConnectPanel: "Conectar" dispara `POST /conectar` (abre a URL de
 * consentimento em nova aba) e, enquanto não conectado, faz polling de
 * `GET /status` a cada 3s (para sozinho quando `conectado` vira true).
 * O status inicial carrega SEM polling — quem já conectou vê direto o ✓.
 */
export default function AgendaConnectCard() {
  const queryClient = useQueryClient();
  const [aguardando, setAguardando] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["ferramentas", "agenda", "status"],
    queryFn: ferramentasService.agendaStatus,
    refetchInterval: (query) => (query.state.data?.conectado || !aguardando ? false : 3000),
  });

  const conectarMutation = useMutation({
    mutationFn: ferramentasService.agendaConectar,
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
      setAguardando(true);
      void queryClient.invalidateQueries({ queryKey: ["ferramentas", "agenda", "status"] });
    },
  });

  const conectado = Boolean(statusQuery.data?.conectado);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-brand text-base">Agenda — Google Calendar</CardTitle>
        <CardDescription>
          Conecte a agenda da empresa para o agente consultar horários livres e marcar compromissos na conversa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-3 sm:w-[220px]">
          <div className="flex h-[140px] w-[200px] items-center justify-center rounded-xl border border-border bg-secondary/60 shadow-sm">
            {conectado ? (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success">
                  <Check className="h-6 w-6 text-white" strokeWidth={3} />
                </span>
                <p className="text-sm font-bold text-foreground">Agenda conectada!</p>
              </div>
            ) : conectarMutation.isError ? (
              <div className="flex flex-col items-center gap-2 px-3 text-center">
                <AlertTriangle className="h-6 w-6 text-warning" />
                <p className="text-xs font-semibold text-foreground">
                  {conectarMutation.error instanceof ApiError
                    ? conectarMutation.error.message
                    : "Não foi possível iniciar a conexão."}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => conectarMutation.mutate()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                </Button>
              </div>
            ) : conectarMutation.isPending ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-xs font-semibold">Gerando conexão…</p>
              </div>
            ) : aguardando ? (
              <div className="flex flex-col items-center gap-2 px-3 text-center text-muted-foreground">
                <CalendarDays className="h-8 w-8 animate-pulse" />
                <p className="text-xs font-semibold">Aguardando autorização na aba do Google…</p>
              </div>
            ) : (
              <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
            )}
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-semibold text-secondary-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                conectado
                  ? "bg-success"
                  : conectarMutation.isError
                    ? "bg-warning"
                    : aguardando
                      ? "animate-pulse bg-warning/70"
                      : "bg-muted-foreground/40",
              )}
            />
            {conectado
              ? "Conectada"
              : conectarMutation.isError
                ? "Falha ao iniciar conexão"
                : aguardando
                  ? "Aguardando autorização…"
                  : "Não conectada"}
          </div>

          {!conectado && !conectarMutation.isPending && (
            <Button type="button" onClick={() => conectarMutation.mutate()} className="w-full">
              {aguardando ? (
                <>
                  <ExternalLink className="h-4 w-4" /> Abrir de novo
                </>
              ) : (
                "Conectar"
              )}
            </Button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-3 font-brand text-sm font-bold text-foreground">Como conectar</p>
          <div className="mb-4 flex flex-col gap-3">
            {PASSOS.map((passo, index) => (
              <div key={passo} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="text-sm text-secondary-foreground">{passo}</span>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              O agente só consulta e marca — nunca apaga eventos. Se o Google mostrar “app não verificado”, toque em
              Avançado e prossiga.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
