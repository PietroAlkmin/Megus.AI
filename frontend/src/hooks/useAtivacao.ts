import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as agenteService from "@/services/agente";
import * as empresaService from "@/services/empresa";
import * as ferramentasService from "@/services/ferramentas";
import * as whatsappService from "@/services/whatsapp";
import type { PassoId, PassoAtivacao } from "@/lib/ativacao";
import { passosDe } from "@/lib/ativacao";

/** Marca local dos passos que não têm estado no backend (hoje só a simulação). */
const VISTO_KEY = "megus_ativacao_local";
const OCULTO_KEY = "megus_ativacao_oculta";

function lerLocal(): Partial<Record<PassoId, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(VISTO_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export interface AtivacaoStatus {
  isLoading: boolean;
  feito: Record<PassoId, boolean>;
  /** Os passos que valem para esta clínica (fiscal sai se ela emite por fora). */
  passos: PassoAtivacao[];
  concluidos: number;
  total: number;
  completo: boolean;
  /** Primeiro passo pendente — o que a UI abre por padrão. */
  proximo: PassoId;
  /** Cartão oculto pelo usuário (some da Hoje, some no logout da conta). */
  oculto: boolean;
  ocultar: () => void;
  /** Marca um passo local (simulação assistida). */
  marcar: (id: PassoId) => void;
  numeroWhatsApp: string | null;
}

/**
 * Deriva a ativação dos DADOS já cadastrados, sem flag dedicada no backend.
 * Heurística por passo: "feito" = o mínimo que o respectivo PUT exige está lá.
 *
 * Substitui o antigo `useOnboardingStatus` (3 passos: empresa/agente/whatsapp).
 * A diferença é conceitual: aquele media "cadastro preenchido", este mede
 * "o Kaua consegue trabalhar" — daí entrarem agenda, Pix/serviços e fiscal.
 */
export function useAtivacao(): AtivacaoStatus {
  const [local, setLocal] = useState(lerLocal);
  const [oculto, setOculto] = useState(() => localStorage.getItem(OCULTO_KEY) === "1");

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
    simulou: Boolean(local.simulou),
  };

  // Passos que valem para ESTA clínica: sem `capabilities.fiscal`, o passo fiscal
  // sai da lista — do contrário a barra trava em 80% para sempre.
  const passos = passosDe(agenteQuery.data?.capabilities ?? null);

  const concluidos = passos.filter((p) => feito[p.id]).length;
  const proximo = (passos.find((p) => !feito[p.id]) ?? passos[0]).id;

  const marcar = useCallback((id: PassoId) => {
    setLocal((atual) => {
      const proximo = { ...atual, [id]: true };
      localStorage.setItem(VISTO_KEY, JSON.stringify(proximo));
      return proximo;
    });
  }, []);

  const ocultar = useCallback(() => {
    localStorage.setItem(OCULTO_KEY, "1");
    setOculto(true);
  }, []);

  return {
    isLoading:
      empresaQuery.isLoading || servicosQuery.isLoading || whatsappQuery.isLoading || ferramentasQuery.isLoading,
    feito,
    passos,
    concluidos,
    total: passos.length,
    completo: concluidos === passos.length,
    proximo,
    oculto,
    ocultar,
    marcar,
    numeroWhatsApp: whatsappQuery.data?.number ?? null,
  };
}
