import { apiFetch } from "@/lib/api";

/**
 * Dados da tela Hoje (cockpit operacional).
 *
 * ⚠️ Endpoints A IMPLEMENTAR no backend — as rotas abaixo ainda não existem.
 * Os tipos aqui são o contrato proposto; enquanto não subirem, `useHoje`
 * (em `hooks/useHoje.ts`) monta o resumo a partir de /api/cobrancas e
 * /api/conversas, que já respondem.
 */

/** Um caso que o agente NÃO pôde resolver e devolveu para um humano. */
export interface Pendencia {
  id: string;
  /** Governa o rótulo e a cor da borda: erro de dado, divergência, ou pedido explícito. */
  tipo: "cpf" | "pagamento" | "humano";
  paciente: string;
  quando: string;
  titulo: string;
  /** Por que o Kaua parou — sempre com o dado concreto que causou o bloqueio. */
  detalhe: string;
  /**
   * O dado que decide, em par chave/valor. A tabela mostra isso na linha para
   * a pessoa resolver sem abrir a conversa ("CPF informado: 111.222.333-44").
   */
  motivo: { chave: string; valor: string } | null;
  /** Quanto está parado neste caso. `null` quando não há valor em jogo. */
  valor: number | null;
  conversaId: string | null;
}

/** Uma etapa do ciclo agendamento → nota, com quantos pacientes e quanto valor. */
export interface EtapaFunil {
  /** Espelha `EtapaId` de `services/pipeline.ts` — mesma derivação, mesma verdade. */
  id: "agendado" | "cobrado" | "pago" | "nota_pedida" | "nota";
  label: string;
  n: number;
  valor: number;
}

/** Uma linha da trilha de auditoria — o que o agente executou. */
export interface EventoTrilha {
  id: string;
  hora: string;
  quem: "kaua" | "humano";
  texto: string;
  valor: number | null;
  tag: "nota" | "pago" | "alerta" | "cobranca" | "humano" | "sync";
}

export interface ResumoHoje {
  data: string;
  /** Nome da clínica — vai no rótulo do cabeçalho, junto da data. */
  clinica: string;
  pendencias: Pendencia[];
  funil: EtapaFunil[];
  trilha: EventoTrilha[];
  meta: { alvo: number; atual: number };
  agente: { nome: string; noAr: boolean; desde: string | null; numero: string | null };
}

/** GET /api/hoje — resumo do dia da empresa logada. */
export async function getResumoHoje(): Promise<ResumoHoje> {
  return apiFetch<ResumoHoje>("GET", "/api/hoje");
}

/** POST /api/hoje/pendencias/:id/resolver — tira o caso da fila humana. */
export async function resolverPendencia(id: string): Promise<{ id: string; resolvida: boolean }> {
  return apiFetch("POST", `/api/hoje/pendencias/${encodeURIComponent(id)}/resolver`);
}
