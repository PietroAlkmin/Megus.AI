import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import type { Contact } from "../../../domain/entities/Contact";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { EmissionIntent } from "../../../domain/entities/EmissionIntent";
import type { Integration } from "../../../domain/entities/Integration";
import type { Message } from "../../../domain/entities/Message";
import { ConversationState } from "../../../domain/entities/ConversationState";
import type { Service } from "../../../domain/entities/Service";
import { randomUUID } from "node:crypto";
import type { User } from "../../../domain/entities/User";
import type { CompanyProfile } from "../../../domain/entities/CompanyProfile";
import type {
  IAgentConfigRepository, IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IIntegrationRepository, IServiceRepository,
  IUserRepository, ICompanyProfileRepository, ICompanyServiceRepository, CompanyServiceItem,
} from "../../../domain/ports/repositories";

interface SeedData {
  integrations?: Integration[];
  agentConfigs?: AgentConfig[];
  contacts?: Contact[];
  services?: Service[];
  users?: User[];
}

export class InMemoryRepositories {
  private _integrations: Integration[] = [];
  private _agentConfigs: AgentConfig[] = [];
  private _contacts: Contact[] = [];
  private _conversations: Conversation[] = [];
  private _messages: Message[] = [];
  private _emissions: EmissionIntent[] = [];
  private _services: Service[] = [];
  private _users: User[] = [];
  private _companyProfiles: CompanyProfile[] = [];
  private _companyServices: CompanyServiceItem[] = [];

  seed(data: SeedData): void {
    if (data.integrations) this._integrations.push(...data.integrations);
    if (data.agentConfigs) this._agentConfigs.push(...data.agentConfigs);
    if (data.contacts) this._contacts.push(...data.contacts);
    if (data.services) this._services.push(...data.services);
    if (data.users) this._users.push(...data.users);
  }

  integrations: IIntegrationRepository = {
    getByWhatsappNumber: async (n) =>
      this._integrations.find((i) => i.whatsappNumber === n) ?? null,
    getById: async (id) => this._integrations.find((i) => i.id === id) ?? null,
    // O in-memory não modela companyId na Integration (só existe no Prisma/Company).
    // Simplificação do piloto: há sempre 1 integração seedada, então devolvemos a
    // primeira. A resolução real por companyId acontece no PrismaIntegrationRepository.
    getFirstByCompanyId: async (_companyId) => this._integrations[0] ?? null,
    // Idem: sem companyId modelado aqui, "a empresa" no in-memory é sempre a única
    // que existe no teste. Se já há alguma integração, devolve a 1ª (nunca duplica);
    // senão cria uma "Padrão" e a guarda em _integrations. A resolução real por
    // companyId (múltiplos tenants) é responsabilidade do PrismaIntegrationRepository.
    ensureDefaultForCompany: async (_companyId) => {
      const existing = this._integrations[0];
      if (existing) return existing;
      const now = new Date();
      const created: Integration = {
        id: "int_" + randomUUID().slice(0, 8),
        displayName: "Padrão",
        whatsappNumber: "",
        fiscalDoc: "",
        fiscalName: "",
        fiscalProviderRef: null,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      this._integrations.push(created);
      return created;
    },
    updateConnection: async (integrationId, evolutionInstance, whatsappNumber) => {
      const i = this._integrations.findIndex((integ) => integ.id === integrationId);
      if (i < 0) return;
      this._integrations[i] = { ...this._integrations[i]!, evolutionInstance, whatsappNumber, updatedAt: new Date() };
    },
  };

  agentConfigs: IAgentConfigRepository = {
    getByIntegrationId: async (id) =>
      this._agentConfigs.find((a) => a.integrationId === id) ?? null,
    save: async (config) => {
      const i = this._agentConfigs.findIndex((a) => a.integrationId === config.integrationId);
      if (i >= 0) this._agentConfigs[i] = config;
      else this._agentConfigs.push(config);
    },
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
    findByWhatsappNumber: async (integrationId, number) =>
      this._conversations.find((c) => c.integrationId === integrationId && c.whatsappNumber === number) ?? null,
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
    listCobrancasByCompanyId: async () => [],
  };

  services: IServiceRepository = {
    getById: async (id) => this._services.find((s) => s.id === id) ?? null,
    listByIntegration: async (integrationId) =>
      this._services.filter((s) => s.integrationId === integrationId),
  };

  users: IUserRepository = {
    findByEmail: async (email) =>
      this._users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null,
    findById: async (id) => this._users.find((u) => u.id === id) ?? null,
    save: async (user) => {
      const i = this._users.findIndex((u) => u.id === user.id);
      if (i >= 0) this._users[i] = user;
      else this._users.push(user);
    },
  };

  companyProfiles: ICompanyProfileRepository = {
    getByCompanyId: async (companyId) =>
      this._companyProfiles.find((p) => p.companyId === companyId) ?? null,
    save: async (profile) => {
      const i = this._companyProfiles.findIndex((p) => p.companyId === profile.companyId);
      if (i >= 0) this._companyProfiles[i] = profile;
      else this._companyProfiles.push(profile);
    },
  };

  companyServices: ICompanyServiceRepository = {
    listByCompanyId: async (companyId) =>
      this._companyServices.filter((s) => s.companyId === companyId),
    getById: async (companyId, id) =>
      this._companyServices.find((s) => s.companyId === companyId && s.id === id) ?? null,
    save: async (service) => {
      const i = this._companyServices.findIndex(
        (s) => s.companyId === service.companyId && s.id === service.id,
      );
      if (i >= 0) this._companyServices[i] = service;
      else this._companyServices.push(service);
    },
    delete: async (companyId, id) => {
      this._companyServices = this._companyServices.filter(
        (s) => !(s.companyId === companyId && s.id === id),
      );
    },
  };
}
