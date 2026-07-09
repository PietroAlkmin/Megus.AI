import { apiFetch } from "@/lib/api";

/** Um agente (integração) na tela de Atendimentos. Espelha o formato de `atendimentos.routes.ts`. */
export interface Agente {
  id: string;
  nome: string;
  papel: string;
  numero: string;
  segmento: string;
  doc: string;
  status: "operando" | "atencao" | "desconectado" | "pausado";
  conversas: number;
  notasHoje: number;
  resp: string;
  ultima: string;
  alerta: string | null;
}

/** Métricas do topo. Espelha `metricasReais` do backend. */
export interface AgentesMetricas {
  operando: number;
  total: number;
  abertas: number;
  notasHoje: number;
  msgsHoje: number;
  transferencias: number;
  alertas: number;
}

/** GET /api/agentes — lista de agentes da empresa logada. */
export async function listAgentes(): Promise<Agente[]> {
  return apiFetch<Agente[]>("GET", "/api/agentes");
}

/** GET /api/agentes/metricas — resumo para os cards do topo. */
export async function getMetricas(): Promise<AgentesMetricas> {
  return apiFetch<AgentesMetricas>("GET", "/api/agentes/metricas");
}