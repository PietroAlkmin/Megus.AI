import { prisma } from "./client";
import type { CompanyRef, IMembershipRepository } from "../../../domain/ports/repositories";

/**
 * Vínculos usuário↔empresa via tabela Membership (JOIN Company pro nome).
 * Ordena por createdAt: a 1ª membership (a "própria" empresa do usuário) vem
 * primeiro — mesmo critério do default de login no PrismaUserRepository.
 */
export class PrismaMembershipRepository implements IMembershipRepository {
  async listCompaniesByUserId(userId: string): Promise<CompanyRef[]> {
    const rows = await prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { Company: { select: { id: true, name: true } } },
    });
    return rows.map((r: { Company: { id: string; name: string } }) => ({
      id: r.Company.id,
      name: r.Company.name,
    }));
  }

  async isMember(userId: string, companyId: string): Promise<boolean> {
    const row = await prisma.membership.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { id: true },
    });
    return row !== null;
  }
}
