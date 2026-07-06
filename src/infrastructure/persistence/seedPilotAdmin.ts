import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma/client";

const PILOT_EMAIL = "piloto@megus.ai";
const PILOT_PASSWORD = "megus123";
// Mesmo tenant que o seedPilot.ts semeia (Company + Integration `int-piloto` + AgentConfig "Kaua").
const PILOT_COMPANY_ID = "co-piloto";

/**
 * Reconcilia o login do piloto (idempotente): garante o usuário `piloto@megus.ai`
 * (senha `megus123`, bcrypt) e que ele tenha EXATAMENTE uma membership — a de
 * `co-piloto`. Memberships em outras empresas (resquício de execuções antigas
 * do seed, ex.: `company-piloto`) são removidas, para que o login resolva
 * companyId=co-piloto de forma determinística e o painel enxergue a
 * integração/agente do piloto (int-piloto/Kaua).
 */
export async function seedPilotAdmin(): Promise<void> {
  const now = new Date();
  const passwordHash = await bcrypt.hash(PILOT_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: PILOT_EMAIL },
    update: { passwordHash, updatedAt: now },
    create: {
      id: randomUUID(),
      name: "Piloto Megus",
      email: PILOT_EMAIL,
      passwordHash,
      updatedAt: now,
    },
  });

  // Remove qualquer membership em empresa que NÃO seja a do piloto — garante
  // EXATAMENTE uma membership por usuário.
  await prisma.membership.deleteMany({
    where: { userId: user.id, companyId: { not: PILOT_COMPANY_ID } },
  });

  await prisma.membership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: PILOT_COMPANY_ID } },
    update: {},
    create: { id: randomUUID(), userId: user.id, companyId: PILOT_COMPANY_ID, role: "owner" },
  });
}
