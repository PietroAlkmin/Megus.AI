import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Phone, QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as whatsappService from "@/services/whatsapp";

// Passo a passo + aviso portados de `Megus Wireframe/src/whatsapp/WhatsAppQrModal.jsx`.
const QR_STEPS = [
  "Abra o WhatsApp no celular que será usado no atendimento",
  "Toque em Mais opções › Aparelhos conectados",
  "Toque em Conectar um aparelho e aponte a câmera para este código",
];

function qrSrc(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

export interface WhatsAppConnectPanelProps {
  /** Disparado quando o status muda para conectado — usado pelo wizard de onboarding. */
  onConnected?: (number: string | null) => void;
}

/**
 * Conexão do número de produção via QR real (Evolution API). Botão "Conectar"
 * dispara `POST /connect`; enquanto não pareado, faz polling de `GET /status`
 * a cada 3s (para automaticamente assim que `connected` vira `true`).
 */
export default function WhatsAppConnectPanel({ onConnected }: WhatsAppConnectPanelProps) {
  const queryClient = useQueryClient();
  const [started, setStarted] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: whatsappService.status,
    enabled: started,
    refetchInterval: (query) => (query.state.data?.connected ? false : 3000),
  });

  const connectMutation = useMutation({
    mutationFn: whatsappService.connect,
    onSuccess: () => {
      setStarted(true);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
  });

  const connected = Boolean(statusQuery.data?.connected);
  const number = statusQuery.data?.number ?? null;

  useEffect(() => {
    if (connected) onConnected?.(number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, number]);

  const qr = connectMutation.data?.qr ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-brand text-base">Conectar número do WhatsApp</CardTitle>
        <CardDescription>Conecte o número que o agente vai usar para atender pelo WhatsApp.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-3 sm:w-[220px]">
          <div className="flex h-[200px] w-[200px] items-center justify-center rounded-xl border border-border bg-secondary/60 shadow-sm">
            {connected ? (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp">
                  <Check className="h-7 w-7 text-white" strokeWidth={3} />
                </span>
                <p className="text-sm font-bold text-foreground">Conectado!</p>
                <p className="text-xs text-muted-foreground">
                  {number ? `Ativo no número ${number}.` : "Já está ativo neste número."}
                </p>
              </div>
            ) : connectMutation.isError ? (
              <div className="flex flex-col items-center gap-2 px-3 text-center">
                <AlertTriangle className="h-6 w-6 text-warning" />
                <p className="text-xs font-semibold text-foreground">
                  {connectMutation.error instanceof ApiError
                    ? connectMutation.error.message
                    : "Não foi possível gerar a conexão."}
                </p>
                <Button type="button" size="sm" variant="outline" onClick={() => connectMutation.mutate()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
                </Button>
              </div>
            ) : qr ? (
              <img src={qrSrc(qr)} alt="QR Code para conectar o WhatsApp" className="h-[180px] w-[180px] rounded-sm object-contain" />
            ) : connectMutation.isPending ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-xs font-semibold">Gerando conexão…</p>
              </div>
            ) : (
              <QrCode className="h-10 w-10 text-muted-foreground/50" />
            )}
          </div>

          <div className="inline-flex items-center gap-2 text-xs font-semibold text-secondary-foreground">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected
                  ? "bg-whatsapp"
                  : connectMutation.isError
                    ? "bg-warning"
                    : qr
                      ? "animate-pulse bg-warning/70"
                      : "bg-muted-foreground/40",
              )}
            />
            {connected
              ? "Pareado com sucesso"
              : connectMutation.isError
                ? "Falha ao gerar conexão"
                : qr
                  ? "Aguardando leitura…"
                  : "Aguardando início"}
          </div>

          {!started && !connectMutation.isPending && (
            <Button type="button" onClick={() => connectMutation.mutate()} className="w-full">
              Conectar
            </Button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-3 font-brand text-sm font-bold text-foreground">Como conectar</p>
          <div className="mb-4 flex flex-col gap-3">
            {QR_STEPS.map((step, index) => (
              <div key={step} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="text-sm text-secondary-foreground">{step}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-xs font-bold text-warning">Use o número definitivo</p>
              <p className="mt-0.5 text-xs leading-relaxed text-warning/90">
                Conecte o <strong>chip que ficará em produção</strong>. Esse número fica vinculado ao agente — trocar depois
                exige reconectar e pode interromper conversas em andamento.
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Dica: prefira um número exclusivo (WhatsApp Business), não o pessoal da equipe.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
