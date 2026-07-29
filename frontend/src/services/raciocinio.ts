import { apiFetch } from "@/lib/api";

/**
 * Raciocínio do agente numa conversa — o que ele extraiu e decidiu.
 *
 * ⚠️ Rota A IMPLEMENTAR. É o dado que sustenta a coluna direita de Conversas e
 * o painel da simulação: sem ela, o usuário lê a conversa mas não vê POR QUE o
 * agente parou. Vale priorizar — é o que troca desconfiança por auditoria.
 */
export interface LinhaRaciocinio {
  chave: string;
  valor: string;
  ok: boolean;
}

/** GET /api/conversas/:convId/raciocinio */
export async function getRaciocinio(convId: string): Promise<LinhaRaciocinio[]> {
  return apiFetch<LinhaRaciocinio[]>("GET", `/api/conversas/${encodeURIComponent(convId)}/raciocinio`);
}
