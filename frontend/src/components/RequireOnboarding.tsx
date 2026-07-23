import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { SKIP_ONBOARDING_KEY } from "@/lib/api";

/**
 * Portão de onboarding: enquanto a cliente não configurou o atendente (passo
 * fundamental), redireciona para /onboarding em tela cheia — a menos que ela
 * tenha optado por "pular para o painel" nesta sessão.
 *
 * Critério: `agenteDone` (a persona do agente já tem nome). É o passo central
 * que o produto quer garantir antes de liberar o painel completo.
 *
 * A flag de "pular" é limpa no login/logout (ver AuthContext) — sem isso ela
 * vazava entre usuários na mesma aba e um cadastro novo pulava o onboarding.
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

  // Erro nas consultas: o progresso é INDETERMINADO, não "não configurado".
  // Sem isso, uma falha de API (backend fora, token expirado) jogaria quem já
  // configurou de volta pro onboarding — e prenderia a pessoa lá.
  if (!status.isError && !status.agenteDone && !skipped) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}