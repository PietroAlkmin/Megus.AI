import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail } from "../result";
import type { AuthContext } from "../authMiddleware";
import type {
  IAgentConfigRepository,
  IIntegrationRepository,
} from "../../../../domain/ports/repositories";
import type { AgentConfig } from "../../../../domain/entities/AgentConfig";

export interface AgenteRoutesDeps {
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Só os campos de PERSONA — capabilities/knowledgeFiles ficam fora do escopo desta rota.
// Persona + capabilities (ações) + knowledgeFiles do agente.
function capabilitiesVazias() {
  return {
    chat: true as const,
    agenda: false,
    agendaLink: null as string | null,
    fiscal: false,
    fiscalDocType: null as ("nfe" | "nfce" | "nfse" | null),
    linkedServiceIds: [] as string[],
  };
}

function personaVazia() {
  return {
    integrationId: null as string | null,
    name: "",
    segment: "",
    tone: "equilibrado" as const,
    emojis: true,
    lang: "pt" as const,
    instructions: "",
    fewShotDialogs: [] as { q: string; a: string }[],
    capabilities: capabilitiesVazias(),
    knowledgeFiles: [] as string[],
  };
}

function personaDe(config: AgentConfig) {
  return {
    integrationId: config.integrationId,
    name: config.name,
    segment: config.segment,
    tone: config.tone,
    emojis: config.emojis,
    lang: config.lang,
    instructions: config.instructions,
    fewShotDialogs: config.fewShotDialogs,
    capabilities: config.capabilities,
    knowledgeFiles: config.knowledgeFiles,
  };
}

const capabilitiesSchema = z.object({
  agenda: z.boolean(),
  agendaLink: z.string().nullable(),
  fiscal: z.boolean(),
  fiscalDocType: z.enum(["nfe", "nfce", "nfse"]).nullable(),
  linkedServiceIds: z.array(z.string()),
});

const personaSchema = z.object({
  name: z.string().min(1, "Informe o nome do agente."),
  segment: z.string().optional().default(""),
  tone: z.enum(["formal", "equilibrado", "descontraido"]),
  emojis: z.boolean(),
  lang: z.enum(["pt", "en", "es"]),
  instructions: z.string().optional().default(""),
  fewShotDialogs: z
    .array(z.object({ q: z.string(), a: z.string() }))
    .optional()
    .default([]),
  // capabilities (ações) — opcional: chamadas antigas sem esse campo continuam válidas.
  capabilities: capabilitiesSchema.optional(),
});

export function agenteRoutes(deps: AgenteRoutesDeps): Router {
  const r = Router();

  // Todas as rotas de agente exigem login — tenant sempre do JWT.
  r.use(deps.authMiddleware);

  // GET /api/agente — persona do agente da 1ª integração da empresa logada
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const integ = await deps.integrations.getFirstByCompanyId(companyId);
    if (!integ) {
      ok(res, personaVazia());
      return;
    }
    const config = await deps.agentConfigs.getByIntegrationId(integ.id);
    if (!config) {
      ok(res, { ...personaVazia(), integrationId: integ.id });
      return;
    }
    ok(res, personaDe(config));
  });

  // PUT /api/agente — salva a persona; PRESERVA capabilities/knowledgeFiles existentes
  r.put("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const parsed = personaSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }

    // Configurar o agente cria a integração "Padrão" se a empresa ainda não tiver
    // nenhuma — a ordem de cadastro (agente x serviço x WhatsApp) não deve importar.
    const integ = await deps.integrations.ensureDefaultForCompany(companyId);

const existing = await deps.agentConfigs.getByIntegrationId(integ.id);
    const now = new Date();
    const { capabilities: capsInput, ...persona } = parsed.data;

    const config: AgentConfig = existing
      ? {
          ...existing,
          ...persona,
          capabilities: capsInput
            ? { chat: true, ...capsInput }
            : existing.capabilities,
          updatedAt: now,
        }
      : {
          id: "ag_" + randomUUID().slice(0, 8),
          integrationId: integ.id,
          ...persona,
          capabilities: capsInput
            ? { chat: true, ...capsInput }
            : capabilitiesVazias(),
          knowledgeFiles: [],
          createdAt: now,
          updatedAt: now,
        };

    await deps.agentConfigs.save(config);
    ok(res, personaDe(config), "Persona do agente salva.");
  });

  return r;
}
