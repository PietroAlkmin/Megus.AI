import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma/client";

const PILOT_EMAIL = "piloto@megus.ai";
const PILOT_PASSWORD = "megus123";
// Mesmo tenant que o seedPilot.ts semeia (Company + Integration `int-piloto` + AgentConfig "Kaua").
const PILOT_COMPANY_ID = "co-piloto";

/**
 * Reconcilia o login do piloto (idempotente): garante o usuário `piloto@megus.ai`
 * (senha `megus123`, bcrypt) e a membership em `co-piloto` — que, por ser a mais
 * antiga, é o default do login (PrismaUserRepository ordena por createdAt).
 *
 * NÃO remove memberships em outras empresas: com o seletor de empresas do painel,
 * um usuário pertence a várias — o antigo deleteMany aqui desfaria a cada boot o
 * acesso todos×todas concedido pelo seed da demo.
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

  await prisma.membership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: PILOT_COMPANY_ID } },
    update: {},
    create: { id: randomUUID(), userId: user.id, companyId: PILOT_COMPANY_ID, role: "owner" },
  });
}
