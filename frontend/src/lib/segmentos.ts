// Catálogo de segmentos de negócio — id persistido no AgentConfig.segment.
// Fonte única: o form do agente e as telas que exibem o segmento leem daqui.
// `emBreve`: segmento visível mas ainda não habilitado no piloto (decisão de
// produto do feat/integracao — só "servicos" liberado por ora).
export const SEGMENTOS = [
  { id: "varejo", titulo: "Comércio / Varejo", desc: "Venda de mercadorias", emBreve: true },
  { id: "restaurante", titulo: "Restaurante / Alimentação", desc: "Consumo no local e balcão", emBreve: true },
  { id: "servicos", titulo: "Serviços / Consultório", desc: "Prestação de serviços", emBreve: false },
  { id: "saude", titulo: "Saúde / Clínica", desc: "Consultas e procedimentos", emBreve: true },
  { id: "beleza", titulo: "Beleza / Estética", desc: "Sessões e tratamentos", emBreve: true },
  { id: "educacao", titulo: "Educação / Cursos", desc: "Aulas e mensalidades", emBreve: true },
] as const;

/** Rótulo humano do segmento; ids desconhecidos voltam como vieram (dado real, não placeholder). */
export function segmentoLabel(id: string): string {
  return SEGMENTOS.find((s) => s.id === id)?.titulo ?? id;
}
