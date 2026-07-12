import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { createApiApp } from "../../src/infrastructure/http/api/app";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { IWhatsAppProvisioner } from "../../src/domain/ports/IWhatsAppProvisioner";
import type { IMessagingProvider } from "../../src/domain/ports/IMessagingProvider";
import type { Charge } from "../../src/domain/entities/Charge";

const JWT_SECRET = "test-secret-cobrancas-charges";

// Rotas de cobrança não usam o provisioner — stub só pra satisfazer o tipo de ApiDeps.
const provisioner: IWhatsAppProvisioner = { provision: vi.fn(), status: vi.fn() };

interface Envelope<T> {
  success: boolean;
  data: T;
  message: string | null;
  errors: string[] | null;
}

function listen(app: ReturnType<typeof createApiApp>): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ port: (server.address() as { port: number }).port, server });
    });
  });
}

function makeToken(companyId: string, userId = "u1"): string {
  return jwt.sign({ sub: userId, companyId, email: "time@megus.ai" }, JWT_SECRET);
}

function fakeMessaging(): IMessagingProvider {
  return {
    start: vi.fn(),
    getConnectionStatus: () => "connected",
    getQrCode: vi.fn(),
    onInboundMessage: vi.fn(),
    sendText: vi.fn(async () => {}),
    sendMedia: vi.fn(async () => {}),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
  };
}

/**
 * Cenário: duas clínicas — Alfa (c1, COM Pix cadastrado) e Beta (c2, SEM Pix).
 * Alfa tem 3 charges (pendente/cobrada/paga) — cobre listagem+métricas+cobrar;
 * Beta tem 1 charge pendente — cobre isolamento de tenant e o caso "sem Pix".
 */
async function seedCenario() {
  const repos = new InMemoryRepositories();
  const now = new Date();
  const base = { fiscalDoc: "11222333000181", fiscalName: "Fixture LTDA", fiscalProviderRef: null, active: true, createdAt: now, updatedAt: now };

  repos.seed({
    companies: [
      { id: "c1", name: "Clínica Alfa" },
      { id: "c2", name: "Clínica Beta" },
    ],
    users: [{ id: "u1", email: "time@megus.ai", passwordHash: "x", companyId: "c1", displayName: "Time", createdAt: now, updatedAt: now }],
    memberships: [{ userId: "u1", companyId: "c2" }],
    integrations: [
      { id: "intA", companyId: "c1", displayName: "Recepção Alfa", whatsappNumber: "5511911110000", evolutionInstance: "alfa-inst", ...base },
      { id: "intB", companyId: "c2", displayName: "Recepção Beta", whatsappNumber: "5511922220000", evolutionInstance: "beta-inst", ...base },
    ],
    contacts: [
      { id: "ctA", integrationId: "intA", whatsappNumber: "5511977776666", fullName: "Maria Souza", cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now },
      { id: "ctB", integrationId: "intB", whatsappNumber: "5511988885555", fullName: "Carlos Dias", cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now },
    ],
  });

  // Alfa tem Pix cadastrado; Beta NÃO (simula empresa que não cadastrou pagamento).
  await repos.companyProfiles.save({
    companyId: "c1", name: "Clínica Alfa", fiscalName: "Alfa LTDA", fiscalDoc: "11222333000181",
    municipalRegistration: "", email: "", phone: "", zip: "", address: "", city: "", state: "",
    pixType: "celular", pixKey: "11999998888", paymentInstructions: "", updatedAt: now,
  });

  const chargePendente: Charge = {
    id: "chA-pendente", integrationId: "intA", contactId: "ctA", serviceId: "svc1",
    description: "Massagem", amount: 180, status: "pendente",
    calendarEventId: null, chargedAt: null, paidAt: null, createdAt: now, updatedAt: now,
  };
  const chargeCobrada: Charge = {
    id: "chA-cobrada", integrationId: "intA", contactId: "ctA", serviceId: "svc1",
    description: "Retorno", amount: 90, status: "cobrada",
    calendarEventId: null, chargedAt: now, paidAt: null, createdAt: now, updatedAt: now,
  };
  const chargePaga: Charge = {
    id: "chA-paga", integrationId: "intA", contactId: "ctA", serviceId: "svc1",
    description: "Consulta", amount: 300, status: "paga",
    calendarEventId: null, chargedAt: now, paidAt: now, createdAt: now, updatedAt: now,
  };
  const chargeBeta: Charge = {
    id: "chB-pendente", integrationId: "intB", contactId: "ctB", serviceId: null,
    description: "Sessão", amount: 250, status: "pendente",
    calendarEventId: null, chargedAt: null, paidAt: null, createdAt: now, updatedAt: now,
  };
  await repos.charges.save(chargePendente);
  await repos.charges.save(chargeCobrada);
  await repos.charges.save(chargePaga);
  await repos.charges.save(chargeBeta);

  return { repos, chargePendente, chargeCobrada, chargePaga, chargeBeta };
}

