import { prisma } from "./client";
import type { Charge, ChargeStatus } from "../../../domain/entities/Charge";
import type { IChargeRepository } from "../../../domain/ports/repositories";

function toDomain(r: {
  id: string; integrationId: string; contactId: string; serviceId: string | null;
  description: string; amount: number; status: string; calendarEventId: string | null;
  chargedAt: Date | null; paidAt: Date | null; createdAt: Date; updatedAt: Date;
}): Charge {
  return {
    id: r.id, integrationId: r.integrationId, contactId: r.contactId, serviceId: r.serviceId,
    description: r.description, amount: r.amount, status: r.status as ChargeStatus,
    calendarEventId: r.calendarEventId, chargedAt: r.chargedAt, paidAt: r.paidAt,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export class PrismaChargeRepository implements IChargeRepository {
  async save(charge: Charge): Promise<void> {
    await prisma.charge.upsert({
      where: { id: charge.id },
      update: {
        serviceId: charge.serviceId, description: charge.description, amount: charge.amount,
        status: charge.status, calendarEventId: charge.calendarEventId,
        chargedAt: charge.chargedAt, paidAt: charge.paidAt, updatedAt: charge.updatedAt,
      },
      create: {
        id: charge.id, integrationId: charge.integrationId, contactId: charge.contactId,
        serviceId: charge.serviceId, description: charge.description, amount: charge.amount,
        status: charge.status, calendarEventId: charge.calendarEventId,
        chargedAt: charge.chargedAt, paidAt: charge.paidAt,
        createdAt: charge.createdAt, updatedAt: charge.updatedAt,
      },
    });
  }

  async getById(id: string): Promise<Charge | null> {
    const r = await prisma.charge.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }

  // Percorre Integration -> Charge (join por companyId), devolvendo mais novas primeiro.
  async listByCompanyId(companyId: string): Promise<Charge[]> {
    const integrations = await prisma.integration.findMany({
      where: { companyId }, select: { id: true },
    });
    const ids = integrations.map((i: { id: string }) => i.id);
    if (ids.length === 0) return [];

    const rows = await prisma.charge.findMany({
      where: { integrationId: { in: ids } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async findLatestChargeableByContact(integrationId: string, contactId: string): Promise<Charge | null> {
    const r = await prisma.charge.findFirst({
      where: { integrationId, contactId, status: { not: "paga" } },
      orderBy: { createdAt: "desc" },
    });
    return r ? toDomain(r) : null;
  }
}
