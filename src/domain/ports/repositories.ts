import type { AgentConfig } from "../entities/AgentConfig";
import type { Charge } from "../entities/Charge";
import type { Contact } from "../entities/Contact";
import type { Conversation } from "../entities/Conversation";
import type { EmissionIntent } from "../entities/EmissionIntent";
import type { Integration } from "../entities/Integration";
import type { Message } from "../entities/Message";
import type { Service } from "../entities/Service";
import type { User } from "../entities/User";
import type { CompanyProfile } from "../entities/CompanyProfile";

/** Repositórios do banco PRÓPRIO do Megus (Postgres pendente de confirmação de infra). */

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

/** Perfil cadastral + serviços da empresa, isolados por companyId (tenant). */
export interface ICompanyProfileRepository {
  getByCompanyId(companyId: string): Promise<CompanyProfile | null>;
  save(profile: CompanyProfile): Promise<void>;
}

export interface CompanyServiceItem {
  id: string;
  companyId: string;
  code: string;
  description: string;
  issCode: string;
  price: number;
}

export interface CobrancaView {
  id: string;
  tomadorName: string;
  tomadorCpf: string;
  description: string;
  amount: number;
  status: string;
  appointmentAt: Date | null;
  paidAt: Date | null;
  chargeSentAt: Date | null;
  notaNumber: string | null;
  createdAt: Date;
}

export interface IIntegrationRepository {
  getByWhatsappNumber(number: string): Promise<Integration | null>;
  getById(id: string): Promise<Integration | null>;
  /** 1ª integração da empresa (tenant) — usada pra resolver o agente do painel. */
  getFirstByCompanyId(companyId: string): Promise<Integration | null>;
  /** Todas as integrações da empresa — usada pela tela de Atendimentos. */
  listByCompanyId(companyId: string): Promise<Integration[]>;
  ensureDefaultForCompany(companyId: string): Promise<Integration>;
  /**
   * Grava o resultado do pareamento WhatsApp (provisionamento multi-tenant):
   * o nome da instância Evolution e o número real (do ownerJid — nunca de input).
   */
  updateConnection(integrationId: string, evolutionInstance: string, whatsappNumber: string): Promise<void>;
}

export interface IAgentConfigRepository {
  getByIntegrationId(integrationId: string): Promise<AgentConfig | null>;
  save(config: AgentConfig): Promise<void>;
}

export interface IContactRepository {
  findByCpf(integrationId: string, cpfDigits: string): Promise<Contact | null>;
  findByWhatsapp(integrationId: string, number: string): Promise<Contact | null>;
  save(contact: Contact): Promise<void>;
}

export interface IConversationRepository {
  getOrCreate(
    integrationId: string,
    contactId: string,
    number: string,
  ): Promise<Conversation>;
  getById(conversationId: string): Promise<Conversation | null>;
  findByWhatsappNumber(integrationId: string, number: string): Promise<Conversation | null>;
  listByIntegrationId(integrationId: string): Promise<Conversation[]>;
  save(conversation: Conversation): Promise<void>;
  appendMessage(message: Message): Promise<void>;
  getHistory(conversationId: string, limit: number): Promise<Message[]>;
  /** Última mensagem da conversa (preview na lista do painel). */
  getLastMessage(conversationId: string): Promise<Message | null>;
  /** Total de mensagens desde `since` nas integrações dadas (métrica "mensagens hoje"). */
  countMessagesSince(integrationIds: string[], since: Date): Promise<number>;
  /** Apaga TODO o histórico da conversa (comando de teste /reset). */
  deleteMessages(conversationId: string): Promise<void>;
}

export interface IEmissionIntentRepository {
  save(intent: EmissionIntent): Promise<void>;
  getById(id: string): Promise<EmissionIntent | null>;
  /** Lista as emissões de todas as integrações da empresa, como visão de cobrança. */
  listCobrancasByCompanyId(companyId: string): Promise<CobrancaView[]>;
  /** Emissões de uma integração (métrica "notas hoje" por agente). */
  listByIntegrationId(integrationId: string): Promise<CobrancaView[]>;
  /** Registra que a cobrança foi disparada (chargeSentAt). false se a emissão não existe. */
  markCharged(id: string, when: Date): Promise<boolean>;
  /**
   * Apaga os RASCUNHOS de emissão da conversa (draft/ready/failed) — comando de
   * teste /reset. Emissões emitting/emitted são registro fiscal: nunca se apagam.
   */
  deleteUnemittedByConversationId(conversationId: string): Promise<void>;
}

export interface IChargeRepository {
  save(charge: Charge): Promise<void>;
  getById(id: string): Promise<Charge | null>;
  /** Cobranças das integrações da EMPRESA (join Integration.companyId), mais novas primeiro. */
  listByCompanyId(companyId: string): Promise<Charge[]>;
  /** Cobrança "cobrável" mais recente do contato (status != paga) — o gate B marca paga. */
  findLatestChargeableByContact(integrationId: string, contactId: string): Promise<Charge | null>;
}

/** Empresa a que um usuário tem acesso (seletor do painel). */
export interface CompanyRef {
  id: string;
  name: string;
}

/** Vínculos usuário↔empresa (Membership) — base do seletor de empresas. */
export interface IMembershipRepository {
  listCompaniesByUserId(userId: string): Promise<CompanyRef[]>;
  isMember(userId: string, companyId: string): Promise<boolean>;
}

export interface IServiceRepository {
  getById(id: string): Promise<Service | null>;
  listByIntegration(integrationId: string): Promise<Service[]>;
}

export interface ICompanyServiceRepository {
  listByCompanyId(companyId: string): Promise<CompanyServiceItem[]>;
  getById(companyId: string, id: string): Promise<CompanyServiceItem | null>;
  save(service: CompanyServiceItem): Promise<void>;
  delete(companyId: string, id: string): Promise<void>;
}
