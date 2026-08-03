import { Router, type Request, type Response } from "express";
import { ok, fail } from "../result";
import type { ChargeSender } from "../../../../application/charges/ChargeSender";
import { formatar as formatarTelefone } from "../../../../domain/services/telefoneBR";
import type { AuthContext } from "../authMiddleware";
import type {
  IEmissionIntentRepository,
  IIntegrationRepository,
  IChargeRepository,
  IContactRepository,
  IConversationRepository,
  ICompanyProfileRepository,
  IAgentConfigRepository,
  CobrancaView,
} from "../../../../domain/ports/repositories";
import type { Charge } from "../../../../domain/entities/Charge";
import type { Contact } from "../../../../domain/entities/Contact";
import type { IMessagingProvider } from "../../../../domain/ports/IMessagingProvider";

export interface CobrancasRoutesDeps {
  emissions: IEmissionIntentRepository;
  integrations: IIntegrationRepository;
  charges: IChargeRepository;
  contacts: IContactRepository;
  conversations: IConversationRepository;
  companyProfiles: ICompanyProfileRepository;
  /** Configuração do agente define se a cobrança pode mencionar fluxo fiscal. */
  agentConfigs?: IAgentConfigRepository;
  /** Envio de WhatsApp da cobrança proativa (Task 4). Ausente = a rota de charge fica indisponível (503) — ex.: testes de outras rotas que não passam messaging. */
  messaging?: IMessagingProvider;
  /** Disparo da cobrança — o MESMO usado pelo `/admin cobrar` e pelo envio agendado. */
  sender?: ChargeSender;
  authMiddleware: (req: Request, res: Response, next: () => void) => void;
}

/** Formato de tela compartilhado entre as duas origens (EmissionIntent e Charge). */
interface TelaRow {
  id: string;
  nome: string;
  servico: string;
  valor: number;
  agendamento: string | null;
  pago: boolean;
  pagoEm: string | null;
  notaEmitida: boolean;
  notaNum: string | null;
  cobrado: boolean;
  cobradoEm: string | null;
  /** Presente e `true` só nas linhas vindas de Charge (Task 4); ausente no fluxo EmissionIntent de sempre. */
  charge?: true;
  /**
   * CPF do tomador, quando o cadastro tem. É o campo que a clínica REDIGITA no
   * emissor da prefeitura — e CPF redigitado à mão é a origem do erro que
   * motivou o produto. `null` = não informado; a tela pede na conversa em vez
   * de esconder a falta (descobrir dentro do portal, com a nota meio preenchida,
   * é pior).
   */
  cpf?: string | null;
  /** Só em Charge: envio marcado para esta data/hora (ISO). null = sem agendamento. */
  agendadaPara?: string | null;
  /** Só em Charge: o cliente pediu nota fiscal? null = não perguntado/sem resposta. */
  notaSolicitada?: boolean | null;
}

// Converte a visão de cobrança do banco (EmissionIntent) para o formato da tela.
// pago = tem paidAt OU nota emitida; cobrado = tem chargeSentAt; notaEmitida = status emitido ou tem notaNumber.
// "emitida ⇒ pago" (smoke 12/07): a nota SÓ emite após o comprovante validado (gate B),
// mas o intent nasce sem paidAt — a tela mostrava a nota recém-emitida como
// "Pendente + Cobrar" (linha fantasma). Pagamento verificado é pagamento.
function paraTela(r: CobrancaView): TelaRow {
  const notaEmitida = r.status === "emitted" || r.notaNumber != null;
  return {
    id: r.id,
    nome: r.tomadorName,
    servico: r.description,
    valor: r.amount,
    agendamento: r.appointmentAt ? r.appointmentAt.toISOString() : null,
    pago: r.paidAt != null || notaEmitida,
    pagoEm: r.paidAt ? r.paidAt.toISOString() : null,
    notaEmitida,
    notaNum: r.notaNumber,
    cobrado: r.chargeSentAt != null,
    cobradoEm: r.chargeSentAt ? r.chargeSentAt.toISOString() : null,
  };
}

