import { randomUUID } from "node:crypto";
import type { IMessagingProvider } from "../../domain/ports/IMessagingProvider";
import type { IAgentConfigRepository, IChargeRepository, ICompanyProfileRepository, IContactRepository, IConversationRepository, IIntegrationRepository } from "../../domain/ports/repositories";

export interface AdminChargeRow { id: string; name: string; amount: number; status: string; }

export class AdminChargeService {
  constructor(private readonly d: { charges: IChargeRepository; contacts: IContactRepository; integrations: IIntegrationRepository; configs: IAgentConfigRepository; profiles: ICompanyProfileRepository; conversations: IConversationRepository; messaging: IMessagingProvider }) {}
  async list(companyId: string): Promise<AdminChargeRow[]> {
    const charges = await this.d.charges.listByCompanyId(companyId);
    return Promise.all(charges.filter((c) => c.status !== "paga").map(async (c) => ({ id: c.id, name: (await this.d.contacts.getById(c.contactId))?.fullName ?? "Paciente", amount: c.amount, status: c.status })));
  }
  async send(companyId: string, chargeId: string): Promise<boolean> {
    const charge = await this.d.charges.getById(chargeId); if (!charge || charge.status === "paga") return false;
    const integration = await this.d.integrations.getById(charge.integrationId); if (!integration || integration.companyId !== companyId) return false;
    const contact = await this.d.contacts.getById(charge.contactId); if (!contact) return false;
    const [profile, config] = await Promise.all([this.d.profiles.getByCompanyId(companyId), this.d.configs.getByIntegrationId(integration.id)]);
    const pix = profile?.pixKey ? `\n\nPix${profile.pixType ? ` (${profile.pixType})` : ""}: ${profile.pixKey}.` : "";
    const fiscal = config?.capabilities.fiscal === true;
    const first = contact.fullName?.trim().split(/\s+/)[0];
    const text = `${first ? `Olá, ${first}!` : "Olá!"} Passando para combinar o pagamento da sua ${charge.description}: R$ ${charge.amount.toFixed(2).replace(".", ",")}.${pix}\n\nDepois é só me enviar o comprovante por aqui para eu ${fiscal ? "emitir sua nota fiscal" : "confirmar o pagamento"}. 😊`;
    await this.d.messaging.sendText({ to: contact.whatsappNumber, instance: integration.evolutionInstance || undefined, text });
    const conv = await this.d.conversations.getOrCreate(integration.id, contact.id, contact.whatsappNumber);
    await this.d.conversations.appendMessage({ id: randomUUID(), conversationId: conv.id, direction: "outbound", author: "agent", kind: "text", body: text, mediaUrl: null, createdAt: new Date() });
    await this.d.charges.save({ ...charge, status: "cobrada", chargedAt: new Date(), updatedAt: new Date() });
    return true;
  }
}
