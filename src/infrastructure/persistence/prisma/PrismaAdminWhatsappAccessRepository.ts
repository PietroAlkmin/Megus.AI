import { prisma } from "./client";
import type { IAdminWhatsappAccessRepository } from "../../../domain/ports/repositories";

export class PrismaAdminWhatsappAccessRepository implements IAdminWhatsappAccessRepository {
  async isAdmin(companyId: string, whatsappNumber: string): Promise<boolean> {
    const row = await prisma.adminWhatsappAccess.findUnique({
      where: { companyId_whatsappNumber: { companyId, whatsappNumber } },
      select: { active: true },
    });
    return row?.active === true;
  }
}
