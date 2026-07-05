import { describe, it } from "vitest";
import { assertRepositoryContract } from "./repositoryContract";
import { prisma } from "../src/infrastructure/persistence/prisma/client";
import { PrismaContactRepository } from "../src/infrastructure/persistence/prisma/PrismaContactRepository";
import { PrismaConversationRepository } from "../src/infrastructure/persistence/prisma/PrismaConversationRepository";
import { PrismaEmissionIntentRepository } from "../src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository";
import { PrismaServiceRepository } from "../src/infrastructure/persistence/prisma/PrismaServiceRepository";

describe.skipIf(!process.env.DATABASE_URL)("Prisma — contrato (precisa DATABASE_URL)", () => {
  it("cumpre o contrato contra o banco real (round-trip + IDOR)", async () => {
    // O contrato cria Contact/Conversation/EmissionIntent com integrationId
    // inventado — contra um banco real (FK de verdade), isso estoura violação
    // de FK. seedTenant cria o tenant mínimo (Company + Integration) antes de
    // cada save; cleanup apaga TUDO que o contrato + seedTenant criaram, na
    // ordem de FK, pra não deixar lixo no banco (ex.: piloto em Azure).
    const createdIntegrationIds: string[] = [];
    const createdCompanyIds: string[] = [];

    const seedTenant = async (integrationId: string): Promise<void> => {
      const companyId = "testco_" + integrationId;
      const now = new Date();
      await prisma.company.create({
        data: { id: companyId, name: companyId, fiscalDoc: "00000000000000", fiscalName: companyId, updatedAt: now },
      });
      await prisma.integration.create({
        data: {
          id: integrationId, companyId, displayName: "", whatsappNumber: "", evolutionInstance: "",
          active: true, updatedAt: now,
        },
      });
      createdIntegrationIds.push(integrationId);
      createdCompanyIds.push(companyId);
    };

    const cleanup = async (): Promise<void> => {
      if (createdIntegrationIds.length === 0) return;
      const convs = await prisma.conversation.findMany({
        where: { integrationId: { in: createdIntegrationIds } },
        select: { id: true },
      });
      const convIds = convs.map((c) => c.id);
      await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
      await prisma.conversation.deleteMany({ where: { integrationId: { in: createdIntegrationIds } } });
      await prisma.emissionIntent.deleteMany({ where: { integrationId: { in: createdIntegrationIds } } });
      await prisma.contact.deleteMany({ where: { integrationId: { in: createdIntegrationIds } } });
      await prisma.service.deleteMany({ where: { integrationId: { in: createdIntegrationIds } } });
      await prisma.integration.deleteMany({ where: { id: { in: createdIntegrationIds } } });
      await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
    };

    await assertRepositoryContract(
      {
        contacts: new PrismaContactRepository(),
        conversations: new PrismaConversationRepository(),
        emissions: new PrismaEmissionIntentRepository(),
        services: new PrismaServiceRepository(),
      },
      { seedTenant, cleanup },
    );
  });
});
