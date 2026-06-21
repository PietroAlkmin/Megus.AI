import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import type { Contact } from "../../../domain/entities/Contact";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { EmissionIntent } from "../../../domain/entities/EmissionIntent";
import type { Integration } from "../../../domain/entities/Integration";
import type { Message } from "../../../domain/entities/Message";
import { ConversationState } from "../../../domain/entities/ConversationState";
import type { Service } from "../../../domain/entities/Service";
import { randomUUID } from "node:crypto";
import type {
  IAgentConfigRepository, IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IIntegrationRepository, IServiceRepository,
} from "../../../domain/ports/repositories";

interface SeedData {
  integrations?: Integration[];
  agentConfigs?: AgentConfig[];
  contacts?: Contact[];
  services?: Service[];
}

export class InMemoryRepositories {
  private _integrations: Integration[] = [];
  private _agentConfigs: AgentConfig[] = [];
  private _contacts: Contact[] = [];
  private _conversations: Conversation[] = [];
  private _messages: Message[] = [];
  private _emissions: EmissionIntent[] = [];
  private _services: Service[] = [];

  seed(data: SeedData): void {
    if (data.integrations) this._integrations.push(...data.integrations);
    if (data.agentConfigs) this._agentConfigs.push(...data.agentConfigs);
    if (data.contacts) this._contacts.push(...data.contacts);
    if (data.services) this._services.push(...data.services);
  }

  integrations: IIntegrationRepository = {
    getByWhatsappNumber: async (n) =>
      this._integrations.find((i) => i.whatsappNumber === n) ?? null,
    getById: async (id) => this._integrations.find((i) => i.id === id) ?? null,
  };

  agentConfigs: IAgentConfigRepository = {
    getByIntegrationId: async (id) =>
      this._agentConfigs.find((a) => a.integrationId === id) ?? null,
  };

  contacts: IContactRepository = {
    findByCpf: async (integrationId, cpf) =>
      this._contacts.find((c) => c.integrationId === integrationId && c.cpf === cpf) ?? null,
    findByWhatsapp: async (integrationId, number) =>
      this._contacts.find((c) => c.integrationId === integrationId && c.whatsappNumber === number) ?? null,
    save: async (contact) => {
      const i = this._contacts.findIndex((c) => c.id === contact.id);
      if (i >= 0) this._contacts[i] = contact;
      else this._contacts.push(contact);
    },
  };

  conversations: IConversationRepository = {
    getOrCreate: async (integrationId, contactId, number) => {
      let conv = this._conversations.find((c) => c.contactId === contactId && c.integrationId === integrationId);
      if (!conv) {
        const now = new Date();
        conv = {
          id: randomUUID(), integrationId, contactId, whatsappNumber: number,
          state: ConversationState.New, humanHandoff: false,
          lastInboundAt: now, createdAt: now, updatedAt: now,
        };
        this._conversations.push(conv);
      }
      return conv;
    },
    save: async (conv) => {
      const i = this._conversations.findIndex((c) => c.id === conv.id);
      if (i >= 0) this._conversations[i] = conv;
      else this._conversations.push(conv);
    },
    appendMessage: async (m) => { this._messages.push(m); },
    getHistory: async (conversationId, limit) =>
      this._messages.filter((m) => m.conversationId === conversationId).slice(-limit),
  };

  emissions: IEmissionIntentRepository = {
    save: async (intent) => {
      const i = this._emissions.findIndex((e) => e.id === intent.id);
      if (i >= 0) this._emissions[i] = intent;
      else this._emissions.push(intent);
    },
    getById: async (id) => this._emissions.find((e) => e.id === id) ?? null,
  };

  services: IServiceRepository = {
    getById: async (id) => this._services.find((s) => s.id === id) ?? null,
    listByIntegration: async (integrationId) =>
      this._services.filter((s) => s.integrationId === integrationId),
  };
}
