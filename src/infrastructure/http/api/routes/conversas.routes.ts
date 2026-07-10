import { Router, type Request, type Response } from "express";
import { ok, fail } from "../result";
import { ConversationState } from "../../../../domain/entities/ConversationState";
import type { AuthContext } from "../authMiddleware";
import type { Integration } from "../../../../domain/entities/Integration";
import type {
  IConversationRepository,
  IContactRepository,
  IIntegrationRepository,
} from "../../../../domain/ports/repositories";

export interface ConversasRoutesDeps {
  conversations: IConversationRepository;
  contacts: IContactRepository;
  integrations: IIntegrationRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Mapeia o estado da conversa para o rótulo que o front usa.
function statusDe(state: string, humanHandoff: boolean): string {
  if (humanHandoff) return "HUMANO";
  if (state === ConversationState.CollectingIdentity || state === ConversationState.AwaitingComprovante)
    return "AGUARDANDO";
  return "BOT";
}

// A integração pertence ao tenant do token? (companyId ausente = fixture
// in-memory de tenant único — passa; no Prisma o campo SEMPRE vem preenchido.)
function pertenceAoTenant(integ: Integration | null, companyId: string): integ is Integration {
  return integ !== null && (!integ.companyId || integ.companyId === companyId);
}

function nomeAnexo(mediaUrl: string): string {
  return mediaUrl.split("/").pop() || mediaUrl;
}

/**
 * Rotas de Conversas. Cobre dois prefixos:
 *  - GET  /api/agentes/:agentId/conversas   (lista conversas de um agente)
 *  - GET  /api/conversas/:convId/mensagens  (mensagens de uma conversa)
 *  - POST /api/conversas/:convId/assumir    (humano assume: bot cala — SM respeita humanHandoff)
 */
export function createConversasRouters(deps: ConversasRoutesDeps) {
  // Router montado em /api/agentes
  const agentesRouter = Router();
  agentesRouter.use(deps.authMiddleware);

  agentesRouter.get("/:agentId/conversas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const agentId = String(req.params.agentId ?? "");

    const integ = await deps.integrations.getById(agentId);
    if (!pertenceAoTenant(integ, companyId)) {
      fail(res, "Agente não encontrado.", 404, "NOT_FOUND");
      return;
    }

    const convs = await deps.conversations.listByIntegrationId(agentId);
    const lista = [];
    for (const c of convs) {
      const contato = await deps.contacts.findByWhatsapp(c.integrationId, c.whatsappNumber);
      const ultimaMsg = await deps.conversations.getLastMessage(c.id);
      lista.push({
        id: c.id,
        nome: contato?.fullName || c.whatsappNumber,
        telefone: c.whatsappNumber,
        ultima: ultimaMsg ? ultimaMsg.body || (ultimaMsg.mediaUrl ? "📎 anexo" : "") : "",
        hora: c.lastInboundAt ? new Date(c.lastInboundAt).toISOString() : null,
        status: statusDe(c.state, c.humanHandoff),
      });
    }
    ok(res, lista);
  });

  // Router montado em /api/conversas
  const conversasRouter = Router();
  conversasRouter.use(deps.authMiddleware);

  // Carrega a conversa e valida que ela é do tenant (conversa → integração → empresa).
  async function conversaDoTenant(convId: string, companyId: string) {
    const conv = await deps.conversations.getById(convId);
    if (!conv) return null;
    const integ = await deps.integrations.getById(conv.integrationId);
    return pertenceAoTenant(integ, companyId) ? conv : null;
  }

  conversasRouter.get("/:convId/mensagens", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const convId = String(req.params.convId ?? "");

    const conv = await conversaDoTenant(convId, companyId);
    if (!conv) {
      fail(res, "Conversa não encontrada.", 404, "NOT_FOUND");
      return;
    }

    const msgs = await deps.conversations.getHistory(convId, 100);
    ok(res, msgs.map((m) => ({
      id: m.id,
      autor: m.author === "agent" ? "bot" : m.author === "human" ? "humano" : "cliente",
      texto: m.body,
      hora: m.createdAt ? new Date(m.createdAt).toISOString() : null,
      attach: m.mediaUrl ? { type: m.kind, name: nomeAnexo(m.mediaUrl) } : undefined,
    })));
  });

  conversasRouter.post("/:convId/assumir", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const convId = String(req.params.convId ?? "");

    const conv = await conversaDoTenant(convId, companyId);
    if (!conv) {
      fail(res, "Conversa não encontrada.", 404, "NOT_FOUND");
      return;
    }

    // Só o flag: a ConversationStateMachine já cala o bot quando humanHandoff=true.
    conv.humanHandoff = true;
    conv.updatedAt = new Date();
    await deps.conversations.save(conv);
    ok(res, { id: conv.id, status: "HUMANO" }, "Conversa assumida.");
  });

  return { agentesRouter, conversasRouter };
}
