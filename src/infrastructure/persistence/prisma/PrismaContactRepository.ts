import { prisma } from "./client";
import type { IContactRepository } from "../../../domain/ports/repositories";
import type { Contact } from "../../../domain/entities/Contact";

function toDomain(r: { id: string; integrationId: string; whatsappNumber: string; fullName: string | null; cpf: string | null; cpfNameVerified: boolean; createdAt: Date; updatedAt: Date }): Contact {
  return { id: r.id, integrationId: r.integrationId, whatsappNumber: r.whatsappNumber, fullName: r.fullName, cpf: r.cpf, cpfNameVerified: r.cpfNameVerified, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export class PrismaContactRepository implements IContactRepository {
  async findByCpf(integrationId: string, cpfDigits: string): Promise<Contact | null> {
    const r = await prisma.contact.findFirst({ where: { integrationId, cpf: cpfDigits } });
    return r ? toDomain(r) : null;
  }
  async findByWhatsapp(integrationId: string, number: string): Promise<Contact | null> {
    const r = await prisma.contact.findFirst({ where: { integrationId, whatsappNumber: number } });
    return r ? toDomain(r) : null;
  }
  async save(contact: Contact): Promise<void> {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: { fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, updatedAt: contact.updatedAt },
      create: { id: contact.id, integrationId: contact.integrationId, whatsappNumber: contact.whatsappNumber, fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, createdAt: contact.createdAt, updatedAt: contact.updatedAt },
    });
  }
}
