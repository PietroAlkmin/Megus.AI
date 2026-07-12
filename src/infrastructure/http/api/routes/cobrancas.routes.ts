import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { ok, fail } from "../result";
import type { AuthContext } from "../authMiddleware";
import type {
  IEmissionIntentRepository,
  IIntegrationRepository,
  IChargeRepository,
  IContactRepository,
  IConversationRepository,
  ICompanyProfileRepository,
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
  /** Envio de WhatsApp da cobrança proativa (Task 4). Ausente = a rota de charge fica indisponível (503) — ex.: testes de outras rotas que não passam messaging. */
  messaging?: IMessagingProvider;
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
    nome: contact?.fullName ?? contact?.whatsappNumber ?? "",
    servico: c.description,
    valor: c.amount,
    agendamento: null,
    pago: c.status === "paga",
    pagoEm: c.paidAt ? c.paidAt.toISOString() : null,
    notaEmitida: false,
    notaNum: null,
    cobrado: c.chargedAt != null,
    cobradoEm: c.chargedAt ? c.chargedAt.toISOString() : null,
    charge: true,
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

/** Primeiro nome do contato pra saudação — nunca inventa nome (sem nome: "Olá!" liso). */
function primeiroNome(fullName: string | null | undefined): string {
  const nome = (fullName ?? "").trim();
  return nome ? nome.split(/\s+/)[0]! : "";
}

/** Mesma convenção usada no resto da casa pra valores em mensagem/PDF ("R$ 180,00"). */
function formatBRL(amount: number): string {
  return "R$ " + amount.toFixed(2).replace(".", ",");
}

/**
 * Monta a mensagem de cobrança proativa do Kaua: valor do serviço + Pix da
 * empresa (se cadastrado) + instrução do comprovante. Sem `pixKey`, a linha de
 * Pix é OMITIDA por inteiro — nunca um placeholder tipo "Pix: a combinar".
 */
function montarMensagemCobranca(params: {
  fullName: string | null | undefined;
  description: string;
  amount: number;
  pixType: string | null | undefined;
  pixKey: string | null | undefined;
}): string {
  const nome = primeiroNome(params.fullName);
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  const partes = [
    `${saudacao} Passando para combinar o pagamento da sua ${params.description}: ${formatBRL(params.amount)}.`,
  ];
  if (params.pixKey) {
    // "(tipo)" só quando existe — pixType vazio no cadastro renderizaria "Pix (): chave".
    const tipo = params.pixType?.trim() ? ` (${params.pixType.trim()})` : "";
    partes.push(`Pix${tipo}: ${params.pixKey}.`);
  }
  partes.push("Depois é só me enviar o comprovante por aqui que eu já emito sua nota fiscal. 😊");
  return partes.join("\n\n");
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
  r.post("/charges/:id/cobrar", async (req: Request, res: Response) => {
    const { companyId } = req.auth as AuthContext;
    const id = String(req.params.id ?? "");

    if (!deps.messaging) {
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

    try {
      const contact = await deps.contacts.getById(charge.contactId);
      if (!contact) throw new Error("contato da cobrança não encontrado");

      const companyProfile = await deps.companyProfiles.getByCompanyId(companyId);
      const text = montarMensagemCobranca({
        fullName: contact.fullName,
        description: charge.description,
        amount: charge.amount,
        pixType: companyProfile?.pixType,
        pixKey: companyProfile?.pixKey,
      });

      await deps.messaging.sendText({
        to: contact.whatsappNumber,
        text,
        instance: integration.evolutionInstance || undefined,
      });

      const conversation = await deps.conversations.getOrCreate(integration.id, charge.contactId, contact.whatsappNumber);
      await deps.conversations.appendMessage({
        id: randomUUID(),
        conversationId: conversation.id,
        direction: "outbound",
        author: "agent",
        kind: "text",
        body: text,
        mediaUrl: null,
        createdAt: new Date(),
      });

      const now = new Date();
      await deps.charges.save({ ...charge, status: "cobrada", chargedAt: now, updatedAt: now });

      ok(res, { id: charge.id, status: "cobrada" });
    } catch (err) {
      console.warn(`[cobrancas] falha ao enviar cobranca ${id}:`, err instanceof Error ? err.message : err);
      fail(res, "Não foi possível enviar a cobrança.", 502, "CHARGE_SEND_FAILED");
    }
  });

  return r;
}
