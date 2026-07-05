import { describe, it } from "vitest";
import { assertRepositoryContract } from "./repositoryContract";
import { PrismaContactRepository } from "../src/infrastructure/persistence/prisma/PrismaContactRepository";
import { PrismaConversationRepository } from "../src/infrastructure/persistence/prisma/PrismaConversationRepository";
import { PrismaEmissionIntentRepository } from "../src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository";
import { PrismaServiceRepository } from "../src/infrastructure/persistence/prisma/PrismaServiceRepository";

describe.skipIf(!process.env.DATABASE_URL)("Prisma — contrato (precisa DATABASE_URL)", () => {
  it("cumpre o contrato contra o banco real (round-trip + IDOR)", async () => {
    await assertRepositoryContract({
      contacts: new PrismaContactRepository(),
      conversations: new PrismaConversationRepository(),
      emissions: new PrismaEmissionIntentRepository(),
      services: new PrismaServiceRepository(),
    });
  });
});
