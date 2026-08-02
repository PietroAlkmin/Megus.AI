import { apiFetch } from "@/lib/api";
import type { Cobranca } from "@/services/cobrancas";

/**
 * Pipeline do Financeiro — o mesmo ciclo, visto por paciente.
 *
 * NÃO tem endpoint próprio: a etapa é DERIVADA das flags que /api/cobrancas já
 * devolve. Menos superfície de API e uma fonte de verdade só — se o backend
 * muda o significado de `pago`, o kanban acompanha sem contrato novo.
 *
 * ⚠️ O ciclo real tem CINCO etapas, não quatro. Quem emite a nota é a clínica,
 * no sistema fiscal dela — o Megus registra o pedido e marca quando foi emitida.
 * Entre "pago" e "nota emitida" existe, portanto, um estado que é **a fila de
 * trabalho da clínica**: pagou, pediu nota, ela ainda não emitiu. Sem essa
 * coluna a pessoa volta a reler conversa para saber de quem é a nota — que é
 * exatamente o problema que a pergunta automática resolveu.
 */
export type EtapaId = "agendado" | "cobrado" | "pago" | "nota_pedida" | "nota";

export interface EtapaPipeline {
  id: EtapaId;
  label: string;
  /** O que o usuário deve entender que está acontecendo nesta coluna. */
  ajuda: string;
  /** Coluna que é fila de trabalho da clínica — ganha destaque terracota. */
  fila?: boolean;
}

export const ETAPAS: EtapaPipeline[] = [
  { id: "agendado", label: "Agendado", ajuda: "Consulta na agenda, ainda não cobrada." },
  { id: "cobrado", label: "Cobrado", ajuda: "Cobrança enviada, aguardando o pagamento." },
  { id: "pago", label: "Pago", ajuda: "Pagamento confirmado pelo comprovante." },
  { id: "nota_pedida", label: "Nota pedida", ajuda: "O paciente pediu nota — falta você emitir.", fila: true },
  { id: "nota", label: "Nota emitida", ajuda: "Emitida pela clínica. Ciclo fechado." },
];

/**
 * Deriva a etapa das flags — ordem importa (a mais avançada ganha).
 *
 * `notaEmitida` mudou de sentido no fluxo Charge: hoje significa "a clínica
 * marcou que emitiu no sistema fiscal dela", não "o Megus emitiu".
 */
export function etapaDe(c: Cobranca): EtapaId {
  if (c.notaEmitida) return "nota";
  // Pagou e pediu nota → fila da clínica. Quem disse que NÃO quer nota fica em
  // "Pago", que para ele já é o fim do ciclo.
  if (c.pago && c.notaSolicitada === true) return "nota_pedida";
  if (c.pago) return "pago";
  if (c.cobrado) return "cobrado";
  return "agendado";
}

/**
 * A situação da nota, para o card mostrar sem ambiguidade.
 *
 * A distinção importa: "não quis" é ciclo fechado, "aguardando resposta" é o
 * agente ainda perguntando. Fundir os dois faria a clínica emitir nota de quem
 * não pediu.
 */
export type SituacaoNota = "emitida" | "pedida" | "dispensada" | "aguardando";

export function situacaoNota(c: Cobranca): SituacaoNota | null {
  if (c.notaEmitida) return "emitida";
  if (!c.pago) return null;
  if (c.notaSolicitada === true) return "pedida";
  if (c.notaSolicitada === false) return "dispensada";
  return "aguardando";
}

/**
 * Quanto tempo o paciente está parado nesta etapa, em dias.
 * Alimenta o "envelhecimento" do card: parado é o sintoma, não a etapa.
 */
export function paradoDe(c: Cobranca): number {
  const marco = c.pagoEm ?? c.cobradoEm ?? c.agendamento;
  if (!marco) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(marco).getTime()) / 86_400_000));
}

/** Temperatura do card — 3 faixas, porque 2 não distinguem "atenção" de "problema". */
export function temperatura(dias: number): "ok" | "morno" | "frio" {
  if (dias >= 5) return "frio";
  if (dias >= 2) return "morno";
  return "ok";
}

/**
 * ⚠️ A IMPLEMENTAR: mover um paciente de etapa manualmente (arrastar o card).
 *
 * Duas transições JÁ funcionam por rota própria e não passam aqui:
 * `cobrado` (`cobrancas.cobrar`) e `nota` (`cobrancas.marcarNotaEmitida`).
 * Faltam baixar pagamento à mão e voltar etapa.
 */
export async function moverEtapa(id: string, etapa: EtapaId): Promise<{ id: string; etapa: EtapaId }> {
  return apiFetch("POST", `/api/cobrancas/${encodeURIComponent(id)}/etapa`, { etapa });
}
