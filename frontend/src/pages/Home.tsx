import { Link } from "react-router-dom";
import { ArrowRight, Bot, Building2, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { cn } from "@/lib/utils";

const CHECKLIST = [
  { id: "empresa", label: "Dados da empresa", icon: Building2 },
  { id: "agente", label: "Persona do agente", icon: Bot },
  { id: "whatsapp", label: "Conectar WhatsApp", icon: MessageCircle },
] as const;

/**
 * Dashboard — ponto de entrada do onboarding: enquanto Empresa/Agente/WhatsApp
 * não estiverem todos configurados, mostra um card com checklist + CTA para
 * `/onboarding` (wizard passo a passo). Some assim que os 3 passos são concluídos.
 */
export default function Home() {
  const status = useOnboardingStatus();

  const doneById: Record<(typeof CHECKLIST)[number]["id"], boolean> = {
    empresa: status.empresaDone,
    agente: status.agenteDone,
    whatsapp: status.whatsappDone,
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight text-foreground">Bem-vindo</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Painel do atendente virtual Megus AI.</p>
      </header>

      {!status.isLoading && !status.allDone && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="font-brand text-lg">Configure seu atendente virtual</CardTitle>
            <CardDescription>Faltam alguns passos para o Kaua começar a atender pelo WhatsApp.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              {CHECKLIST.map((item) => {
                const Icon = item.icon;
                const done = doneById[item.id];
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-1 items-center gap-2.5 rounded-md border px-3.5 py-2.5",
                      done ? "border-success/30 bg-success/5" : "border-border bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        done ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                  </li>
                );
              })}
            </ul>
            <Button asChild className="w-fit">
              <Link to="/onboarding">
                Continuar configuração <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!status.isLoading && status.allDone && (
        <Card>
          <CardHeader>
            <CardTitle className="font-brand text-lg">Tudo certo!</CardTitle>
            <CardDescription>
              {status.whatsappNumber
                ? `O Kaua está ativo no número ${status.whatsappNumber}.`
                : "O Kaua está configurado e conectado."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
