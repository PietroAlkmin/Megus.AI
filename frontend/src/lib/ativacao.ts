/**
 * Os passos de ativação do Megus — as conexões que o Kaua precisa para trabalhar.
 *
 * **Não é um wizard.** Havia um onboarding em 4 camadas (boas-vindas, cartão de
 * ativação, simulação do agente, dicas contextuais) — todo removido. O que sobrou
 * é só a medição: quais conexões faltam. Quem resolve é a tela de Integrações.
 *
 * Por isso este módulo não tem mais ícone, CTA nem textos explicativos: eles
 * existiam para o cartão de ativação. Ficaram `id`, `nome` e a regra de
 * capacidade — o que de fato é consumido.
 */
export type PassoId = "whatsapp" | "agenda" | "servicos" | "fiscal";

export interface PassoAtivacao {
  id: PassoId;
  nome: string;
  /**
   * Passo que só existe se a capacidade correspondente estiver ligada no agente.
   *
   * `fiscal` é o caso: há clínica que **emite a nota por fora** e nunca vai
   * conectar provedor. Cobrar esse passo dela trava o contador num número menor
   * que o total para sempre, e "tudo conectado" vira inalcançável. Quem manda é a
   * capacidade configurada, não o que por acaso está conectado.
   */
  exigeCapacidade?: "fiscal" | "agenda";
}

export const PASSOS_ATIVACAO: PassoAtivacao[] = [
  { id: "whatsapp", nome: "Conectar o WhatsApp" },
  { id: "agenda", nome: "Conectar a agenda" },
  { id: "servicos", nome: "Serviços e chave Pix" },
  { id: "fiscal", nome: "Provedor fiscal", exigeCapacidade: "fiscal" },
];

/**
 * Os passos que valem para ESTA clínica.
 *
 * Clínica sem emissão pelo Megus (`capabilities.fiscal === false`) não tem o
 * passo fiscal — e aí a ativação pode de fato completar.
 */
export function passosDe(capacidades?: { fiscal: boolean; agenda: boolean } | null): PassoAtivacao[] {
  if (!capacidades) return PASSOS_ATIVACAO;
  return PASSOS_ATIVACAO.filter((p) => !p.exigeCapacidade || capacidades[p.exigeCapacidade]);
}
