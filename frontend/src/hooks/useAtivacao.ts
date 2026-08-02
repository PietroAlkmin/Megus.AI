import { useQuery } from "@tanstack/react-query";
import * as agenteService from "@/services/agente";
import * as empresaService from "@/services/empresa";
import * as ferramentasService from "@/services/ferramentas";
import * as whatsappService from "@/services/whatsapp";
import type { PassoAtivacao, PassoId } from "@/lib/ativacao";
import { passosDe } from "@/lib/ativacao";

export interface AtivacaoStatus {
  isLoading: boolean;
  feito: Record<PassoId, boolean>;
  /** Os passos que valem para esta clínica (fiscal sai se ela emite por fora). */
  passos: PassoAtivacao[];
  concluidos: number;
  total: number;
  completo: boolean;
  /** Primeiro passo pendente — o que a UI destaca. */
  proximo: PassoId;
  numeroWhatsApp: string | null;
}

/**
 * Deriva a ativação dos DADOS já cadastrados, sem flag dedicada no backend.
 * Heurística por passo: "feito" = o mínimo que o respectivo PUT exige está lá.
 *
 * Não há mais estado local: com o onboarding removido, todo passo é verificável
 * no servidor. Isso apaga uma classe inteira de bug — o `localStorage` dizendo
 * "feito" para uma conexão que caiu.
 *
 * Mede "o Kaua consegue trabalhar", não "cadastro preenchido" — daí entrarem
 * agenda, Pix/serviços e fiscal, e não só empresa/agente.
 */
export function useAtivacao(): AtivacaoStatus {
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });
  // Serviços vivem em rota própria (`/api/empresa/servicos`), não como campo de
  // `/api/empresa`. Buscar aqui é o que faz o passo "serviços" ficar verde.
  const servicosQuery = useQuery({ queryKey: ["servicos"], queryFn: empresaService.listServicos });
  const whatsappQuery = useQuery({ queryKey: ["whatsapp", "status"], queryFn: whatsappService.status });
  const ferramentasQuery = useQuery({ queryKey: ["ferramentas"], queryFn: ferramentasService.listFerramentasFallback });

  // As capacidades decidem QUAIS passos existem — não o que está conectado.
  const agenteQuery = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });

  const empresa = empresaQuery.data;
  const ferramentas = ferramentasQuery.data ?? [];

  const feito: Record<PassoId, boolean> = {
    whatsapp: Boolean(whatsappQuery.data?.connected),
    // agenda = ferramenta de calendário conectada (Google Calendar hoje)
    agenda: ferramentas.some((f) => f.id === "agenda" && f.connected),
    // serviços + Pix: os dois são exigidos para cobrar e conferir comprovante
    servicos: Boolean(servicosQuery.data?.length && empresa?.pixKey?.trim()),
    fiscal: ferramentas.some((f) => f.id === "fiscal" && f.connected),
  };

  // Passos que valem para ESTA clínica: sem `capabilities.fiscal`, o passo fiscal
  // sai da lista — do contrário a barra trava para sempre num número menor que o
  // total e "tudo pronto" vira inalcançável.
  const passos = passosDe(agenteQuery.data?.capabilities ?? null);

  const concluidos = passos.filter((p) => feito[p.id]).length;
  const proximo = (passos.find((p) => !feito[p.id]) ?? passos[0]).id;

  return {
    isLoading:
      empresaQuery.isLoading || servicosQuery.isLoading || whatsappQuery.isLoading || ferramentasQuery.isLoading,
    feito,
    passos,
    concluidos,
    total: passos.length,
    completo: concluidos === passos.length,
    proximo,
    numeroWhatsApp: whatsappQuery.data?.number ?? null,
  };
}
