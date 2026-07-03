import { prisma } from "./client";
import type { ICompanyProfileRepository } from "../../../domain/ports/repositories";
import type { CompanyProfile } from "../../../domain/entities/CompanyProfile";

/**
 * Repositório de perfil da empresa usando Prisma (tabela Company real).
 * Como a entidade agora usa os MESMOS nomes do Azure, não há tradução:
 * cada campo do domínio corresponde 1:1 à coluna da Company.
 */
export class PrismaCompanyProfileRepository implements ICompanyProfileRepository {
  async getByCompanyId(companyId: string): Promise<CompanyProfile | null> {
    const c = await prisma.company.findUnique({ where: { id: companyId } });
    if (!c) return null;
    return {
      companyId: c.id,
      name: c.name ?? "",
      fiscalName: c.fiscalName ?? "",
      fiscalDoc: c.fiscalDoc ?? "",
      municipalRegistration: c.municipalRegistration ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      zip: c.zip ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      pixType: c.pixType ?? "cnpj",
      pixKey: c.pixKey ?? "",
      paymentInstructions: c.paymentInstructions ?? "",
      updatedAt: c.updatedAt,
    };
  }

  async save(p: CompanyProfile): Promise<void> {
    const dados = {
      name: p.name,
      fiscalName: p.fiscalName,
      fiscalDoc: p.fiscalDoc,
      municipalRegistration: p.municipalRegistration || null,
      email: p.email || null,
      phone: p.phone || null,
      zip: p.zip || null,
      address: p.address || null,
      city: p.city || null,
      state: p.state || null,
      pixType: p.pixType || null,
      pixKey: p.pixKey || null,
      paymentInstructions: p.paymentInstructions || null,
      updatedAt: new Date(),
    };
    await prisma.company.upsert({
      where: { id: p.companyId },
      update: dados,
      create: { id: p.companyId, active: true, ...dados },
    });
  }
}