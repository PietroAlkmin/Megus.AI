import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import AgenteForm from "@/components/agente/AgenteForm";
import EmpresaForm from "@/components/empresa/EmpresaForm";
import WhatsAppConnectPanel from "@/components/whatsapp/WhatsAppConnectPanel";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Empresa" },
  { id: 2, label: "Agente" },
  { id: 3, label: "Conectar WhatsApp" },
] as const;

/**
 * Ponto de entrada do fluxo do zero: Empresa → Agente → Conectar WhatsApp,
 * um passo por vez. Cada passo reusa o mesmo form/painel das telas de edição
 * (`pages/Empresa.tsx`, `pages/Agente.tsx`, `pages/ConectarWhatsApp.tsx`) —
 * salvar avança automaticamente para o próximo passo.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const status = useOnboardingStatus();
  const [step, setStep] = useState(1);
  const [justConnected, setJustConnected] = useState(false);

  const doneById: Record<number, boolean> = {
    1: status.empresaDone,
    2: status.agenteDone,
    3: status.whatsappDone || justConnected,
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-8">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Configure seu atendente</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Três passos rápidos para o Kaua começar a atender pelo WhatsApp: dados da empresa, a persona do agente e a
          conexão do número.
        </p>
      </header>

      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((s, index) => (
          <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
                step === s.id ? "bg-primary/10" : "hover:bg-secondary/60",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
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
            </button>
            {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 1 && <EmpresaForm onSaved={() => setStep(2)} />}
      {step === 2 && <AgenteForm onSaved={() => setStep(3)} />}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <WhatsAppConnectPanel onConnected={() => setJustConnected(true)} />
          <div className="flex justify-end gap-3">
            {justConnected ? (
              <Button type="button" onClick={() => navigate("/")}>
                Ir para o painel
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => navigate("/")}>
                Conectar depois
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="mt-6">
        <Button type="button" variant="ghost" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
