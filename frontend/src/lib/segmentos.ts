// Catálogo de segmentos de negócio — id persistido no AgentConfig.segment.
// Fonte única: o form do agente e as telas que exibem o segmento leem daqui.
export const SEGMENTOS = [
  { id: "varejo", titulo: "Comércio / Varejo", desc: "Venda de mercadorias" },
  { id: "restaurante", titulo: "Restaurante", desc: "Consumo no local e balcão" },
  { id: "servicos", titulo: "Serviços / Consultório", desc: "Prestação de serviços" },
  { id: "saude", titulo: "Saúde / Clínica", desc: "Consultas e procedimentos" },
  { id: "beleza", titulo: "Beleza / Estética", desc: "Sessões e tratamentos" },
  { id: "educacao", titulo: "Educação / Cursos", desc: "Aulas e mensalidades" },
] as const;

/** Rótulo humano do segmento; ids desconhecidos voltam como vieram (dado real, não placeholder). */
export function segmentoLabel(id: string): string {
  return SEGMENTOS.find((s) => s.id === id)?.titulo ?? id;
}
