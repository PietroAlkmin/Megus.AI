import { useQuery } from "@tanstack/react-query";
import * as agenteService from "@/services/agente";

/**
 * Como o agente DESTA clínica se chama.
 *
 * O nome é escolhido no cadastro (`agentConfig.name`) — a clínica-piloto batizou
 * o dela de "Nina". O painel, porém, escrevia "Kaua" em ~25 lugares: o nome do
 * agente do piloto, chumbado na interface de todo mundo. Para quem usa, é o
 * produto chamando o próprio funcionário pelo nome errado.
 *
 * A consulta é a MESMA de `["agente"]` que as telas já fazem — o React Query
 * devolve do cache, sem request extra.
 *
 * Sem artigo de propósito: "Nina está conduzindo" funciona, "o Nina" não —
 * e não temos (nem queremos ter) gênero do agente. Enquanto carrega, "o agente"
 * mantém a frase legível.
 */
export function useNomeAgente(): { nome: string; Nome: string } {
  const { data } = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });
  const nome = data?.name?.trim() || "o agente";
  return { nome, Nome: nome.charAt(0).toUpperCase() + nome.slice(1) };
}
