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
}
