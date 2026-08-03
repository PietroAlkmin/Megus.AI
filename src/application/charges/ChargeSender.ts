import { randomUUID } from "node:crypto";
import type { Charge } from "../../domain/entities/Charge";
import type { IMessagingProvider } from "../../domain/ports/IMessagingProvider";
import type {
  IAgentConfigRepository,
  IChargeRepository,
  ICompanyProfileRepository,
  IContactRepository,
  IConversationRepository,
  IIntegrationRepository,
} from "../../domain/ports/repositories";

/** Primeiro nome do contato pra saudação — nunca inventa nome (sem nome: "Olá!" liso). */
function primeiroNome(fullName: string | null | undefined): string {
  const nome = (fullName ?? "").trim();
  return nome ? nome.split(/\s+/)[0]! : "";
}

/** Mesma convenção usada no resto da casa pra valores em mensagem/PDF ("R$ 180,00"). */
function formatBRL(amount: number): string {
  return "R$ " + amount.toFixed(2).replace(".", ",");
}

/**
 * Mensagem de cobrança proativa do Kaua: valor + Pix da empresa + instrução do
 * comprovante. Sem `pixKey`, a linha do Pix é OMITIDA por inteiro — nunca um
 * placeholder tipo "Pix: a combinar".
 */
export function montarMensagemCobranca(params: {
  fullName: string | null | undefined;
  description: string;
  amount: number;
  pixType: string | null | undefined;
  pixKey: string | null | undefined;
  fiscalEnabled: boolean;
}): string {
  const nome = primeiroNome(params.fullName);
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  const partes = [
    `${saudacao} Passando para combinar o pagamento da sua ${params.description}: ${formatBRL(params.amount)}.`,
  ];
  if (params.pixKey) {
    // "(tipo)" só quando existe — pixType vazio no cadastro renderizaria "Pix (): chave".
    const tipo = params.pixType?.trim() ? ` (${params.pixType.trim()})` : "";
    partes.push(`Pix${tipo}: ${params.pixKey}.`);
  }
  partes.push(params.fiscalEnabled
    ? "Depois é só me enviar o comprovante por aqui que eu já emito sua nota fiscal. 😊"
    : "Depois é só me enviar o comprovante por aqui para eu confirmar o pagamento. 😊");
  return partes.join("\n\n");
}

export interface ChargeSenderDeps {
  charges: IChargeRepository;
  contacts: IContactRepository;
  integrations: IIntegrationRepository;
  conversations: IConversationRepository;
  companyProfiles: ICompanyProfileRepository;
  agentConfigs?: IAgentConfigRepository;
  messaging: IMessagingProvider;
}

/**
 * O disparo da cobrança pelo WhatsApp, em UM lugar só.
 *
 * Existiam duas cópias da mensagem (rota do painel e comando `/admin cobrar`) e
 * elas já divergiam — uma omitia a linha do Pix quando não havia chave, a outra
 * escrevia "Pix : ." vazio. Com o envio agendado seriam TRÊS. O que o paciente
 * lê não pode depender de por onde a clínica clicou.
 *
 * Autorização NÃO mora aqui: cada chamador confere o tenant antes (a rota pelo
 * JWT, o admin pelo número, o agendador porque varre o processo inteiro).
 */
/**
 * A clínica desligou "Cobrar" na configuração do agente.
 *
 * Erro PRÓPRIO porque o tratamento é outro: falha de envio se tenta de novo
 * (o WhatsApp volta), permissão desligada não — insistir é loop garantido.
 */
export class CobrancaDesligadaError extends Error {
  constructor() {
    super("O agente está sem permissão para cobrar (habilidade desligada).");
    this.name = "CobrancaDesligadaError";
  }
}

export class ChargeSender {
  constructor(private readonly d: ChargeSenderDeps) {}

  /**
   * Manda a cobrança e marca "cobrada". Lança se o envio falhar — quem chama
   * decide o que fazer (a rota devolve 502; o agendador adia e tenta de novo).
   * Nada é marcado quando o envio falha: cobrança "cobrada" que nunca chegou
   * some da fila da clínica e o paciente nunca é avisado.
   */
  async send(charge: Charge): Promise<void> {
    const integration = await this.d.integrations.getById(charge.integrationId);
    if (!integration) throw new Error(`integração ${charge.integrationId} não encontrada`);
    const contact = await this.d.contacts.getById(charge.contactId);
    if (!contact) throw new Error("contato da cobrança não encontrado");

    const profile = integration.companyId
      ? await this.d.companyProfiles.getByCompanyId(integration.companyId)
      : null;
    const config = this.d.agentConfigs
      ? await this.d.agentConfigs.getByIntegrationId(integration.id)
      : null;

    // Checado AQUI porque este é o único caminho de envio — painel, `/admin
    // cobrar` e envio agendado passam todos por aqui. Espalhar a checagem pelos
    // chamadores deixaria um deles de fora mais cedo ou mais tarde.
    if (config?.capabilities.cobranca === false) throw new CobrancaDesligadaError();

    const text = montarMensagemCobranca({
      fullName: contact.fullName,
      description: charge.description,
      amount: charge.amount,
      pixType: profile?.pixType,
      pixKey: profile?.pixKey,
      fiscalEnabled: config?.capabilities.fiscal === true,
    });

    await this.d.messaging.sendText({
      to: contact.whatsappNumber,
      text,
      instance: integration.evolutionInstance || undefined,
    });

    const conversation = await this.d.conversations.getOrCreate(integration.id, contact.id, contact.whatsappNumber);
    await this.d.conversations.appendMessage({
      id: randomUUID(),
      conversationId: conversation.id,
      direction: "outbound",
      author: "agent",
      kind: "text",
      body: text,
      mediaUrl: null,
      createdAt: new Date(),
    });

    const now = new Date();
    await this.d.charges.save({ ...charge, status: "cobrada", chargedAt: now, updatedAt: now });
  }
}
