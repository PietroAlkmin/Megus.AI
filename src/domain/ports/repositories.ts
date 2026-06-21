import type { AgentConfig } from "../entities/AgentConfig";
import type { Contact } from "../entities/Contact";
import type { Conversation } from "../entities/Conversation";
import type { EmissionIntent } from "../entities/EmissionIntent";
import type { Integration } from "../entities/Integration";
import type { Message } from "../entities/Message";
import type { Service } from "../entities/Service";

/** Repositórios do banco PRÓPRIO do Megus (Postgres pendente de confirmação de infra). */

export interface IIntegrationRepository {
  getByWhatsappNumber(number: string): Promise<Integration | null>;
  getById(id: string): Promise<Integration | null>;
}

export interface IAgentConfigRepository {
  getByIntegrationId(integrationId: string): Promise<AgentConfig | null>;
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
  save(conversation: Conversation): Promise<void>;
  appendMessage(message: Message): Promise<void>;
  getHistory(conversationId: string, limit: number): Promise<Message[]>;
}

export interface IEmissionIntentRepository {
  save(intent: EmissionIntent): Promise<void>;
  getById(id: string): Promise<EmissionIntent | null>;
}

export interface IServiceRepository {
  getById(id: string): Promise<Service | null>;
  listByIntegration(integrationId: string): Promise<Service[]>;
}