describe("cobrancas — charges (Task 4: botao Cobrar dispara o WhatsApp)", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function sobe(repos: InMemoryRepositories, messaging: IMessagingProvider): Promise<string> {
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner, messaging });
    const listening = await listen(app);
    server = listening.server;
    return `http://localhost:${listening.port}`;
  }

  it("GET /api/cobrancas inclui as linhas de charge com paciente/valor/status certos, isoladas por empresa", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos, fakeMessaging());

    const res = await fetch(`${url}/api/cobrancas`, { headers: { Authorization: `Bearer ${makeToken("c1")}` } });
    const body = (await res.json()) as Envelope<Array<Record<string, unknown>>>;
    expect(res.status).toBe(200);

    const pendente = body.data.find((r) => r.id === "chA-pendente")!;
    expect(pendente.charge).toBe(true);
    expect(pendente.nome).toBe("Maria Souza");
    expect(pendente.servico).toBe("Massagem");
    expect(pendente.valor).toBe(180);
    expect(pendente.pago).toBe(false);
    expect(pendente.cobrado).toBe(false); // -> chip "Pendente" no front
    expect(pendente.notaNum).toBeNull(); // charge nunca tem nota (isso é do fluxo EmissionIntent)

    const cobrada = body.data.find((r) => r.id === "chA-cobrada")!;
    expect(cobrada.pago).toBe(false);
    expect(cobrada.cobrado).toBe(true); // -> chip "Cobrado · aguardando" no front

    const paga = body.data.find((r) => r.id === "chA-paga")!;
    expect(paga.pago).toBe(true); // -> chip "Pago" no front
    expect(paga.pagoEm).not.toBeNull();

    // charge da Beta não aparece pro token da Alfa (isolamento de tenant)
    expect(body.data.some((r) => r.id === "chB-pendente")).toBe(false);
  });

  it("GET /metricas soma as charges (agendados=todas; pendentes/valorPendente = status != paga)", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos, fakeMessaging());

    const res = await fetch(`${url}/api/cobrancas/metricas`, { headers: { Authorization: `Bearer ${makeToken("c1")}` } });
    const body = (await res.json()) as Envelope<Record<string, number>>;
    expect(res.status).toBe(200);

    expect(body.data.agendados).toBe(3); // as 3 charges da Alfa (a da Beta não conta)
    expect(body.data.pendentes).toBe(2); // pendente + cobrada
    expect(body.data.valorPendente).toBe(270); // 180 + 90 (a paga fica de fora)
    expect(body.data.pagos).toBe(1);
  });

  it("POST /charges/:id/cobrar dispara o WhatsApp com valor+Pix, marca cobrada e grava no historico", async () => {
    const { repos, chargePendente } = await seedCenario();
    const messaging = fakeMessaging();
    const url = await sobe(repos, messaging);

    const res = await fetch(`${url}/api/cobrancas/charges/${chargePendente.id}/cobrar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<{ id: string; status: string }>;
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("cobrada");

    const sendTextMock = messaging.sendText as any;
    expect(sendTextMock).toHaveBeenCalledOnce();
    const args = sendTextMock.mock.calls[0][0];
    expect(args.to).toBe("5511977776666");
    expect(args.instance).toBe("alfa-inst");
    expect(args.text).toContain("Maria");
    expect(args.text).toContain("Massagem");
    expect(args.text).toContain("R$ 180,00");
    expect(args.text).toContain("Pix (celular): 11999998888");

    const charge = await repos.charges.getById(chargePendente.id);
    expect(charge?.status).toBe("cobrada");
    expect(charge?.chargedAt).not.toBeNull();

    const conv = await repos.conversations.findByWhatsappNumber("intA", "5511977776666");
    expect(conv).not.toBeNull();
    const hist = await repos.conversations.getHistory(conv!.id, 10);
    expect(hist.some((m) => m.direction === "outbound" && m.author === "agent" && m.body === args.text)).toBe(true);
  });

  it("cobrança de outra empresa -> 404 (anti-enumeração) e NENHUM envio", async () => {
    const { repos, chargeBeta } = await seedCenario();
    const messaging = fakeMessaging();
    const url = await sobe(repos, messaging);

    const res = await fetch(`${url}/api/cobrancas/charges/${chargeBeta.id}/cobrar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` }, // token da Alfa, charge é da Beta
    });

    expect(res.status).toBe(404);
    expect(messaging.sendText).not.toHaveBeenCalled();
    const charge = await repos.charges.getById(chargeBeta.id);
    expect(charge?.status).toBe("pendente");
  });

  it("cobrança já paga -> 409, sem enviar de novo", async () => {
    const { repos, chargePaga } = await seedCenario();
    const messaging = fakeMessaging();
    const url = await sobe(repos, messaging);

    const res = await fetch(`${url}/api/cobrancas/charges/${chargePaga.id}/cobrar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<unknown>;

    expect(res.status).toBe(409);
    expect(body.errors).toContain("CHARGE_ALREADY_PAID");
    expect(messaging.sendText).not.toHaveBeenCalled();
  });

  it("empresa sem pixKey cadastrado -> mensagem SEM linha de Pix", async () => {
    const { repos, chargeBeta } = await seedCenario();
    const messaging = fakeMessaging();
    const url = await sobe(repos, messaging);

    const res = await fetch(`${url}/api/cobrancas/charges/${chargeBeta.id}/cobrar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c2")}` }, // dona da Beta
    });
    expect(res.status).toBe(200);

    const sendTextMock = messaging.sendText as any;
    const args = sendTextMock.mock.calls[0][0];
    expect(args.text).not.toContain("Pix");
  });

  it("falha no envio (messaging lança) -> 502 e a cobrança continua pendente", async () => {
    const { repos, chargePendente } = await seedCenario();
    const messaging = fakeMessaging();
    (messaging.sendText as any).mockRejectedValueOnce(new Error("evolution fora do ar"));
    const url = await sobe(repos, messaging);

    const res = await fetch(`${url}/api/cobrancas/charges/${chargePendente.id}/cobrar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<unknown>;

    expect(res.status).toBe(502);
    expect(body.errors).toContain("CHARGE_SEND_FAILED");

    const charge = await repos.charges.getById(chargePendente.id);
    expect(charge?.status).toBe("pendente");
    expect(charge?.chargedAt).toBeNull();
  });
});