/**
 * Converte uma Charge (Task 4) pro MESMO formato de tela. Nota nunca existe
 * nesse fluxo (pertence só ao EmissionIntent) — `notaEmitida:false`/`notaNum:null`
 * sempre. Paciente cai pro whatsapp quando o contato não tem nome salvo (nunca
 * inventa um nome). `cobrado` = já dispararam o WhatsApp ao menos uma vez
 * (chargedAt setado); `pago` = status "paga" — a MESMA semântica de rótulo do
 * front (ver `statusDe` em CobrancasView.tsx): pendente→"Pendente",
 * cobrada→"Cobrado · aguardando", paga→"Pago".
 */
function paraTelaCharge(c: Charge, contact: Contact | null): TelaRow {
  return {
    id: c.id,
    // Sem nome cadastrado, o telefone FORMATADO identifica quem é; o bloco de
    // 13 dígitos cru não diz nada para quem atende.
    nome: contact?.fullName ?? formatarTelefone(contact?.whatsappNumber) ?? "",
    cpf: contact?.cpf ?? null,
    servico: c.description,
    valor: c.amount,
    agendamento: null,
    pago: c.status === "paga",
    pagoEm: c.paidAt ? c.paidAt.toISOString() : null,
    // `notaEmitida` aqui é o QUE A CLÍNICA JÁ EMITIU no sistema dela (marcado no
    // painel) — não emissão automática, que não existe neste fluxo.
    notaEmitida: c.notaEmitidaEm != null,
    notaNum: null,
    cobrado: c.chargedAt != null,
    cobradoEm: c.chargedAt ? c.chargedAt.toISOString() : null,
    charge: true,
    agendadaPara: c.scheduledFor ? c.scheduledFor.toISOString() : null,
    /** null = ainda não perguntado/sem resposta; true/false = o que o cliente respondeu. */
    notaSolicitada: c.notaSolicitada,
  };
}

