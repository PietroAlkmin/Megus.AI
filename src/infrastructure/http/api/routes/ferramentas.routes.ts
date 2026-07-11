import { Router, type Request, type Response } from "express";
import { ok, fail } from "../result";
import type { AuthContext } from "../authMiddleware";
import { GOOGLECALENDAR_TOOLKIT_SLUG, type ComposioConnectOps } from "../../../tools/composio/ComposioAgentToolsProvider";

export interface FerramentasRoutesDeps {
  /** Ops de conexão Composio (Fase B). `undefined` = recurso desligado (sem COMPOSIO_API_KEY). */
  connectOps?: ComposioConnectOps;
  /** Auth Config id do Google Calendar no Composio (dashboard). `undefined` = /conectar fica 503. */
  gcalAuthConfigId?: string;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

/**
 * Conexão de ferramentas dinâmicas por empresa (Fase B — hoje só agenda/Google
 * Calendar via Composio; catálogo agnóstico deixa espaço pra outras ferramentas
 * no futuro sem mudar o formato da rota). Tenant SEMPRE do JWT (mesmo padrão de
 * `whatsapp.routes.ts`) — nunca de parâmetro de rota ou corpo da requisição.
 */
export function ferramentasRoutes(deps: FerramentasRoutesDeps): Router {
  const r = Router();

  // Toda rota de ferramentas exige login — tenant sempre do JWT.
  r.use(deps.authMiddleware);

  // POST /api/agente/ferramentas/agenda/conectar — inicia o OAuth da empresa logada
  r.post("/agenda/conectar", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;

    if (!deps.connectOps || !deps.gcalAuthConfigId) {
      fail(res, "Agenda indisponível no momento.", 503, "TOOLS_UNAVAILABLE");
      return;
    }

    const { redirectUrl } = await deps.connectOps.initiate(companyId, deps.gcalAuthConfigId);
    if (!redirectUrl) {
      fail(res, "Não foi possível iniciar a conexão.", 502, "TOOLS_CONNECT_FAILED");
      return;
    }
    ok(res, { url: redirectUrl });
  });

  // GET /api/agente/ferramentas/agenda/status — conectado? Rota de LEITURA/informativa:
  // igual ao resto do caminho Composio no cérebro, nunca devolve 5xx — indisponibilidade
  // (sem provider configurado OU falha transiente na API) sempre vira conectado:false.
  r.get("/agenda/status", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;

    if (!deps.connectOps) {
      ok(res, { conectado: false });
      return;
    }

    try {
      const activeCount = await deps.connectOps.listActive(companyId, GOOGLECALENDAR_TOOLKIT_SLUG);
      ok(res, { conectado: activeCount > 0 });
    } catch (err) {
      console.warn(`[ferramentas] status da agenda indisponível p/ empresa ${companyId}:`, err instanceof Error ? err.message : err);
      ok(res, { conectado: false });
    }
  });

  return r;
}
