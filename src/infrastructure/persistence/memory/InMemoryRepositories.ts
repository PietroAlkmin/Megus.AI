import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import type { Charge } from "../../../domain/entities/Charge";
import type { Contact } from "../../../domain/entities/Contact";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { EmissionIntent } from "../../../domain/entities/EmissionIntent";
import type { Integration } from "../../../domain/entities/Integration";
import type { Message } from "../../../domain/entities/Message";
import { ConversationState } from "../../../domain/entities/ConversationState";
import type { Service } from "../../../domain/entities/Service";
import { DomainError } from "../../../domain/errors/DomainError";
import { randomUUID } from "node:crypto";
import type { User } from "../../../domain/entities/User";
import type { CompanyProfile } from "../../../domain/entities/CompanyProfile";
import type {
  IAgentConfigRepository, IChargeRepository, IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IIntegrationRepository, IServiceRepository,
  IUserRepository, ICompanyProfileRepository, ICompanyServiceRepository, CompanyServiceItem,
  IMembershipRepository, CompanyRef,
} from "../../../domain/ports/repositories";

interface SeedData {
  integrations?: Integration[];
  agentConfigs?: AgentConfig[];
  contacts?: Contact[];
  services?: Service[];
  users?: User[];
  /** Empresas com nome (seletor) — espelha a tabela Company do banco real. */
  companies?: CompanyRef[];
  /** Vínculos usuário↔empresa extras (além do criado junto com o usuário). */
  memberships?: { userId: string; companyId: string }[];
}

export class InMemoryRepositories {
  private _integrations: Integration[] = [];
  private _agentConfigs: AgentConfig[] = [];
  private _contacts: Contact[] = [];
  private _conversations: Conversation[] = [];
  private _messages: Message[] = [];
  private _emissions: EmissionIntent[] = [];
  private _emissionChargedAt = new Map<string, Date>();
  private _charges: Charge[] = [];
  private _services: Service[] = [];
  private _users: User[] = [];
  private _companyProfiles: CompanyProfile[] = [];
  private _companyServices: CompanyServiceItem[] = [];
  private _companies: CompanyRef[] = [];
  private _memberships: { userId: string; companyId: string; createdAt: Date }[] = [];

  seed(data: SeedData): void {
    if (data.integrations) this._integrations.push(...data.integrations);
    if (data.agentConfigs) this._agentConfigs.push(...data.agentConfigs);
    if (data.contacts) this._contacts.push(...data.contacts);
    if (data.services) this._services.push(...data.services);
    if (data.users) {
      this._users.push(...data.users);
      // espelha o Prisma: usuário nasce com membership na própria empresa
      for (const u of data.users) this.ensureMembership(u.id, u.companyId);
    }
    if (data.companies) this._companies.push(...data.companies);
    if (data.memberships) {
      for (const m of data.memberships) this.ensureMembership(m.userId, m.companyId);
    }
  }

  private ensureMembership(userId: string, companyId: string): void {
    if (!this._memberships.some((m) => m.userId === userId && m.companyId === companyId)) {
      this._memberships.push({ userId, companyId, createdAt: new Date(this._memberships.length) });
    }
  }

  private companyName(companyId: string): string {
    return (
      this._companies.find((c) => c.id === companyId)?.name ??
      this._companyProfiles.find((p) => p.companyId === companyId)?.name ??
      "Minha empresa"
    );
  }