// Algoritmo INTOCADO (Task 4 só amplia o array de entrada) — lê só os campos
// comuns da TelaRow, então funciona igual pras linhas de EmissionIntent e de Charge.
function calcularMetricas(clientes: TelaRow[]) {
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

/** Lista combinada (EmissionIntent + Charge) da empresa, no mesmo shape de tela. */
async function listaCombinada(deps: CobrancasRoutesDeps, companyId: string): Promise<TelaRow[]> {
  const rows = await deps.emissions.listCobrancasByCompanyId(companyId);
  const charges = await deps.charges.listByCompanyId(companyId);
  const chargeRows = await Promise.all(
    charges.map(async (c) => paraTelaCharge(c, await deps.contacts.getById(c.contactId))),
  );
  return [...rows.map(paraTela), ...chargeRows];
}

/**
 * Data/hora do agendamento vinda do corpo (`quando`). Devolve:
 *  - `undefined` — campo ausente: enviar AGORA (comportamento de sempre).
 *  - `null` — `quando: null`: cancelar um agendamento existente.
 *  - `Date` — agendar. Data no passado vira envio agora: quem clicou "cobrar"
 *    numa data que já passou quer cobrar, não deixar preso num agendamento
 *    que nunca vence.
 *  - `"invalida"` — texto que não é data: erro, nunca um palpite.
 */
function lerQuando(body: unknown): Date | null | undefined | "invalida" {
  const bruto = (body as { quando?: unknown } | undefined)?.quando;
  if (bruto === undefined) return undefined;
  if (bruto === null) return null;
  if (typeof bruto !== "string") return "invalida";
  const d = new Date(bruto);
  if (Number.isNaN(d.getTime())) return "invalida";
  return d.getTime() <= Date.now() ? undefined : d;
}

export function cobrancasRoutes(deps: CobrancasRoutesDeps): Router {
  const r = Router();
  r.use(deps.authMiddleware);

  // GET /api/cobrancas — clientes com status de pagamento/nota/cobrança
  // (EmissionIntent de sempre + Charge da Task 4, no mesmo shape de tela).
  r.get("/", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    ok(res, await listaCombinada(deps, companyId));
  });

  // GET /api/cobrancas/metricas — resumo (pagos, pendentes, a cobrar, etc.)
  r.get("/metricas", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    ok(res, calcularMetricas(await listaCombinada(deps, companyId)));
  });

  // POST /api/cobrancas/:id/cobrar — registra a cobrança (chargeSentAt) do
  // fluxo EmissionIntent de sempre. O disparo automático da mensagem no
  // WhatsApp pra ESTE fluxo ainda não existe — ver POST /charges/:id/cobrar
  // pro fluxo NOVO (Charge, Task 4), que dispara de verdade.
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

  // POST /api/cobrancas/charges/:id/cobrar — Task 4: o Kaua manda a cobrança
  // DE VERDADE no WhatsApp do paciente (valor + Pix da empresa) e marca "cobrada".
  //
  // Corpo opcional `{ quando }`: ausente = agora (é o que o botão sempre fez);
  // data futura = agenda o disparo (quem envia é o laço do ChargeScheduler);
  // `null` = desmarca. Cobrança agendada segue "pendente" até sair de fato — a
  // clínica não pode ver como "cobrado" algo que o paciente não recebeu.
  r.post("/charges/:id/cobrar", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const id = String(req.params.id ?? "");

    const quando = lerQuando(req.body);
    if (quando === "invalida") {
      fail(res, "Data de agendamento inválida.", 400, "VALIDATION");
      return;
    }

    // Agendar sem ter como enviar seria promessa vazia — mesma guarda dos dois casos.
    if (!deps.messaging || !deps.sender) {
      fail(res, "Cobrança indisponível no momento.", 503, "CHARGE_UNAVAILABLE");
      return;
    }

    const charge = await deps.charges.getById(id);
    if (!charge) {
      fail(res, "Cobrança não encontrada.", 404, "NOT_FOUND");
      return;
    }

    const integration = await deps.integrations.getById(charge.integrationId);
    if (!integration || integration.companyId !== companyId) {
      // Anti-enumeração: charge de outra empresa responde IGUAL a "não existe".
      fail(res, "Cobrança não encontrada.", 404, "NOT_FOUND");
      return;
    }

    if (charge.status === "paga") {
      fail(res, "Cobrança já paga.", 409, "CHARGE_ALREADY_PAID");
      return;
    }

    // Agendar/desmarcar: só grava a data, nada sai agora.
    if (quando !== undefined) {
      await deps.charges.save({ ...charge, scheduledFor: quando, updatedAt: new Date() });
      ok(
        res,
        { id: charge.id, status: charge.status, agendadaPara: quando ? quando.toISOString() : null },
        quando ? "Envio agendado." : "Agendamento cancelado.",
      );
      return;
    }

    try {
      // Enviar na mão LIMPA o agendamento: o combinado foi cumprido antes da
      // hora e o laço não pode mandar a mesma cobrança de novo.
      await deps.sender.send({ ...charge, scheduledFor: null });
      ok(res, { id: charge.id, status: "cobrada" });
    } catch (err) {
      console.warn(`[cobrancas] falha ao enviar cobranca ${id}:`, err instanceof Error ? err.message : err);
      fail(res, "Não foi possível enviar a cobrança.", 502, "CHARGE_SEND_FAILED");
    }
  });

  // POST /api/cobrancas/charges/:id/nota-emitida — a clínica riscou da lista:
  // ela emitiu a nota no sistema fiscal DELA. Aqui é só registro (nada é emitido
  // pelo Megus). `emitida:false` desfaz, para o caso de marcar por engano.
  r.post("/charges/:id/nota-emitida", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const id = String(req.params.id ?? "");
    const emitida = (req.body as { emitida?: unknown } | undefined)?.emitida !== false;

    const charge = await deps.charges.getById(id);
    if (!charge) {
      fail(res, "Cobrança não encontrada.", 404, "NOT_FOUND");
      return;
    }
    const integration = await deps.integrations.getById(charge.integrationId);
    if (!integration || integration.companyId !== companyId) {
      fail(res, "Cobrança não encontrada.", 404, "NOT_FOUND"); // anti-enumeração
      return;
    }

    const now = new Date();
    await deps.charges.save({ ...charge, notaEmitidaEm: emitida ? now : null, updatedAt: now });
    ok(res, { id: charge.id, notaEmitida: emitida }, emitida ? "Nota marcada como emitida." : "Marcação desfeita.");
  });

  return r;
}
