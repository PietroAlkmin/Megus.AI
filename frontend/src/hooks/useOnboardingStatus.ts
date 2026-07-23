import { useQuery } from "@tanstack/react-query";
import * as agenteService from "@/services/agente";
import * as empresaService from "@/services/empresa";
import * as whatsappService from "@/services/whatsapp";

export interface OnboardingStatus {
  isLoading: boolean;
  empresaDone: boolean;
  agenteDone: boolean;
  whatsappDone: boolean;
  whatsappNumber: string | null;
  /** true quando os 3 passos já foram concluídos — esconde o card/CTA de onboarding. */
  allDone: boolean;
  isError: boolean;
}

/**
 * Deriva o progresso do onboarding (Empresa → Agente → Conectar) a partir dos
 * próprios dados já cadastrados — sem flag dedicada no backend. Heurística:
 * "feito" = já tem o campo mínimo que o respectivo PUT exige preenchido.
 * Usada pelo card de entrada em `pages/Home.tsx` e pelo stepper em `pages/Onboarding.tsx`.
 */
export function useOnboardingStatus(): OnboardingStatus {
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });
  const agenteQuery = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });
  const whatsappQuery = useQuery({ queryKey: ["whatsapp", "status"], queryFn: whatsappService.status });

  const empresaDone = Boolean(empresaQuery.data?.name?.trim() || empresaQuery.data?.fiscalName?.trim());
  const agenteDone = Boolean(agenteQuery.data?.name?.trim());
  const whatsappDone = Boolean(whatsappQuery.data?.connected);

  return {
    isLoading: empresaQuery.isLoading || agenteQuery.isLoading || whatsappQuery.isLoading,
    empresaDone,
    agenteDone,
    whatsappDone,
    whatsappNumber: whatsappQuery.data?.number ?? null,
    allDone: empresaDone && agenteDone && whatsappDone,
    isError: empresaQuery.isError || agenteQuery.isError || whatsappQuery.isError,
  };
}
