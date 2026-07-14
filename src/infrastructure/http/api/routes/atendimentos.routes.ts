import { Router, type Request, type Response } from "express";
import { ok } from "../result";
import { startOfTodaySaoPaulo } from "../time";
import { ConversationState } from "../../../../domain/entities/ConversationState";
import type { AuthContext } from "../authMiddleware";
import type {
  IIntegrationRepository,
  IConversationRepository,
  IEmissionIntentRepository,
  IAgentConfigRepository,
} from "../../../../domain/ports/repositories";

import { startOfMonthSaoPaulo } from "../time";

export interface AtendimentosRoutesDeps {
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Monta a lista de "agentes" (um por integração) com dados reais do banco.
// Campos sem fonte real (tempo de resposta, não-lidas) NÃO existem no payload —
// o painel omite o que o backend não mede (regra: nada de placeholder).
async function agentesReais(deps: AtendimentosRoutesDeps, companyId: string) {
  const inicioMes = startOfMonthSaoPaulo();
  const integrations = await deps.integrations.listByCompanyId(companyId);
  const agentes = [];
  for (const integ of integrations) {
    const cfg = await deps.agentConfigs.getByIntegrationId(integ.id);
    const convs = await deps.conversations.listByIntegrationId(integ.id);
    const abertas = convs.filter((c) => c.state !== ConversationState.Done);
    const aguardandoHumano = abertas.filter((c) => c.humanHandoff).length;
    const emissoes = await deps.emissions.listByIntegrationId(integ.id);
    const notasMes = emissoes.filter(
      (e) => (e.status === "emitted" || e.notaNumber != null) && e.createdAt >= inicioMes,
    ).length;

    const conectado = Boolean(integ.whatsappNumber);
    agentes.push({
      id: integ.id,
      nome: cfg?.name ?? null,
      papel: integ.displayName || "Recepção",
      numero: integ.whatsappNumber || null,
      segmento: cfg?.segment ?? null,
      // sem agente = "atencao"; sem número = "desconectado"; senão "operando"
      status: !cfg ? "atencao" : !conectado ? "desconectado" : "operando",
      conversas: abertas.length,
      notasMes,
      aguardandoHumano,
      alerta: !cfg
        ? "Agente ainda não configurado"
        : aguardandoHumano > 0
          ? `${aguardandoHumano} conversa${aguardandoHumano > 1 ? "s" : ""} aguardando atendimento humano`
          : null,
    });
  }
  return agentes;
}

export function atendimentosRoutes(deps: AtendimentosRoutesDeps): Router {
  const r = Router();
  r.use(deps.authMiddleware);

  // GET /api/agentes — lista de agentes da empresa logada
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    ok(res, await agentesReais(deps, companyId));
  });

  // GET /api/agentes/metricas — métricas agregadas da empresa (tudo medido do banco)
  r.get("/metricas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const agentes = await agentesReais(deps, companyId);
    const integrationIds = agentes.map((a) => a.id);
    const msgsMes = await deps.conversations.countMessagesSince(integrationIds, startOfMonthSaoPaulo());
    ok(res, {
      operando: agentes.filter((a) => a.status === "operando").length,
      total: agentes.length,
      abertas: agentes.reduce((s, a) => s + a.conversas, 0),
      notasMes: agentes.reduce((s, a) => s + a.notasMes, 0),
      msgsMes,
      transferencias: agentes.reduce((s, a) => s + a.aguardandoHumano, 0),
      alertas: agentes.filter((a) => a.alerta).length,
    });
  });

  return r;
}
