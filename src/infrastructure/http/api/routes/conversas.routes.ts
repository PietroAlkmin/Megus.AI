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

// Mapeia o estado da conversa para o rótulo que o front usa.
function statusDe(state: string, humanHandoff: boolean): string {
  if (humanHandoff) return "HUMANO";
  if (state === "waiting" || state === "aguardando") return "AGUARDANDO";
  return "BOT";
}

/**
 * Rotas de Conversas. Cobre dois prefixos:
 *  - GET  /api/agentes/:agentId/conversas   (lista conversas de um agente)
 *  - GET  /api/conversas/:convId/mensagens  (mensagens de uma conversa)
 *  - POST /api/conversas/:convId/assumir    (passa de bot para humano)
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
    // --- ramo REAL: conversas da integração (agentId = integrationId) ---
    const convs = await deps.conversations.listByIntegrationId(agentId);
    ok(res, convs.map((c) => ({
      id: c.id,
      nome: c.whatsappNumber, // sem contato resolvido, mostra o número
      telefone: c.whatsappNumber,
      ultima: "",
      hora: c.lastInboundAt ? new Date(c.lastInboundAt).toISOString() : null,
      status: statusDe(c.state, c.humanHandoff),
      naoLidas: 0,
    })));
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
    // --- ramo REAL: histórico de mensagens da conversa ---
    const msgs = await deps.conversations.getHistory(convId, 100);
    ok(res, msgs.map((m) => ({
      id: m.id,
      autor: m.author === "agent" ? "bot" : m.author === "human" ? "humano" : "cliente",
      texto: m.body,
      hora: m.createdAt ? new Date(m.createdAt).toISOString() : null,
      attach: m.mediaUrl ? { type: m.kind, name: m.mediaUrl } : undefined,
    })));
  });

  conversasRouter.post("/:convId/assumir", async (req: Request, res: Response) => {
    const convId = String(req.params.convId ?? "");
    // No real, marcaria humanHandoff=true; por ora confirma (a ação de humano é feita à parte).
    ok(res, { id: convId, status: "HUMANO" }, "Conversa assumida.");
  });

  return { agentesRouter, conversasRouter };
}