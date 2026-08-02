import { Bot, CalendarDays, CreditCard, FileText, MessageCircle, type LucideIcon } from "lucide-react";

/**
 * Os cinco passos de ativação do Megus.
 *
 * As conexões que o Kaua precisa para trabalhar. Não é um wizard: a lista mede
 * o que falta, e Integrações é onde se resolve.
 *
 * Contexto histórico: havia um 5º passo ("ver o Kaua atender") que abria uma
 * num ambiente seguro, sim. Por isso a simulação é o momento de valor e fecha
 * a checklist.
 *
 * Cada passo carrega dois textos distintos, e a diferença é proposital:
 *   porque  — por que ISTO importa (o que quebra sem ele)
 *   detalhe — o que vai acontecer quando clicar (tira o medo do próximo passo)
 */
export type PassoId = "whatsapp" | "agenda" | "servicos" | "fiscal";

export interface PassoAtivacao {
  id: PassoId;
  nome: string;
  icon: LucideIcon;
  /** Uma linha, para a tela de boas-vindas. */
  curto: string;
  porque: string;
  detalhe: string;
  cta: string;
  /** Para onde o CTA leva. `null` = abre a simulação (não é uma rota). */
  to: string | null;
  /** Destaca o passo na lista — o que muda a percepção do produto. */
  destaque?: boolean;
  /**
   * Passo que só existe se a capacidade correspondente estiver ligada no agente.
   *
   * `fiscal` é o caso: há clínica que **emite a nota por fora** e nunca vai
   * conectar provedor. Cobrar esse passo dela trava a barra em 80% para sempre e
   * torna "Tudo pronto" inalcançável. Quem manda é a capacidade configurada, não
   * o que por acaso está conectado.
   */
  exigeCapacidade?: "fiscal" | "agenda";
}

export const PASSOS_ATIVACAO: PassoAtivacao[] = [
  {
    id: "whatsapp",
    nome: "Conectar o WhatsApp",
    icon: MessageCircle,
    curto: "O número que o Kaua usa para atender.",
    porque:
      "É por aqui que tudo acontece. O Kaua lê e responde as mensagens dos seus pacientes neste número — o mesmo que eles já conhecem.",
    detalhe:
      "Você lê um QR code, como no WhatsApp Web. Leva menos de um minuto e o número continua funcionando normalmente no seu celular.",
    cta: "Conectar número",
    to: "/integracoes",
  },
  {
    id: "agenda",
    nome: "Conectar a agenda",
    icon: CalendarDays,
    curto: "De onde vêm as consultas do dia.",
    porque:
      "Sem a agenda o Kaua não sabe quem atender nem quanto cobrar. Ele lê as consultas do dia e monta a fila de cobrança sozinho.",
    detalhe: "Funciona com Google Calendar. Nada é alterado na sua agenda — o Megus apenas lê os compromissos.",
    cta: "Conectar agenda",
    to: "/integracoes",
  },
  {
    id: "servicos",
    nome: "Serviços e chave Pix",
    icon: CreditCard,
    curto: "O que cobrar e para onde o dinheiro vai.",
    porque:
      "O valor da cobrança vem do serviço, e a conferência do comprovante compara o recebedor com a sua chave. Sem isso o Kaua não confirma pagamento nenhum.",
    detalhe:
      "Cadastre os serviços com valor e código ISS, e a chave Pix da clínica. Você pode ajustar depois a qualquer momento.",
    cta: "Cadastrar serviços",
    to: "/clinica",
  },
  {
    id: "fiscal",
    nome: "Provedor fiscal",
    icon: FileText,
    curto: "Quem emite a NFS-e de verdade.",
    porque:
      "Enquanto isso não estiver ligado, o Kaua faz todo o resto mas para antes de emitir — e avisa você. Nenhuma nota é emitida em modo simulado.",
    detalhe:
      "Conectamos ao provedor da sua prefeitura ou ao seu ERP. É o único passo que costuma precisar do seu contador por perto.",
    cta: "Configurar emissão",
    to: "/integracoes",
    exigeCapacidade: "fiscal",
  },
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
