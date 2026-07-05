import { prisma } from "./client";
import type { IAgentConfigRepository } from "../../../domain/ports/repositories";
import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import { agentConfigToDomain } from "./mappers";

export class PrismaAgentConfigRepository implements IAgentConfigRepository {
  async getByIntegrationId(integrationId: string): Promise<AgentConfig | null> {
    const r = await prisma.agentConfig.findUnique({ where: { integrationId } });
    return r ? agentConfigToDomain(r) : null;
  }
}
