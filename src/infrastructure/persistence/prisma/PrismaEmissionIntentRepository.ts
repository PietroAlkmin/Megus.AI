import { prisma } from "./client";
import type { EmissionIntent, EmissionIntentStatus } from "../../../domain/entities/EmissionIntent";
import type { IEmissionIntentRepository, CobrancaView } from "../../../domain/ports/repositories";

function toDomain(r: {
  id: string; conversationId: string | null; contactId: string | null; integrationId: string; status: string;
  tomadorName: string; tomadorCpf: string; serviceId: string | null; description: string; amount: number;
  paymentVerified: boolean; paymentConfidence: number; fiscalKey: string | null; pdfUrl: string | null;
  createdAt: Date; updatedAt: Date;
}): EmissionIntent {
  return {
    id: r.id, conversationId: r.conversationId ?? "", contactId: r.contactId ?? "", integrationId: r.integrationId,
    status: r.status as EmissionIntentStatus, tomadorName: r.tomadorName, tomadorCpf: r.tomadorCpf,
    serviceId: r.serviceId, description: r.description, amount: r.amount,
    paymentVerified: r.paymentVerified, paymentConfidence: r.paymentConfidence,
    fiscalKey: r.fiscalKey, pdfUrl: r.pdfUrl, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export class PrismaEmissionIntentRepository implements IEmissionIntentRepository {
  async save(i: EmissionIntent): Promise<void> {
    await prisma.emissionIntent.upsert({
      where: { id: i.id },
      update: { status: i.status, serviceId: i.serviceId, description: i.description, amount: i.amount, paymentVerified: i.paymentVerified, paymentConfidence: i.paymentConfidence, fiscalKey: i.fiscalKey, pdfUrl: i.pdfUrl, updatedAt: i.updatedAt },
      create: { id: i.id, conversationId: i.conversationId, contactId: i.contactId, integrationId: i.integrationId, status: i.status, tomadorName: i.tomadorName, tomadorCpf: i.tomadorCpf, serviceId: i.serviceId, description: i.description, amount: i.amount, paymentVerified: i.paymentVerified, paymentConfidence: i.paymentConfidence, fiscalKey: i.fiscalKey, pdfUrl: i.pdfUrl, createdAt: i.createdAt, updatedAt: i.updatedAt },
    });
  }
  async getById(id: string): Promise<EmissionIntent | null> {
    const r = await prisma.emissionIntent.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }

  // Percorre Company -> Integration -> EmissionIntent, devolvendo a visão de cobrança.
  async listCobrancasByCompanyId(companyId: string): Promise<CobrancaView[]> {
    const integrations = await prisma.integration.findMany({
      where: { companyId }, select: { id: true },
    });
    const ids = integrations.map((i: { id: string }) => i.id);
    if (ids.length === 0) return [];

    const rows = await prisma.emissionIntent.findMany({
      where: { integrationId: { in: ids } },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r: {
      id: string; tomadorName: string; tomadorCpf: string; description: string; amount: number;
      status: string; appointmentAt: Date | null; paidAt: Date | null; chargeSentAt: Date | null;
      notaNumber: string | null; createdAt: Date;
    }) => ({
      id: r.id, tomadorName: r.tomadorName, tomadorCpf: r.tomadorCpf, description: r.description,
      amount: r.amount, status: r.status, appointmentAt: r.appointmentAt, paidAt: r.paidAt,
      chargeSentAt: r.chargeSentAt, notaNumber: r.notaNumber, createdAt: r.createdAt,
    }));
  }
}
