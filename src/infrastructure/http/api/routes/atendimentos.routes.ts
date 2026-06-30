import { Router, type Request, type Response } from "express";
import { ok } from "../result";
import { mockData } from "../mockData";
import type { AuthContext } from "../authMiddleware";
import type {
  IIntegrationRepository,
  IConversationRepository,
  IEmissionIntentRepository,
} from "../../../../domain/ports/repositories";

export interface AtendimentosRoutesDeps {
  useMock: boolean;
  integrations: IIntegrationRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
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

    // --- ramo REAL (preparado para quando USE_MOCK_DATA=false) ---
    // Quando houver agentes/integrações de verdade, montar a lista a partir
    // das Integrations da empresa + métricas das Conversations/EmissionIntents.
    // Ex.: const integrations = await deps.integrations.listByCompanyId(companyId);
    // Por ora, sem mock, devolve lista vazia (ainda não há dados reais).
    ok(res, []);
  });

  // GET /api/agentes/metricas — métricas agregadas da empresa
  r.get("/metricas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;

    if (deps.useMock) {
      ok(res, mockData.agentesMetricas(companyId));
      return;
    }

    // --- ramo REAL ---
    // Calcular a partir dos repositórios reais. Estrutura zerada por enquanto.
    ok(res, {
      operando: 0, total: 0, abertas: 0, notasHoje: 0,
      msgsHoje: 0, transferencias: 0, alertas: 0,
    });
  });

  return r;
}