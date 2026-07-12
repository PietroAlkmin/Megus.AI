import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ok, fail } from "../result";
import { ConversationState } from "../../../../domain/entities/ConversationState";
import type { AuthContext } from "../authMiddleware";
import type { Integration } from "../../../../domain/entities/Integration";
import type { IMessagingProvider } from "../../../../domain/ports/IMessagingProvider";
import type {
  IConversationRepository,
  IContactRepository,
  IIntegrationRepository,
} from "../../../../domain/ports/repositories";

export interface ConversasRoutesDeps {
  conversations: IConversationRepository;
  contacts: IContactRepository;
  integrations: IIntegrationRepository;
  /** Envio humano pelo WhatsApp (rota /enviar). Ausente = a rota responde 503 (ex.: testes sem messaging). */
  messaging?: IMessagingProvider;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Mapeia o estado da conversa para o rótulo que o front usa.
function statusDe(state: string, humanHandoff: boolean): string {
  if (humanHandoff) return "HUMANO";
  if (state === ConversationState.CollectingIdentity || state === ConversationState.AwaitingComprovante)
    return "AGUARDANDO";
  return "BOT";
}

// A integração pertence ao tenant do token? Comparação ESTRITA por companyId —
// sem bypass: uma integração com companyId vazio NÃO é "de todo mundo" (isso
// abriria acesso cross-tenant). Fixtures de teste devem trazer o companyId real.
function pertenceAoTenant(integ: Integration | null, companyId: string): integ is Integration {
  return integ !== null && integ.companyId === companyId;
}

function nomeAnexo(mediaUrl: string): string {
  return mediaUrl.split("/").pop() || mediaUrl;
}

/**
 * Rotas de Conversas. Cobre dois prefixos:
 *  - GET  /api/agentes/:agentId/conversas   (lista conversas de um agente)
 *  - GET  /api/conversas/:convId/mensagens  (mensagens de uma conversa)
 *  - POST /api/conversas/:convId/assumir    (humano assume: bot cala — SM respeita humanHandoff)
 *  - POST /api/conversas/:convId/retomar    (devolve ao bot — humanHandoff=false)
 *  - POST /api/conversas/:convId/enviar     (humano manda WhatsApp; só com a conversa assumida)
 *
 * TODAS passam pelo tenant do JWT (conversa → integração → companyId, comparação
 * estrita). As rotas retomar/enviar vieram do feat/integracao e foram re-baseadas
 * aqui por cima do check — a versão original nasceu de uma base sem o hardening.
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
        // O front do assumir/retomar (feat/integracao) decide o botão por este flag.
        humanHandoff: c.humanHandoff,
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
    ok(res, { id: conv.id, status: "HUMANO", humanHandoff: true }, "Você assumiu a conversa.");
  });

  // Retomar: devolve a conversa ao bot (humanHandoff=false).
  conversasRouter.post("/:convId/retomar", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const convId = String(req.params.convId ?? "");

    const conv = await conversaDoTenant(convId, companyId);
    if (!conv) {
      fail(res, "Conversa não encontrada.", 404, "NOT_FOUND");
      return;
    }

    conv.humanHandoff = false;
    conv.updatedAt = new Date();
    await deps.conversations.save(conv);
    ok(res, { id: conv.id, status: "BOT", humanHandoff: false }, "Bot retomou a conversa.");
  });

  // Enviar: humano manda mensagem pelo WhatsApp — só com a conversa ASSUMIDA
  // (409 NOT_ASSUMED caso contrário; defesa que já veio do feat/integracao).
  conversasRouter.post("/:convId/enviar", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const convId = String(req.params.convId ?? "");
    const texto = String((req.body?.texto ?? "")).trim();
    if (!texto) { fail(res, "Mensagem vazia.", 400, "VALIDATION"); return; }

    if (!deps.messaging) {
      fail(res, "Envio indisponível no momento.", 503, "SEND_UNAVAILABLE");
      return;
    }

    const conv = await conversaDoTenant(convId, companyId);
    if (!conv) {
      fail(res, "Conversa não encontrada.", 404, "NOT_FOUND");
      return;
    }
    if (!conv.humanHandoff) {
      fail(res, "Assuma a conversa antes de enviar mensagens.", 409, "NOT_ASSUMED");
      return;
    }

    // Instância REAL do tenant (persistida no pareamento) — nunca um nome fabricado:
    // a original derivava "megus-int_<id>", que não existe pro piloto ("Megus").
    const integ = await deps.integrations.getById(conv.integrationId);
    const instance = integ?.evolutionInstance || undefined;

    try {
      await deps.messaging.sendText({ to: conv.whatsappNumber, text: texto, instance });
    } catch {
      fail(res, "Não foi possível enviar pelo WhatsApp. Verifique a conexão.", 502, "SEND_FAILED");
      return;
    }

    // Registra como "human" no histórico — o cérebro vê a fala do atendente.
    await deps.conversations.appendMessage({
      id: randomUUID(),
      conversationId: convId,
      direction: "outbound",
      author: "human",
      kind: "text",
      body: texto,
      mediaUrl: null,
      createdAt: new Date(),
    });
    ok(res, { id: conv.id, enviado: true }, "Mensagem enviada.");
  });

  return { agentesRouter, conversasRouter };
}
