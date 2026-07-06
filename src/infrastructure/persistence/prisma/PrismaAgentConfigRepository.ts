import { prisma } from "./client";
import type { IAgentConfigRepository } from "../../../domain/ports/repositories";
import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import { agentConfigToDomain } from "./mappers";

export class PrismaAgentConfigRepository implements IAgentConfigRepository {
  async getByIntegrationId(integrationId: string): Promise<AgentConfig | null> {
    const r = await prisma.agentConfig.findUnique({ where: { integrationId } });
    return r ? agentConfigToDomain(r) : null;
  }

  async save(config: AgentConfig): Promise<void> {
    const data = {
      name: config.name,
      segment: config.segment,
      tone: config.tone,
      emojis: config.emojis,
      lang: config.lang,
      instructions: config.instructions,
      capabilitiesJson: JSON.stringify(config.capabilities),
      knowledgeFilesJson: JSON.stringify(config.knowledgeFiles),
      fewShotDialogsJson: JSON.stringify(config.fewShotDialogs),
      updatedAt: new Date(),
    };
    await prisma.agentConfig.upsert({
      where: { integrationId: config.integrationId },
      update: data,
      create: { id: config.id, integrationId: config.integrationId, ...data },
    });
  }
}
