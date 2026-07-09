import { Router, type Request, type Response } from "express";
import { ok } from "../result";
import { mockData } from "../mockData";
import type { AuthContext } from "../authMiddleware";
import type {
  IConversationRepository,
  IEmissionIntentRepository,
} from "../../../../domain/ports/repositories";

export interface CobrancasRoutesDeps {
  useMock: boolean;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

interface ClienteCobranca {
  id: string; nome: string; valor: number;
  pago: boolean; notaEmitida: boolean; cobrado: boolean;
}

// Cálculo das métricas a partir da lista — serve para mock e real.
function calcularMetricas(clientes: ClienteCobranca[]) {
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

// Converte a visão de cobrança do banco (EmissionIntent) para o formato da tela.
// pago = tem paidAt; cobrado = tem chargeSentAt; notaEmitida = status emitido ou tem notaNumber.
async function cobrancasReais(
  emissions: IEmissionIntentRepository,
  companyId: string,
): Promise<ClienteCobranca[]> {
  const rows = await emissions.listCobrancasByCompanyId(companyId);
  return rows.map((r) => ({
    id: r.id,
    nome: r.tomadorName,
    telefone: "",
    servico: r.description,
    valor: r.amount,
    agendamento: r.appointmentAt ? r.appointmentAt.toISOString() : null,
    pago: r.paidAt != null,
    pagoEm: r.paidAt ? r.paidAt.toISOString() : null,
    notaEmitida: r.status === "emitted" || r.notaNumber != null,
    notaNum: r.notaNumber,
    cobrado: r.chargeSentAt != null,
    cobradoEm: r.chargeSentAt ? r.chargeSentAt.toISOString() : null,
  })) as unknown as ClienteCobranca[];
}

export function cobrancasRoutes(deps: CobrancasRoutesDeps): Router {
  const r = Router();
  r.use(deps.authMiddleware);

  // GET /api/cobrancas — clientes com status de pagamento/nota/cobrança
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    if (deps.useMock) {
      ok(res, mockData.cobrancasClientes(companyId));
      return;
    }
// --- ramo REAL: emissões da empresa vindas do banco ---
    ok(res, await cobrancasReais(deps.emissions, companyId));
  });

  // GET /api/cobrancas/metricas — resumo (pagos, pendentes, a cobrar, etc.)
  r.get("/metricas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const clientes = deps.useMock
      ? (mockData.cobrancasClientes(companyId) as ClienteCobranca[])
      : await cobrancasReais(deps.emissions, companyId);
    ok(res, calcularMetricas(clientes));
  });

  // POST /api/cobrancas/:id/cobrar — dispara a cobrança via WhatsApp (Kaua)
  r.post("/:id/cobrar", async (req: Request, res: Response) => {
    const id = String(req.params.id ?? "");
    // No real: enfileira o envio da mensagem de cobrança ao cliente.
    ok(res, { id, cobrado: true, cobradoEm: "agora" }, "Cobrança enviada.");
  });

  return r;
}