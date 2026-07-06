import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import type { IIntegrationRepository } from "../../../domain/ports/repositories";
import type { Integration } from "../../../domain/entities/Integration";
import { integrationToDomain } from "./mappers";

export class PrismaIntegrationRepository implements IIntegrationRepository {
  async getByWhatsappNumber(number: string): Promise<Integration | null> {
    const r = await prisma.integration.findFirst({ where: { whatsappNumber: number }, include: { Company: true } });
    return r ? integrationToDomain(r, r.Company) : null;
  }
  async getById(id: string): Promise<Integration | null> {
    const r = await prisma.integration.findUnique({ where: { id }, include: { Company: true } });
    return r ? integrationToDomain(r, r.Company) : null;
  }

  async getFirstByCompanyId(companyId: string): Promise<Integration | null> {
    const r = await prisma.integration.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      include: { Company: true },
    });
    return r ? integrationToDomain(r, r.Company) : null;
  }

  /**
   * 1ª integração da empresa OU cria uma "Padrão" (mesmo padrão de
   * ensureDefaultIntegration em PrismaCompanyServiceRepository). A Company já
   * existe — quem chama isto é sempre um usuário logado com companyId no JWT.
   */
  async ensureDefaultForCompany(companyId: string): Promise<Integration> {
    const existing = await prisma.integration.findFirst({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      include: { Company: true },
    });
    if (existing) return integrationToDomain(existing, existing.Company);

    const id = "int_" + randomUUID().slice(0, 8);
    const created = await prisma.integration.create({
      data: {
        id,
        companyId,
        displayName: "Padrão",
        whatsappNumber: "",
        evolutionInstance: "",
        active: true,
        updatedAt: new Date(),
      },
      include: { Company: true },
    });
    return integrationToDomain(created, created.Company);
  }

  async updateConnection(integrationId: string, evolutionInstance: string, whatsappNumber: string): Promise<void> {
    await prisma.integration.update({
      where: { id: integrationId },
      data: { evolutionInstance, whatsappNumber, updatedAt: new Date() },
    });
  }
}
