import { prisma } from "./client";
import type { Charge, ChargeStatus } from "../../../domain/entities/Charge";
import type { IChargeRepository } from "../../../domain/ports/repositories";

function toDomain(r: {
  id: string; integrationId: string; contactId: string; serviceId: string | null;
  description: string; amount: number; status: string; calendarEventId: string | null;
  chargedAt: Date | null; paidAt: Date | null; createdAt: Date; updatedAt: Date;
  notaSolicitada?: boolean | null; notaEmitidaEm?: Date | null; scheduledFor?: Date | null;
  paymentRef?: string | null; paidBy?: string | null;
}): Charge {
  return {
    id: r.id, integrationId: r.integrationId, contactId: r.contactId, serviceId: r.serviceId,
    description: r.description, amount: r.amount, status: r.status as ChargeStatus,
    calendarEventId: r.calendarEventId, chargedAt: r.chargedAt, paidAt: r.paidAt,
    scheduledFor: r.scheduledFor ?? null,
    paymentRef: r.paymentRef ?? null, paidBy: r.paidBy ?? null,
    notaSolicitada: r.notaSolicitada ?? null, notaEmitidaEm: r.notaEmitidaEm ?? null,
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
        chargedAt: charge.chargedAt, paidAt: charge.paidAt, scheduledFor: charge.scheduledFor,
        paymentRef: charge.paymentRef, paidBy: charge.paidBy,
        notaSolicitada: charge.notaSolicitada, notaEmitidaEm: charge.notaEmitidaEm,
        updatedAt: charge.updatedAt,
      },
      create: {
        id: charge.id, integrationId: charge.integrationId, contactId: charge.contactId,
        serviceId: charge.serviceId, description: charge.description, amount: charge.amount,
        status: charge.status, calendarEventId: charge.calendarEventId,
        chargedAt: charge.chargedAt, paidAt: charge.paidAt, scheduledFor: charge.scheduledFor,
        paymentRef: charge.paymentRef, paidBy: charge.paidBy,
        notaSolicitada: charge.notaSolicitada, notaEmitidaEm: charge.notaEmitidaEm,
        createdAt: charge.createdAt, updatedAt: charge.updatedAt,
      },
    });
  }

  async getById(id: string): Promise<Charge | null> {
    const r = await prisma.charge.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }
  async findByCalendarEventId(integrationId: string, calendarEventId: string): Promise<Charge | null> {
    const r = await prisma.charge.findFirst({ where: { integrationId, calendarEventId } });
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

  async listChargeableByContact(integrationId: string, contactId: string): Promise<Charge[]> {
    const rows = await prisma.charge.findMany({
      where: { integrationId, contactId, status: { not: "paga" } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  // Só "pendente": cobrança já disparada na mão (cobrada) ou paga não deve sair
  // de novo pelo agendamento — o disparo manual vence o combinado.
  async listDueScheduled(now: Date): Promise<Charge[]> {
    const rows = await prisma.charge.findMany({
      where: { status: "pendente", scheduledFor: { not: null, lte: now } },
      orderBy: { scheduledFor: "asc" },
    });
    return rows.map(toDomain);
  }

  // Escopo é a INTEGRAÇÃO, não o contato: o mesmo comprovante reenviado por
  // outro número (ou depois de o cadastro duplicar) não pode quitar de novo.
  async findByPaymentRef(integrationId: string, paymentRef: string): Promise<Charge | null> {
    const r = await prisma.charge.findFirst({ where: { integrationId, paymentRef } });
    return r ? toDomain(r) : null;
  }

  async findLatestChargeableByContact(integrationId: string, contactId: string): Promise<Charge | null> {
    const r = await prisma.charge.findFirst({
      where: { integrationId, contactId, status: { not: "paga" } },
      orderBy: { createdAt: "desc" },
    });
    return r ? toDomain(r) : null;
  }
}
