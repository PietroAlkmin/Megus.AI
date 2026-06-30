import { Router, type Request, type Response } from "express";
import { ok } from "../result";
import { mockData } from "../mockData";
import type { AuthContext } from "../authMiddleware";
import type { IConversationRepository } from "../../../../domain/ports/repositories";

export interface ConversasRoutesDeps {
  useMock: boolean;
  conversations: IConversationRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

/**
 * Rotas de Conversas. Cobre dois prefixos:
 *  - GET  /api/agentes/:agentId/conversas   (lista conversas de um agente)
 *  - GET  /api/conversas/:convId/mensagens  (mensagens de uma conversa)
 *  - POST /api/conversas/:convId/assumir    (passa de bot para humano)
 *
 * Por isso retornamos DOIS routers em createConversasRouters(), montados nos
 * dois prefixos no app.ts.
 */
export function createConversasRouters(deps: ConversasRoutesDeps) {
  // Router montado em /api/agentes
  const agentesRouter = Router();
  agentesRouter.use(deps.authMiddleware);

  agentesRouter.get("/:agentId/conversas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const agentId = String(req.params.agentId ?? "");

    if (deps.useMock) {
      ok(res, mockData.conversas(companyId, agentId));
      return;
    }
    // --- ramo REAL: listar Conversations do agente filtradas por companyId ---
    ok(res, []);
  });

  // Router montado em /api/conversas
  const conversasRouter = Router();
  conversasRouter.use(deps.authMiddleware);

  conversasRouter.get("/:convId/mensagens", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const convId = String(req.params.convId ?? "");

    if (deps.useMock) {
      ok(res, mockData.mensagens(companyId, convId));
      return;
    }
    // --- ramo REAL: listar Messages da conversa ---
    ok(res, []);
  });

  conversasRouter.post("/:convId/assumir", async (req: Request, res: Response) => {
    const convId = String(req.params.convId ?? "");
    // Mock e real: por ora apenas confirma. No real, marca a conversa como HUMANO.
    ok(res, { id: convId, status: "HUMANO" }, "Conversa assumida.");
  });

  return { agentesRouter, conversasRouter };
  
}