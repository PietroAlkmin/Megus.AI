import { Router, type Request, type Response } from "express";
import { ok } from "../result";
import { mockData } from "../mockData";
import type { AuthContext } from "../authMiddleware";
import type {
  IIntegrationRepository,
  IConversationRepository,
  IEmissionIntentRepository,
  IAgentConfigRepository,
} from "../../../../domain/ports/repositories";

export interface AtendimentosRoutesDeps {
  useMock: boolean;
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Monta a lista de "agentes" (uma por integração) com dados reais do banco.
async function agentesReais(deps: AtendimentosRoutesDeps, companyId: string) {
  const integrations = await deps.integrations.listByCompanyId(companyId);
  const agentes = [];
  for (const integ of integrations) {
    const cfg = await deps.agentConfigs.getByIntegrationId(integ.id);
    const conectado = Boolean(integ.whatsappNumber);
    agentes.push({
      id: integ.id,
      nome: cfg?.name ?? "Kaua",
      papel: integ.displayName || "Recepção",
      numero: integ.whatsappNumber || "—",
      segmento: cfg?.segment ?? "Saúde / Clínica",
      doc: "NFS-e",
      // sem agente = "atencao"; sem número = "desconectado"; senão "operando"
      status: !cfg ? "atencao" : !conectado ? "desconectado" : "operando",
      conversas: 0,
      notasHoje: 0,
      resp: "—",
      ultima: "—",
      alerta: !cfg ? "Agente ainda não configurado" : null,
    });
  }
  return agentes;
}

function metricasReais(agentes: Awaited<ReturnType<typeof agentesReais>>) {
  return {
    operando: agentes.filter((a) => a.status === "operando").length,
    total: agentes.length,
    abertas: agentes.reduce((s, a) => s + (a.conversas || 0), 0),
    notasHoje: agentes.reduce((s, a) => s + (a.notasHoje || 0), 0),
    msgsHoje: 0,
    transferencias: 0,
    alertas: agentes.filter((a) => a.alerta).length,
  };
}

export function atendimentosRoutes(deps: AtendimentosRoutesDeps): Router {
  const r = Router();
  r.use(deps.authMiddleware);

  // GET /api/agentes — lista de agentes da empresa logada
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    if (deps.useMock) {
      ok(res, mockData.agentes(companyId));
      return;
    }
    ok(res, await agentesReais(deps, companyId));
  });

  // GET /api/agentes/metricas — métricas agregadas da empresa
  r.get("/metricas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    if (deps.useMock) {
      ok(res, mockData.agentesMetricas(companyId));
      return;
    }
    const agentes = await agentesReais(deps, companyId);
    ok(res, metricasReais(agentes));
  });

  return r;
}