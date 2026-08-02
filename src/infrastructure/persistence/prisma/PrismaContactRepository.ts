import { prisma } from "./client";
import type { IContactRepository } from "../../../domain/ports/repositories";
import type { Contact } from "../../../domain/entities/Contact";
import { variantes as variantesTelefone } from "../../../domain/services/telefoneBR";

function toDomain(r: { id: string; integrationId: string; whatsappNumber: string; fullName: string | null; cpf: string | null; cpfNameVerified: boolean; createdAt: Date; updatedAt: Date }): Contact {
  return { id: r.id, integrationId: r.integrationId, whatsappNumber: r.whatsappNumber, fullName: r.fullName, cpf: r.cpf, cpfNameVerified: r.cpfNameVerified, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export class PrismaContactRepository implements IContactRepository {
  async findByCpf(integrationId: string, cpfDigits: string): Promise<Contact | null> {
    const r = await prisma.contact.findFirst({ where: { integrationId, cpf: cpfDigits } });
    return r ? toDomain(r) : null;
  }
  /**
   * Busca TOLERANTE ao nono dígito: o mesmo celular escrito "11 4284-2271"
   * (forma antiga) e "11 94284-2271" (atual) é a mesma pessoa, e comparação
   * exata criava dois cadastros — a cobrança num, a conversa no outro, o gate B
   * sem nada para casar. `variantes` devolve a forma gravada primeiro; o
   * `orderBy` fixa o desempate para não depender da ordem do banco.
   */
  async findByWhatsapp(integrationId: string, number: string): Promise<Contact | null> {
    const formas = variantesTelefone(number);
    if (formas.length === 0) return null;
    const r = await prisma.contact.findFirst({
      where: { integrationId, whatsappNumber: { in: formas } },
      orderBy: { createdAt: "asc" },
    });
    return r ? toDomain(r) : null;
  }
  async getById(id: string): Promise<Contact | null> {
    const r = await prisma.contact.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }
  async listByIntegration(integrationId: string): Promise<Contact[]> {
    const rows = await prisma.contact.findMany({ where: { integrationId } });
    return rows.map(toDomain);
  }
  async save(contact: Contact): Promise<void> {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: { fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, updatedAt: contact.updatedAt },
      create: { id: contact.id, integrationId: contact.integrationId, whatsappNumber: contact.whatsappNumber, fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, createdAt: contact.createdAt, updatedAt: contact.updatedAt },
    });
  }
}
