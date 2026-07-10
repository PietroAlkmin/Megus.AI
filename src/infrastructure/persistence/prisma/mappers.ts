import type { Integration } from "../../../domain/entities/Integration";
import type { AgentConfig, AgentCapabilities } from "../../../domain/entities/AgentConfig";

export function integrationToDomain(
  integ: { id: string; companyId: string; displayName: string; whatsappNumber: string; evolutionInstance: string; active: boolean; createdAt: Date; updatedAt: Date },
  company: { fiscalDoc: string; fiscalName: string; fiscalProviderRef: string | null },
): Integration {
  return {
    id: integ.id,
    companyId: integ.companyId,
    displayName: integ.displayName,
    whatsappNumber: integ.whatsappNumber,
    evolutionInstance: integ.evolutionInstance,
    fiscalDoc: company.fiscalDoc,
    fiscalName: company.fiscalName,
    fiscalProviderRef: company.fiscalProviderRef ?? null,
    active: integ.active,
    createdAt: integ.createdAt,
    updatedAt: integ.updatedAt,
  };
}

export function agentConfigToDomain(row: {
  id: string; integrationId: string; name: string; segment: string; tone: string;
  emojis: boolean; lang: string; instructions: string;
  capabilitiesJson: string; knowledgeFilesJson: string; fewShotDialogsJson: string;
  createdAt: Date; updatedAt: Date;
}): AgentConfig {
  return {
    id: row.id,
    integrationId: row.integrationId,
    name: row.name,
    segment: row.segment,
    tone: row.tone as AgentConfig["tone"],
    emojis: row.emojis,
    lang: row.lang as AgentConfig["lang"],
    instructions: row.instructions,
    capabilities: JSON.parse(row.capabilitiesJson) as AgentCapabilities,
    knowledgeFiles: JSON.parse(row.knowledgeFilesJson) as string[],
    fewShotDialogs: JSON.parse(row.fewShotDialogsJson) as { q: string; a: string }[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
