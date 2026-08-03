import { prisma } from "./client";
import type { IContactRepository } from "../../../domain/ports/repositories";
import type { Contact } from "../../../domain/entities/Contact";
import { variantes as variantesTelefone } from "../../../domain/services/telefoneBR";

/** Ficha sem nenhum campo vira `null` no banco (ausência visível, não `"{}"`). */
function gravarFicha(ficha: Contact["ficha"]): string | null {
  return ficha && Object.keys(ficha).length > 0 ? JSON.stringify(ficha) : null;
}

/** JSON inválido no banco não pode derrubar a conversa — vira ficha vazia. */
function lerFicha(json: string | null | undefined): Contact["ficha"] {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function toDomain(r: { id: string; integrationId: string; whatsappNumber: string; fullName: string | null; cpf: string | null; cpfNameVerified: boolean; fichaJson?: string | null; createdAt: Date; updatedAt: Date }): Contact {
  return { id: r.id, integrationId: r.integrationId, whatsappNumber: r.whatsappNumber, fullName: r.fullName, cpf: r.cpf, cpfNameVerified: r.cpfNameVerified, ficha: lerFicha(r.fichaJson), createdAt: r.createdAt, updatedAt: r.updatedAt };
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
      // Ficha vazia grava `null`, não `"{}"`: no banco a ausência tem que ser
      // visível, senão "não perguntamos" e "perguntamos e não veio" viram iguais.
      update: { fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, fichaJson: gravarFicha(contact.ficha), updatedAt: contact.updatedAt },
      create: { id: contact.id, integrationId: contact.integrationId, whatsappNumber: contact.whatsappNumber, fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, fichaJson: gravarFicha(contact.ficha), createdAt: contact.createdAt, updatedAt: contact.updatedAt },
    });
  }
}
