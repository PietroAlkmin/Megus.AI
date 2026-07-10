import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import { DomainError } from "../../../domain/errors/DomainError";
import type { ICompanyServiceRepository, CompanyServiceItem } from "../../../domain/ports/repositories";

/**
 * Repositório de serviços usando Prisma (tabela Service real).
 *
 * No Azure, Service liga a Integration (não a Company direto). Como a tela de
 * Empresa trata "serviços da empresa" como lista simples, este repositório
 * garante uma Integration PADRÃO por empresa: se a empresa ainda não tem
 * integração, cria uma base e pendura os serviços nela. Quando o WhatsApp real
 * for configurado, essa integração já existe.
 *
 * Nomes alinhados ao Azure: code, description, issCode, price.
 */
export class PrismaCompanyServiceRepository implements ICompanyServiceRepository {
  // Garante (e retorna) o id da Integration padrão da empresa.
  private async ensureDefaultIntegration(companyId: string): Promise<string> {
    const existing = await prisma.integration.findFirst({ where: { companyId } });
    if (existing) return existing.id;

    const id = "int_" + randomUUID().slice(0, 8);
    await prisma.integration.create({
      data: {
        id,
        companyId,
        displayName: "Padrão",
        whatsappNumber: "",
        evolutionInstance: "",
        active: true,
        updatedAt: new Date(),
      },
    });
    return id;
  }

  async listByCompanyId(companyId: string): Promise<CompanyServiceItem[]> {
    // serviços de todas as integrações da empresa
    const integrations = await prisma.integration.findMany({ where: { companyId }, select: { id: true } });
    const ids = integrations.map((i: { id: string }) => i.id);
    if (ids.length === 0) return [];

    const services = await prisma.service.findMany({ where: { integrationId: { in: ids } } });
    return services.map((s: { id: string; code: string; description: string; issCode: string; price: number }) => ({
      id: s.id,
      companyId,
      code: s.code,
      description: s.description,
      issCode: s.issCode,
      price: s.price,
    }));
  }

  async getById(companyId: string, id: string): Promise<CompanyServiceItem | null> {
    const s = await prisma.service.findUnique({ where: { id } });
    if (!s) return null;
    // confirma que pertence a uma integração desta empresa (isolamento de tenant)
    const integ = await prisma.integration.findFirst({ where: { id: s.integrationId, companyId } });
    if (!integ) return null;
    return { id: s.id, companyId, code: s.code, description: s.description, issCode: s.issCode, price: s.price };
  }

  async save(service: CompanyServiceItem): Promise<void> {
    const existing = await prisma.service.findUnique({ where: { id: service.id } });

    if (existing) {
      // id já existe: só o DONO atualiza — sem isso, um tenant que conheça o id
      // sobrescreveria preço/código de serviço de OUTRA empresa (dado fiscal).
      const integ = await prisma.integration.findFirst({
        where: { id: existing.integrationId, companyId: service.companyId },
      });
      if (!integ) throw new DomainError("Serviço não encontrado.", "NOT_FOUND");

      await prisma.service.update({
        where: { id: service.id },
        data: {
          code: service.code,
          description: service.description,
          issCode: service.issCode,
          price: service.price,
        },
      });
      return;
    }

    const integrationId = await this.ensureDefaultIntegration(service.companyId);
    await prisma.service.create({
      data: {
        id: service.id,
        integrationId,
        code: service.code,
        description: service.description,
        issCode: service.issCode,
        price: service.price,
      },
    });
  }

  async delete(companyId: string, id: string): Promise<void> {
    // só apaga se pertencer a uma integração desta empresa
    const s = await prisma.service.findUnique({ where: { id } });
    if (!s) return;
    const integ = await prisma.integration.findFirst({ where: { id: s.integrationId, companyId } });
    if (!integ) return;
    await prisma.service.delete({ where: { id } });
  }
}