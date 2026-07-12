import { apiFetch } from "@/lib/api";

/** Uma linha de cobrança (emissão OU charge) exibida na tela. Espelha o formato de `cobrancas.routes.ts`. */
export interface Cobranca {
  id: string;
  nome: string;
  servico: string;
  valor: number;
  agendamento: string | null;
  pago: boolean;
  pagoEm: string | null;
  notaEmitida: boolean;
  notaNum: string | null;
  cobrado: boolean;
  cobradoEm: string | null;
  /** true = linha vinda de Charge (Task 4, botão dispara o WhatsApp de verdade); ausente = fluxo EmissionIntent de sempre. */
  charge?: boolean;
}

/** Métricas do topo da tela. Espelha `calcularMetricas` do backend. */
export interface CobrancaMetricas {
  agendados: number;
  pagos: number;
  pendentes: number;
  notasEmitidas: number;
  aCobrar: number;
  valorPendente: number;
}

/** GET /api/cobrancas — lista de cobranças (emissões) da empresa logada. */
export async function listCobrancas(): Promise<Cobranca[]> {
  return apiFetch<Cobranca[]>("GET", "/api/cobrancas");
}

/** GET /api/cobrancas/metricas — resumo para os cards do topo. */
export async function getMetricas(): Promise<CobrancaMetricas> {
  return apiFetch<CobrancaMetricas>("GET", "/api/cobrancas/metricas");
}

/** POST /api/cobrancas/:id/cobrar — registra a cobrança (fluxo EmissionIntent de sempre). */
export async function cobrar(id: string): Promise<{ id: string; cobrado: boolean }> {
  return apiFetch<{ id: string; cobrado: boolean }>("POST", `/api/cobrancas/${encodeURIComponent(id)}/cobrar`);
}

/** POST /api/cobrancas/charges/:id/cobrar — Charge (Task 4): o Kaua manda a cobrança de verdade no WhatsApp (valor + Pix). */
export async function cobrarCharge(id: string): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>("POST", `/api/cobrancas/charges/${encodeURIComponent(id)}/cobrar`);
}