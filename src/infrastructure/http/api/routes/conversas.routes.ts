import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ok, fail } from "../result";
import { mockData } from "../mockData";
import type { AuthContext } from "../authMiddleware";
import type { IConversationRepository } from "../../../../domain/ports/repositories";
import type { IMessagingProvider } from "../../../../domain/ports/IMessagingProvider";

export interface ConversasRoutesDeps {
  useMock: boolean;
  conversations: IConversationRepository;
  messaging: IMessagingProvider;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

function statusDe(state: string, humanHandoff: boolean): string {
  if (humanHandoff) return "HUMANO";
  if (state === "waiting" || state === "aguardando") return "AGUARDANDO";
  return "BOT";
}

// Monta o nome da instância Evolution do tenant a partir da integração.
function instanceOf(integrationId: string): string {
  return `megus-int_${integrationId}`;
}

/**
 * Rotas de Conversas:
 *  - GET  /api/agentes/:agentId/conversas    lista conversas do agente
 *  - GET  /api/conversas/:convId/mensagens   histórico
 *  - POST /api/conversas/:convId/assumir     humano assume (humanHandoff=true, bot calado)
 *  - POST /api/conversas/:convId/retomar     devolve ao bot (humanHandoff=false)
 *  - POST /api/conversas/:convId/enviar      envia mensagem pelo WhatsApp (humano)
 */
export function createConversasRouters(deps: ConversasRoutesDeps) {
  const agentesRouter = Router();
  agentesRouter.use(deps.authMiddleware);

  agentesRouter.get("/:agentId/conversas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const agentId = String(req.params.agentId ?? "");
    if (deps.useMock) {
      ok(res, mockData.conversas(companyId, agentId));
      return;
    }
    const convs = await deps.conversations.listByIntegrationId(agentId);
    ok(res, convs.map((c) => ({
      id: c.id,
      nome: c.whatsappNumber,
      telefone: c.whatsappNumber,
      ultima: "",
      hora: c.lastInboundAt ? new Date(c.lastInboundAt).toISOString() : null,
      status: statusDe(c.state, c.humanHandoff),
      humanHandoff: c.humanHandoff,
      naoLidas: 0,
    })));
  });

  const conversasRouter = Router();
  conversasRouter.use(deps.authMiddleware);

  conversasRouter.get("/:convId/mensagens", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const convId = String(req.params.convId ?? "");
    if (deps.useMock) {
      ok(res, mockData.mensagens(companyId, convId));
      return;
    }
    const msgs = await deps.conversations.getHistory(convId, 100);
    ok(res, msgs.map((m) => ({
      id: m.id,
      autor: m.author === "agent" ? "bot" : m.author === "human" ? "humano" : "cliente",
      texto: m.body,
      hora: m.createdAt ? new Date(m.createdAt).toISOString() : null,
      attach: m.mediaUrl ? { type: m.kind, name: m.mediaUrl } : undefined,
    })));
  });

  // Assumir: marca humanHandoff=true (o cérebro já fica calado — ver ConversationStateMachine).
  conversasRouter.post("/:convId/assumir", async (req: Request, res: Response) => {
    const convId = String(req.params.convId ?? "");
    const conv = await deps.conversations.getById(convId);
    if (!conv) { fail(res, "Conversa não encontrada.", 404, "NOT_FOUND"); return; }
    conv.humanHandoff = true;
    conv.updatedAt = new Date();
    await deps.conversations.save(conv);
    ok(res, { id: convId, status: "HUMANO", humanHandoff: true }, "Você assumiu a conversa.");
  });

  // Retomar: devolve ao bot (humanHandoff=false).
  conversasRouter.post("/:convId/retomar", async (req: Request, res: Response) => {
    const convId = String(req.params.convId ?? "");
    const conv = await deps.conversations.getById(convId);
    if (!conv) { fail(res, "Conversa não encontrada.", 404, "NOT_FOUND"); return; }
    conv.humanHandoff = false;
    conv.updatedAt = new Date();
    await deps.conversations.save(conv);
    ok(res, { id: convId, status: "BOT", humanHandoff: false }, "Bot retomou a conversa.");
  });

  // Enviar: humano manda mensagem pelo WhatsApp. Só quando a conversa está assumida.
  conversasRouter.post("/:convId/enviar", async (req: Request, res: Response) => {
    const convId = String(req.params.convId ?? "");
    const texto = String((req.body?.texto ?? "")).trim();
    if (!texto) { fail(res, "Mensagem vazia.", 400, "VALIDATION"); return; }

    const conv = await deps.conversations.getById(convId);
    if (!conv) { fail(res, "Conversa não encontrada.", 404, "NOT_FOUND"); return; }
    if (!conv.humanHandoff) {
      fail(res, "Assuma a conversa antes de enviar mensagens.", 409, "NOT_ASSUMED");
      return;
    }

    // envia pelo WhatsApp (Evolution). Se a conexão estiver instável, isto pode falhar —
    // a mensagem só é registrada se o envio não lançar.
    try {
      await deps.messaging.sendText({
        to: conv.whatsappNumber,
        text: texto,
        instance: instanceOf(conv.integrationId),
      });
    } catch (e) {
      fail(res, "Não foi possível enviar pelo WhatsApp. Verifique a conexão.", 502, "SEND_FAILED");
      return;
    }

    // registra a mensagem como "human" no histórico
    const now = new Date();
    await deps.conversations.appendMessage({
      id: "msg_" + randomUUID().slice(0, 8),
      conversationId: convId,
      direction: "outbound",
      author: "human",
      kind: "text",
      body: texto,
      mediaUrl: null,
      createdAt: now,
    });
    ok(res, { id: convId, enviado: true }, "Mensagem enviada.");
  });

  return { agentesRouter, conversasRouter };
}