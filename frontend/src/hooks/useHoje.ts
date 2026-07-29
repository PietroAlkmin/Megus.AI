import { useQuery } from "@tanstack/react-query";
import * as agenteService from "@/services/agente";
import * as cobrancasService from "@/services/cobrancas";
import * as empresaService from "@/services/empresa";
import * as whatsappService from "@/services/whatsapp";
import { ETAPAS, etapaDe, type EtapaId } from "@/services/pipeline";
import type { EtapaFunil, Pendencia, ResumoHoje } from "@/services/hoje";

/**
 * Resumo da Hoje **sem depender de `GET /api/hoje`**.
 *
 * A Hoje é a home: se ela quebra, o app quebra. Como a rota agregada ainda não
 * existe, este hook monta o mesmo `ResumoHoje` a partir do que já responde
 * (`/api/cobrancas`, `/api/empresa`, `/api/agente`, status do WhatsApp).
 *
 * Quando `GET /api/hoje` subir, troque em `pages/Hoje.tsx`:
 *
 *     const { data: resumo } = useQuery({ queryKey: ["hoje"], queryFn: getResumoHoje });
 *
 * e apague este arquivo. O contrato (`ResumoHoje`) é o mesmo de propósito — a
 * troca é de uma linha, não uma reescrita da tela.
 *
 * ⚠️ O que o fallback NÃO consegue derivar, e por isso vem vazio:
 * - **pendências**: exigem o motivo do bloqueio (CPF divergente, comprovante
 *   fora do valor), que hoje só existe no estado da conversa no backend.
 * - **trilha**: exige log de ações do agente.
 * Ambas aparecem como "nada por aqui" — honesto, e a seção se resolve sozinha.
 */
export function useHoje() {
  const cobrancasQuery = useQuery({ queryKey: ["cobrancas"], queryFn: cobrancasService.listCobrancas });
  const metricasQuery = useQuery({ queryKey: ["cobrancas", "metricas"], queryFn: cobrancasService.getMetricas });
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });
  const agenteQuery = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });
  const whatsappQuery = useQuery({ queryKey: ["whatsapp", "status"], queryFn: whatsappService.status });

  const isLoading =
    cobrancasQuery.isLoading || metricasQuery.isLoading || empresaQuery.isLoading || whatsappQuery.isLoading;

  // `undefined` enquanto carrega — a Hoje trata isso como terceiro estado
  // (`pronto`), e é justamente o que impede a manchete de afirmar algo falso.
  const resumo: ResumoHoje | undefined = isLoading
    ? undefined
    : montar({
        cobrancas: cobrancasQuery.data ?? [],
        clinica: empresaQuery.data?.name || empresaQuery.data?.fiscalName || "sua clínica",
        agenteNome: agenteQuery.data?.name || "Kaua",
        whatsapp: whatsappQuery.data ?? { connected: false, number: null },
      });

  return { resumo, isLoading, refetch: () => void cobrancasQuery.refetch() };
}

function montar(d: {
  cobrancas: cobrancasService.Cobranca[];
  clinica: string;
  agenteNome: string;
  whatsapp: whatsappService.WhatsAppStatus;
}): ResumoHoje {
  // O funil usa a MESMA derivação do kanban (`etapaDe`) — uma fonte de verdade.
  // Se o backend muda o significado de `pago`, os dois acompanham juntos.
  const porEtapa = new Map<EtapaId, cobrancasService.Cobranca[]>();
  for (const c of d.cobrancas) {
    const etapa = etapaDe(c);
    porEtapa.set(etapa, [...(porEtapa.get(etapa) ?? []), c]);
  }

  // Etapa é cumulativa no funil: quem pagou também foi cobrado e agendado.
  // "Nota pedida" fica fora da régua da Hoje — lá o resumo tem 4 degraus; a fila
  // da clínica é assunto do kanban, que tem espaço para ela.
  const ordem = ETAPAS.map((e) => e.id);
  const funil: EtapaFunil[] = ETAPAS.filter((e) => e.id !== "nota_pedida").map((e) => {
    const desde = ordem.indexOf(e.id);
    const daqui = ordem.slice(desde).flatMap((id) => porEtapa.get(id) ?? []);
    return {
      id: e.id,
      label: e.label,
      n: daqui.length,
      valor: daqui.reduce((s, c) => s + (c.valor ?? 0), 0),
    };
  });

  const recebido = d.cobrancas.filter((c) => c.pago).reduce((s, c) => s + (c.valor ?? 0), 0);

  return {
    data: new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "long" }),
    clinica: d.clinica,
    // Ver a ⚠️ do topo: sem o motivo do bloqueio, inventar pendência seria pior.
    pendencias: [] as Pendencia[],
    funil,
    trilha: [],
    // `alvo` ainda não tem campo no backend; sem meta definida a faixa fica em 0.
    meta: { alvo: 0, atual: recebido },
    agente: {
      nome: d.agenteNome,
      noAr: d.whatsapp.connected,
      desde: null,
      numero: d.whatsapp.number,
    },
  };
}
