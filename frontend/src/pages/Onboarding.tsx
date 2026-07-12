import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Brand from "@/components/Brand";
import AgenteForm from "@/components/agente/AgenteForm";
import EmpresaForm from "@/components/empresa/EmpresaForm";
import WhatsAppConnectPanel from "@/components/whatsapp/WhatsAppConnectPanel";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { SKIP_ONBOARDING_KEY } from "@/components/RequireOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Empresa" },
  { id: 2, label: "Agente" },
  { id: 3, label: "Conectar WhatsApp" },
] as const;

/**
 * Onboarding em TELA CHEIA (sem barra lateral): Empresa → Agente → Conectar.
 * O stepper é só indicador de progresso (não navega). Avança salvando; o botão
 * Voltar permite retornar a passos já vistos. Há um "pular para o painel" discreto.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const status = useOnboardingStatus();
  const [step, setStep] = useState(1);
  const [justConnected, setJustConnected] = useState(false);

  const doneById: Record<number, boolean> = {
    1: status.empresaDone,
    2: status.agenteDone,
    3: status.whatsappDone || justConnected,
  };

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  // Vai para o painel. Se o onboarding ainda não terminou, marca "pular" na sessão
  // para o portão (RequireOnboarding) não redirecionar de volta.
  function irParaPainel() {
    if (!status.agenteDone) sessionStorage.setItem(SKIP_ONBOARDING_KEY, "1");
    navigate("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Topo simples — sem menu lateral */}
      <header className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-border bg-card px-5">
        <Brand />
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-8">
        <header className="mb-8">
          <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Configure seu atendente</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Três passos rápidos para o Kaua começar a atender pelo WhatsApp: dados da empresa, a persona do agente e a
            conexão do número.
          </p>
        </header>

        {/* Stepper — indicador de progresso (NÃO clicável) */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((s, index) => (
            <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2",
                  step === s.id && "bg-primary/10",
                )}
                aria-current={step === s.id ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
                    doneById[s.id]
                      ? "bg-success text-success-foreground"
                      : step === s.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {doneById[s.id] ? <Check className="h-3.5 w-3.5" /> : s.id}
                </span>
                <span className={cn("whitespace-nowrap text-sm font-semibold", step === s.id ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
              {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        {/* Conteúdo do passo — com transição suave */}
        <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-300">
          {step === 1 && <EmpresaForm onSaved={() => setStep(2)} />}
          {step === 2 && <AgenteForm onSaved={() => setStep(3)} />}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <WhatsAppConnectPanel onConnected={() => setJustConnected(true)} />
              <div className="flex justify-end">
                <Button type="button" onClick={irParaPainel}>
                  {justConnected ? "Ir para o painel" : "Conectar depois"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rodapé fixo: Voltar (esquerda) + pular (direita) — bem posicionados */}
      <footer className="sticky bottom-0 flex items-center justify-between border-t border-border bg-card/95 px-8 py-3 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          disabled={step === 1}
          onClick={() => setStep(Math.max(1, step - 1))}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {/* Pular para o painel — discreto, sempre disponível */}
        <button
          type="button"
          onClick={irParaPainel}
          className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Pular e ir para o painel
        </button>
      </footer>
    </div>
  );
}