  integrations: IIntegrationRepository = {
    getByWhatsappNumber: async (n) =>
      this._integrations.find((i) => i.whatsappNumber === n) ?? null,
    getById: async (id) => this._integrations.find((i) => i.id === id) ?? null,

    // Integrações sem companyId (fixtures antigas) são visíveis a qualquer tenant;
    // quando o campo existe, o filtro é estrito — igual ao Prisma.
    getFirstByCompanyId: async (companyId) =>
      this._integrations.find((i) => !i.companyId || i.companyId === companyId) ?? null,
    listByCompanyId: async (companyId) =>
      this._integrations.filter((i) => !i.companyId || i.companyId === companyId),
    ensureDefaultForCompany: async (companyId) => {
      const existing = this._integrations.find((i) => !i.companyId || i.companyId === companyId);
      if (existing) return existing;
      const now = new Date();
      const created: Integration = {
        id: "int_" + randomUUID().slice(0, 8),
        companyId,
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
    getById: async (conversationId) =>
      this._conversations.find((c) => c.id === conversationId) ?? null,
    findByWhatsappNumber: async (integrationId, number) =>
      this._conversations.find((c) => c.integrationId === integrationId && c.whatsappNumber === number) ?? null,
    save: async (conv) => {
      const i = this._conversations.findIndex((c) => c.id === conv.id);
      if (i >= 0) this._conversations[i] = conv;
      else this._conversations.push(conv);
    },

    listByIntegrationId: async (integrationId) =>
      this._conversations.filter((c) => c.integrationId === integrationId),

    appendMessage: async (m) => { this._messages.push(m); },
    getHistory: async (conversationId, limit) =>
      this._messages.filter((m) => m.conversationId === conversationId).slice(-limit),
    getLastMessage: async (conversationId) =>
      this._messages.filter((m) => m.conversationId === conversationId).at(-1) ?? null,
    countMessagesSince: async (integrationIds, since) => {
      const convIds = new Set(
        this._conversations.filter((c) => integrationIds.includes(c.integrationId)).map((c) => c.id),
      );
      return this._messages.filter((m) => convIds.has(m.conversationId) && m.createdAt >= since).length;
    },
    deleteMessages: async (conversationId) => {
      this._messages = this._messages.filter((m) => m.conversationId !== conversationId);
    },
  };

  emissions: IEmissionIntentRepository = {
    save: async (intent) => {
      const i = this._emissions.findIndex((e) => e.id === intent.id);
      if (i >= 0) this._emissions[i] = intent;
      else this._emissions.push(intent);
    },
    getById: async (id) => this._emissions.find((e) => e.id === id) ?? null,
    listCobrancasByCompanyId: async (companyId) => {
      const ids = this._integrations
        .filter((i) => !i.companyId || i.companyId === companyId)
        .map((i) => i.id);
      return this._emissions
        .filter((e) => ids.includes(e.integrationId))
        .map((e) => this.toCobrancaView(e));
    },
    listByIntegrationId: async (integrationId) =>
      this._emissions.filter((e) => e.integrationId === integrationId).map((e) => this.toCobrancaView(e)),
    markCharged: async (id, when) => {
      if (!this._emissions.some((e) => e.id === id)) return false;
      this._emissionChargedAt.set(id, when);
      return true;
    },
    deleteUnemittedByConversationId: async (conversationId) => {
      this._emissions = this._emissions.filter(
        (e) => e.conversationId !== conversationId || e.status === "emitting" || e.status === "emitted",
      );
    },
  };

  charges: IChargeRepository = {
    save: async (charge) => {
      const i = this._charges.findIndex((c) => c.id === charge.id);
      if (i >= 0) this._charges[i] = charge;
      else this._charges.push(charge);
    },
    getById: async (id) => this._charges.find((c) => c.id === id) ?? null,
    listByCompanyId: async (companyId) => {
      const ids = this._integrations.filter((i) => i.companyId === companyId).map((i) => i.id);
      return this._charges
        .filter((c) => ids.includes(c.integrationId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    findLatestChargeableByContact: async (integrationId, contactId) => {
      const cobraveis = this._charges
        .filter((c) => c.integrationId === integrationId && c.contactId === contactId && c.status !== "paga")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return cobraveis[0] ?? null;
    },
  };

  // A entidade de domínio EmissionIntent não carrega os campos de agenda/cobrança
  // (appointmentAt/paidAt/notaNumber vivem só no banco); no in-memory a visão
  // devolve null neles — o front condiciona a renderização, não inventa valor.
  private toCobrancaView(e: EmissionIntent) {
    return {
      id: e.id, tomadorName: e.tomadorName, tomadorCpf: e.tomadorCpf, description: e.description,
      amount: e.amount, status: e.status, appointmentAt: null, paidAt: null,
      chargeSentAt: this._emissionChargedAt.get(e.id) ?? null, notaNumber: null, createdAt: e.createdAt,
    };
  }

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
      else {
        this._users.push(user);
        // espelha o Prisma: usuário novo ganha membership (e a empresa, se inédita)
        this.ensureMembership(user.id, user.companyId);
        if (!this._companies.some((c) => c.id === user.companyId)) {
          this._companies.push({
            id: user.companyId,
            name: user.displayName ? `Empresa de ${user.displayName}` : "Minha empresa",
          });
        }
      }
    },
  };

  memberships: IMembershipRepository = {
    listCompaniesByUserId: async (userId) =>
      this._memberships
        .filter((m) => m.userId === userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((m) => ({ id: m.companyId, name: this.companyName(m.companyId) })),
    isMember: async (userId, companyId) =>
      this._memberships.some((m) => m.userId === userId && m.companyId === companyId),
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
      // paridade com o Prisma (id é único global): id de OUTRA empresa não é
      // atualizável nem "adotável" — mesmo contrato do isolamento de tenant.
      const deOutraEmpresa = this._companyServices.some(
        (s) => s.id === service.id && s.companyId !== service.companyId,
      );
      if (deOutraEmpresa) throw new DomainError("Serviço não encontrado.", "NOT_FOUND");
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
