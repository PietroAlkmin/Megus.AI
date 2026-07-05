import { prisma } from "./prisma/client";

const COMPANY_ID = "company-piloto";
const SERVICE_PRICE = 180;

/**
 * Semeia o piloto no banco (idempotente). Reusa a Integration existente da
 * empresa (a "Padrão" criada pelo PrismaCompanyServiceRepository) em vez de
 * duplicar — só ajusta o whatsappNumber/evolutionInstance p/ o número real.
 */
export async function seedPilot(params: { whatsappNumber: string }): Promise<void> {
  const now = new Date();
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: { id: COMPANY_ID, name: "Kapty (consultório)", fiscalDoc: "66008326000173", fiscalName: "Kapty (consultório)", updatedAt: now },
  });

  let integ = await prisma.integration.findFirst({ where: { companyId: COMPANY_ID } });
  if (!integ) {
    integ = await prisma.integration.create({
      data: { id: "int-piloto", companyId: COMPANY_ID, displayName: "Kapty (consultório)", whatsappNumber: params.whatsappNumber, evolutionInstance: "Megus", active: true, updatedAt: now },
    });
  } else {
    integ = await prisma.integration.update({ where: { id: integ.id }, data: { whatsappNumber: params.whatsappNumber, evolutionInstance: "Megus", updatedAt: now } });
  }

  const svcId = "svc-massagem-" + integ.id;
  await prisma.service.upsert({
    where: { id: svcId },
    update: { price: SERVICE_PRICE },
    create: { id: svcId, integrationId: integ.id, code: "0107", description: "Massagem", price: SERVICE_PRICE, issCode: "0107" },
  });

  await prisma.agentConfig.upsert({
    where: { integrationId: integ.id },
    update: {},
    create: {
      id: "ag-piloto-" + integ.id, integrationId: integ.id, name: "Kaua", segment: "saude",
      tone: "equilibrado", emojis: true, lang: "pt",
      instructions: "Você é o atendente do consultório. Seja cordial e ajude o paciente a emitir a nota fiscal após o pagamento.",
      capabilitiesJson: JSON.stringify({ chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [svcId] }),
      knowledgeFilesJson: JSON.stringify([]), fewShotDialogsJson: JSON.stringify([]), updatedAt: now,
    },
  });
}
