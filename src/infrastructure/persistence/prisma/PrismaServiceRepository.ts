import { prisma } from "./client";
import type { IServiceRepository } from "../../../domain/ports/repositories";
import type { Service } from "../../../domain/entities/Service";

function toDomain(r: { id: string; integrationId: string; code: string; description: string; price: number; issCode: string }): Service {
  return { id: r.id, integrationId: r.integrationId, code: r.code, description: r.description, price: r.price, issCode: r.issCode };
}

export class PrismaServiceRepository implements IServiceRepository {
  async getById(id: string): Promise<Service | null> {
    const r = await prisma.service.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }
  async listByIntegration(integrationId: string): Promise<Service[]> {
    const rows = await prisma.service.findMany({ where: { integrationId } });
    return rows.map(toDomain);
  }
}
