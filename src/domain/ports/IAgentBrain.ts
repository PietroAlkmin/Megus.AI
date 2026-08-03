import type { Message } from "../entities/Message";

/**
 * Porta do CÉREBRO (LLM). Recebe o contexto da conversa e devolve a próxima
 * resposta + a ação proposta. Implementação = adapter OpenAI.
 *
 * A LÓGICA de estado (quando pedir CPF, quando emitir, etc.) vive na Application
 * (ConversationStateMachine — Seção 2). Esta porta só decide texto + ação proposta;
 * a Application valida e executa (a IA não age sozinha em ações sensíveis).
 */
export interface AgentPersona {
  name: string;
  segment: string;
  tone: "formal" | "equilibrado" | "descontraido";
  emojis: boolean;
  lang: "pt" | "en" | "es";
  instructions: string;
  fewShotDialogs: { q: string; a: string }[];
}

export interface AgentBusinessService {
  description: string;
  price: number;
  emissivel: boolean;
}

/** Cadastro rico da empresa (aba Empresa do painel) — só campos PREENCHIDOS chegam aqui. */
export interface AgentBusinessProfile {
  fantasyName: string | null; // nome fantasia (apresentação natural: "Clínica Sorriso")
  address: string | null; // "onde vocês ficam?" — rua/número/bairro
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  pixType: string | null;
  pixKey: string | null;
  paymentInstructions: string | null;
}

export interface AgentBusiness {
  companyName: string; // integration.fiscalName (razão social)
  /** null quando a empresa não preencheu o cadastro — o prompt omite o bloco. */
  profile: AgentBusinessProfile | null;
  services: AgentBusinessService[]; // serviços da integração; emissivel = está em linkedServiceIds
}

/**
 * Uma cobrança em aberto DESTE cliente (status != paga).
 *
 * O agente precisa disso para responder "quanto é?" sozinho. Sem o bloco, ele
 * dizia *"vou pedir para a equipe confirmar o valor"* com a resposta no banco —
 * visto em produção 02/08, exatamente o trabalho que ele existe para tirar da
 * clínica.
 */
export interface AgentOpenCharge {
  description: string;
  amount: number;
  /** A cobrança já foi disparada no WhatsApp? Evita "vou te enviar" para algo já enviado. */
  enviada: boolean;
}

export interface AgentCollected {
  cpfNameVerified: boolean; // contato já validou CPF↔nome?
  fullNameMasked: string | null; // ex.: "João S." (nunca o nome cru completo)
  cpfMasked: string | null; // ex.: "529.***.**7-25"
  emissionStatus: string | null; // status do EmissionIntent corrente, se houver
}

export interface AgentContext {
  /** Empresa dona da integration (tenant) — ex.: resolve tools da empresa via IAgentToolsProvider. */
  companyId: string;
  persona: AgentPersona;
  business: AgentBusiness;
  state: string; // ConversationState atual
  history: Message[];
  collected: AgentCollected;
  /** Cobranças em aberto do cliente da conversa. Vazio = nada devendo (bloco omitido). */
  openCharges: AgentOpenCharge[];
  /**
   * Dados de cadastro que a clínica pediu para coletar e o paciente AINDA não
   * informou (rótulos prontos). Vazio = nada a pedir — o bloco some do prompt.
   */
  cadastroPendente: string[];
  today: string; // data corrente PT-BR (ex.: "sábado, 5 de julho de 2026")
  /** Avisos TRANSIENTES do sistema para ESTE turno (ex.: "cadastro validado agora —
   *  conclua a ação pendente"). Mecanismo genérico de sinal de FLUXO — nunca regra
   *  de cenário/segmento (princípio do prompt agnóstico). */
  notices?: string[];
  /**
   * A empresa habilitou a AGENDA para o agente (`capabilities.agenda`)?
   * Desligado ⇒ as ferramentas de calendário NÃO chegam ao cérebro, mesmo com a
   * conta Google conectada — quem decide o que o agente pode fazer é a capacidade
   * PERSISTIDA, não o que por acaso está conectado. (Cliente que agenda por conta
   * própria quer o agente lendo/atendendo, nunca marcando por iniciativa dele.)
   * Ausente = ligado, preservando o comportamento de quem já usava.
   */
  agendaEnabled?: boolean;
}

export type AgentProposedAction =
  | { type: "reply" }
  | { type: "answer_question" } // respondeu dúvida de negócio
  | { type: "quote_price" } // cotou preço de serviço
  | { type: "smalltalk" } // conversa social
  | { type: "provide_identity" } // cliente forneceu nome/CPF (extracted preenchido)
  | { type: "intent_emit" } // cliente quer emitir → aciona coleta de identidade
  | { type: "request_comprovante" }
  | { type: "handoff"; reason: string };

export interface AgentDecision {
  reply: string[]; // bolhas de texto a enviar
  action: AgentProposedAction;
  /**
   * Dados extraídos da mensagem do cliente (o código valida; a IA só propõe).
   *
   * Os campos de FICHA (nascimento em diante) são o cadastro que a clínica
   * redigita no sistema dela — coletados na conversa e guardados no contato,
   * para ela não precisar reler o histórico mensagem por mensagem.
   */
  extracted?: {
    fullName?: string;
    cpf?: string;
    amount?: number;
    nascimento?: string;
    sexo?: string;
    email?: string;
    cep?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    convenio?: string;
  };
  /**
   * Resultados das tools de NEGÓCIO chamadas pelo motor nesta decisão (ex.:
   * GOOGLECALENDAR_CREATE_EVENT) — repassados de `AgentEngineResult.toolResults`
   * sem tradução. ADDITIVE (Task 3, Plano 7): ausente/vazio nos fluxos que não
   * chamam tool nenhuma. A Application (ConversationStateMachine) usa isto pra
   * criar a Charge pendente quando um evento de agenda foi marcado.
   */
  toolResults?: { name: string; output: unknown }[];
}

export interface IAgentBrain {
  decide(context: AgentContext): Promise<AgentDecision>;
}
