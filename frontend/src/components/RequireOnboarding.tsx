import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

/** Chave de sessão: marca que a cliente optou por pular o onboarding nesta sessão. */
export const SKIP_ONBOARDING_KEY = "megus:skipOnboarding";

/**
 * Portão de onboarding: enquanto a cliente não configurou o atendente (passo
 * fundamental), redireciona para /onboarding em tela cheia — a menos que ela
 * tenha optado por "pular para o painel" nesta sessão.
 *
 * Critério: `agenteDone` (a persona do agente já tem nome). É o passo central
 * que o produto quer garantir antes de liberar o painel completo.
 */
export default function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const status = useOnboardingStatus();
  const skipped = sessionStorage.getItem(SKIP_ONBOARDING_KEY) === "1";

  if (status.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!status.agenteDone && !skipped) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}