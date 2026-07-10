import { Router, type Request, type Response } from "express";
import { ok, fail } from "../result";
import type { AuthContext } from "../authMiddleware";
import type {
  IEmissionIntentRepository,
  IIntegrationRepository,
  CobrancaView,
} from "../../../../domain/ports/repositories";

export interface CobrancasRoutesDeps {
  emissions: IEmissionIntentRepository;
  integrations: IIntegrationRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

// Converte a visão de cobrança do banco (EmissionIntent) para o formato da tela.
// pago = tem paidAt; cobrado = tem chargeSentAt; notaEmitida = status emitido ou tem notaNumber.
function paraTela(r: CobrancaView) {
  return {
    id: r.id,
    nome: r.tomadorName,
    servico: r.description,
    valor: r.amount,
    agendamento: r.appointmentAt ? r.appointmentAt.toISOString() : null,
    pago: r.paidAt != null,
    pagoEm: r.paidAt ? r.paidAt.toISOString() : null,
    notaEmitida: r.status === "emitted" || r.notaNumber != null,
    notaNum: r.notaNumber,
    cobrado: r.chargeSentAt != null,
    cobradoEm: r.chargeSentAt ? r.chargeSentAt.toISOString() : null,
  };
}

function calcularMetricas(clientes: ReturnType<typeof paraTela>[]) {
  const pendentes = clientes.filter((c) => !c.pago);
  return {
    agendados: clientes.length,
    pagos: clientes.filter((c) => c.pago).length,
    pendentes: pendentes.length,
    notasEmitidas: clientes.filter((c) => c.notaEmitida).length,
    aCobrar: pendentes.filter((c) => !c.cobrado).length,
    valorPendente: pendentes.reduce((s, c) => s + c.valor, 0),
  };
}

export function cobrancasRoutes(deps: CobrancasRoutesDeps): Router {
  const r = Router();
  r.use(deps.authMiddleware);

  // GET /api/cobrancas — clientes com status de pagamento/nota/cobrança
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const rows = await deps.emissions.listCobrancasByCompanyId(companyId);
    ok(res, rows.map(paraTela));
  });

  // GET /api/cobrancas/metricas — resumo (pagos, pendentes, a cobrar, etc.)
  r.get("/metricas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const rows = await deps.emissions.listCobrancasByCompanyId(companyId);
    ok(res, calcularMetricas(rows.map(paraTela)));
  });

  // POST /api/cobrancas/:id/cobrar — registra a cobrança (chargeSentAt).
  // O disparo automático da mensagem no WhatsApp ainda não existe — o painel
  // registra o fato; a mensagem em si segue por conta do atendente.
  r.post("/:id/cobrar", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const id = String(req.params.id ?? "");

    const intent = await deps.emissions.getById(id);
    if (intent) {
      const integ = await deps.integrations.getById(intent.integrationId);
      if (!integ || (integ.companyId && integ.companyId !== companyId)) {
        fail(res, "Cobrança não encontrada.", 404, "NOT_FOUND");
        return;
      }
    }
    const quando = new Date();
    const okMark = intent ? await deps.emissions.markCharged(id, quando) : false;
    if (!okMark) {
      fail(res, "Cobrança não encontrada.", 404, "NOT_FOUND");
      return;
    }
    ok(res, { id, cobrado: true, cobradoEm: quando.toISOString() }, "Cobrança registrada.");
  });

  return r;
}
