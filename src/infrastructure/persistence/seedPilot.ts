import { prisma } from "./prisma/client";

// O piloto canônico JÁ existe em prod sob estes ids (decisão do Pietro 05/07:
// reusar o int-piloto configurado, não criar uma empresa nova). co-piloto =
// "Clínica Sorriso Ltda" com o agente "Kaua" (ag-piloto) e os serviços.
const COMPANY_ID = "co-piloto";
const INTEGRATION_ID = "int-piloto";
const SERVICE_ID = "svc-massagem"; // serviço ao qual o AgentConfig "Kaua" está vinculado
const SERVICE_PRICE = 180;

/**
 * Semeia/reconcilia o piloto no banco (idempotente). Mira a integração canônica
 * `int-piloto` por id: a ÚNICA coisa que muda numa re-execução é o whatsappNumber
 * (e evolutionInstance) — para apontar o Kaua ao número real do chip. Não
 * sobrescreve identidade fiscal, serviço nem persona já existentes (update vazio);
 * as branches de `create` só valem num banco novo.
 */
export async function seedPilot(params: { whatsappNumber: string }): Promise<void> {
  const now = new Date();

  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: { id: COMPANY_ID, name: "Clínica Sorriso", fiscalDoc: "66008326000173", fiscalName: "Clínica Sorriso Ltda", updatedAt: now },
  });

  // upsert POR ID evita a colisão do id fixo (o `create` do desenho anterior
  // estourava unique constraint) e atualiza o número do piloto existente.
  await prisma.integration.upsert({
    where: { id: INTEGRATION_ID },
    update: { whatsappNumber: params.whatsappNumber, evolutionInstance: "Megus", updatedAt: now },
    create: { id: INTEGRATION_ID, companyId: COMPANY_ID, displayName: "Kapty (consultório)", whatsappNumber: params.whatsappNumber, evolutionInstance: "Megus", active: true, updatedAt: now },
  });

  await prisma.service.upsert({
    where: { id: SERVICE_ID },
    update: {},
    create: { id: SERVICE_ID, integrationId: INTEGRATION_ID, code: "0107", description: "Massagem", price: SERVICE_PRICE, issCode: "0107" },
  });

  await prisma.agentConfig.upsert({
    where: { integrationId: INTEGRATION_ID },
    update: {},
    create: {
      id: "ag-piloto", integrationId: INTEGRATION_ID, name: "Kaua", segment: "saude",
      tone: "equilibrado", emojis: true, lang: "pt",
      instructions: "Você é o atendente do consultório. Seja cordial e ajude o paciente a emitir a nota fiscal após o pagamento.",
      capabilitiesJson: JSON.stringify({ chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [SERVICE_ID] }),
      knowledgeFilesJson: JSON.stringify([]), fewShotDialogsJson: JSON.stringify([]), updatedAt: now,
    },
  });
}
