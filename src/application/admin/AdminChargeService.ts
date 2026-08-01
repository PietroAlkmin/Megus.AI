import type { IChargeRepository, IContactRepository, IIntegrationRepository } from "../../domain/ports/repositories";
import type { ChargeSender } from "../charges/ChargeSender";

export interface AdminChargeRow { id: string; name: string; amount: number; status: string; }

/**
 * `/admin cobranças` e `/admin cobrar N` — a clínica opera pelo WhatsApp.
 *
 * O ENVIO em si é do ChargeSender: aqui havia uma segunda redação da mensagem
 * de cobrança, já divergindo da do painel (escrevia "Pix : ." quando a empresa
 * não tinha chave cadastrada). O que o paciente lê não pode depender de por
 * onde a clínica pediu.
 */
export class AdminChargeService {
  constructor(private readonly d: { charges: IChargeRepository; contacts: IContactRepository; integrations: IIntegrationRepository; sender: ChargeSender }) {}
  async list(companyId: string): Promise<AdminChargeRow[]> {
    const charges = await this.d.charges.listByCompanyId(companyId);
    return Promise.all(charges.filter((c) => c.status !== "paga").map(async (c) => ({ id: c.id, name: (await this.d.contacts.getById(c.contactId))?.fullName ?? "Paciente", amount: c.amount, status: c.status })));
  }
  async send(companyId: string, chargeId: string): Promise<boolean> {
    const charge = await this.d.charges.getById(chargeId); if (!charge || charge.status === "paga") return false;
    const integration = await this.d.integrations.getById(charge.integrationId); if (!integration || integration.companyId !== companyId) return false;
    // Cobrar na mão desmarca o agendamento — senão o laço mandaria de novo na hora marcada.
    await this.d.sender.send({ ...charge, scheduledFor: null });
    return true;
  }
}
