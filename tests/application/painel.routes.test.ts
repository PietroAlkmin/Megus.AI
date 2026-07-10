import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { createApiApp } from "../../src/infrastructure/http/api/app";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import type { IWhatsAppProvisioner } from "../../src/domain/ports/IWhatsAppProvisioner";

const JWT_SECRET = "test-secret-painel";

// Rotas do painel não usam o provisioner — stub só pra satisfazer o tipo de ApiDeps.
const provisioner: IWhatsAppProvisioner = { provision: vi.fn(), status: vi.fn() };

interface Envelope<T> {
  success: boolean;
  data: T;
  message: string | null;
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

/**
 * Cenário: duas empresas (Alfa=c1, Beta=c2); u1 é membro das duas.
 * c1 tem a integração intA (agente Kaua + conversas + emissões) e a intC (sem
 * agente configurado). c2 tem a intB — que NUNCA pode vazar pro token de c1.
 */
async function seedCenario() {
  const repos = new InMemoryRepositories();
  const now = new Date();
  const base = {
    fiscalDoc: "11222333000181",
    fiscalName: "Fixture LTDA",
    fiscalProviderRef: null,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  repos.seed({
    companies: [
      { id: "c1", name: "Clínica Alfa" },
      { id: "c2", name: "Clínica Beta" },
    ],
    users: [{
      id: "u1", email: "time@megus.ai", passwordHash: "x", companyId: "c1",
      displayName: "Time", createdAt: now, updatedAt: now,
    }],
    memberships: [{ userId: "u1", companyId: "c2" }],
    integrations: [
      { id: "intA", companyId: "c1", displayName: "Recepção", whatsappNumber: "5511911110000", ...base },
      { id: "intC", companyId: "c1", displayName: "Unidade Nova", whatsappNumber: "5511933330000", ...base },
      { id: "intB", companyId: "c2", displayName: "Beta Recep.", whatsappNumber: "5511922220000", ...base },
    ],
    agentConfigs: [
      {
        id: "agA", integrationId: "intA", name: "Kaua", segment: "saude", tone: "equilibrado",
        emojis: true, lang: "pt", instructions: "Seja cordial.",
        capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [] },
        knowledgeFiles: [], fewShotDialogs: [], createdAt: now, updatedAt: now,
      },
      {
        id: "agB", integrationId: "intB", name: "Sofia", segment: "beleza", tone: "descontraido",
        emojis: true, lang: "pt", instructions: "Seja leve.",
        capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [] },
        knowledgeFiles: [], fewShotDialogs: [], createdAt: now, updatedAt: now,
      },
    ],
    contacts: [
      { id: "ct1", integrationId: "intA", whatsappNumber: "5511960000001", fullName: "Marina Lopes", cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now },
      { id: "ct2", integrationId: "intA", whatsappNumber: "5511960000002", fullName: null, cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now },
      { id: "ct3", integrationId: "intA", whatsappNumber: "5511960000003", fullName: "Helena Prado", cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now },
      { id: "ct4", integrationId: "intB", whatsappNumber: "5511960000009", fullName: "Beta Cliente", cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now },
    ],
  });

  // Conversas construídas pelas MESMAS portas que o runtime usa.
  const aberta = await repos.conversations.getOrCreate("intA", "ct1", "5511960000001");
  aberta.state = ConversationState.CollectingIdentity; // AGUARDANDO
  await repos.conversations.save(aberta);
  await repos.conversations.appendMessage({ id: "m1", conversationId: aberta.id, direction: "inbound", author: "contact", kind: "text", body: "Oi! Consigo a nota?", mediaUrl: null, createdAt: now });
  await repos.conversations.appendMessage({ id: "m2", conversationId: aberta.id, direction: "outbound", author: "agent", kind: "text", body: "Claro! Me confirma seu CPF?", mediaUrl: null, createdAt: new Date(now.getTime() + 1) });

  const bot = await repos.conversations.getOrCreate("intA", "ct2", "5511960000002");
  await repos.conversations.appendMessage({ id: "m3", conversationId: bot.id, direction: "inbound", author: "contact", kind: "text", body: "Boa tarde", mediaUrl: null, createdAt: now });

  const encerrada = await repos.conversations.getOrCreate("intA", "ct3", "5511960000003");
  encerrada.state = ConversationState.Done;
  await repos.conversations.save(encerrada);

  const deBeta = await repos.conversations.getOrCreate("intB", "ct4", "5511960000009");

  // Emissões: uma emitida agora (conta em "notas hoje"), uma antiga pendente.
  const emissaoBase = {
    conversationId: aberta.id, contactId: "ct1", serviceId: null,
    paymentVerified: true, paymentConfidence: 1, fiscalKey: null, pdfUrl: null,
  };
  await repos.emissions.save({ ...emissaoBase, id: "e1", integrationId: "intA", status: "emitted", tomadorName: "Marina Lopes", tomadorCpf: "39053344705", description: "Consulta", amount: 250, createdAt: now, updatedAt: now });
  await repos.emissions.save({ ...emissaoBase, id: "e2", integrationId: "intA", status: "ready", tomadorName: "Carlos Aguiar", tomadorCpf: "39053344705", description: "Retorno", amount: 120, createdAt: new Date(now.getTime() - 30 * 3600_000), updatedAt: now });
  await repos.emissions.save({ ...emissaoBase, id: "e9", integrationId: "intB", status: "ready", tomadorName: "Beta Cliente", tomadorCpf: "39053344705", description: "Sessão", amount: 400, createdAt: now, updatedAt: now });

  return { repos, aberta, bot, encerrada, deBeta };
}

describe("painel com dados reais (sem mock)", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function sobe(repos: InMemoryRepositories): Promise<string> {
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;
    return `http://localhost:${listening.port}`;
  }

  it("GET /api/agentes calcula conversas abertas, notas hoje e alertas do banco — só da empresa do token", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos);

    const res = await fetch(`${url}/api/agentes`, { headers: { Authorization: `Bearer ${makeToken("c1")}` } });
    const body = (await res.json()) as Envelope<Array<Record<string, unknown>>>;

    expect(res.status).toBe(200);
    // intB (empresa c2) NÃO aparece
    expect(body.data.map((a) => a.id).sort()).toEqual(["intA", "intC"]);

    const intA = body.data.find((a) => a.id === "intA")!;
    expect(intA.nome).toBe("Kaua");
    expect(intA.status).toBe("operando");
    expect(intA.conversas).toBe(2); // aberta + bot (a done não conta)
    expect(intA.notasHoje).toBe(1); // só a emitida de hoje
    expect(intA.segmento).toBe("saude");

    const intC = body.data.find((a) => a.id === "intC")!;
    expect(intC.status).toBe("atencao");
    expect(intC.nome).toBeNull();
    expect(intC.alerta).toBe("Agente ainda não configurado");
  });

  it("GET /api/agentes/metricas agrega mensagens de hoje e transferências", async () => {
    const { repos, bot } = await seedCenario();
    // uma conversa em atendimento humano
    bot.humanHandoff = true;
    await repos.conversations.save(bot);
    const url = await sobe(repos);

    const res = await fetch(`${url}/api/agentes/metricas`, { headers: { Authorization: `Bearer ${makeToken("c1")}` } });
    const body = (await res.json()) as Envelope<Record<string, number>>;

    expect(res.status).toBe(200);
    expect(body.data.total).toBe(2);
    expect(body.data.operando).toBe(1);
    expect(body.data.abertas).toBe(2);
    expect(body.data.msgsHoje).toBe(3); // m1+m2+m3, nada da empresa Beta
    expect(body.data.transferencias).toBe(1);
    expect(body.data.alertas).toBe(2); // intC sem agente + intA com humano aguardando
  });

  it("conversas: resolve nome do contato, prévia da última mensagem e barra outra empresa (404)", async () => {
    const { repos, aberta } = await seedCenario();
    const url = await sobe(repos);
    const token = makeToken("c1");

    const res = await fetch(`${url}/api/agentes/intA/conversas`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as Envelope<Array<Record<string, unknown>>>;
    expect(res.status).toBe(200);

    const daMarina = body.data.find((c) => c.id === aberta.id)!;
    expect(daMarina.nome).toBe("Marina Lopes"); // do Contact, não o número
    expect(daMarina.ultima).toBe("Claro! Me confirma seu CPF?");
    expect(daMarina.status).toBe("AGUARDANDO");

    const semNome = body.data.find((c) => c.telefone === "5511960000002")!;
    expect(semNome.nome).toBe("5511960000002"); // sem contato resolvido → número (dado real)

    // integração da empresa Beta com token da Alfa → 404
    const cruzado = await fetch(`${url}/api/agentes/intB/conversas`, { headers: { Authorization: `Bearer ${token}` } });
    expect(cruzado.status).toBe(404);
  });

  it("mensagens: histórico da conversa; conversa de outra empresa → 404", async () => {
    const { repos, aberta, deBeta } = await seedCenario();
    const url = await sobe(repos);
    const token = makeToken("c1");

    const res = await fetch(`${url}/api/conversas/${aberta.id}/mensagens`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json()) as Envelope<Array<Record<string, unknown>>>;
    expect(res.status).toBe(200);
    expect(body.data.map((m) => m.autor)).toEqual(["cliente", "bot"]);

    const cruzado = await fetch(`${url}/api/conversas/${deBeta.id}/mensagens`, { headers: { Authorization: `Bearer ${token}` } });
    expect(cruzado.status).toBe(404);
  });

  it("assumir: persiste humanHandoff e o status vira HUMANO na listagem", async () => {
    const { repos, bot } = await seedCenario();
    const url = await sobe(repos);
    const token = makeToken("c1");

    const res = await fetch(`${url}/api/conversas/${bot.id}/assumir`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);

    const lista = await fetch(`${url}/api/agentes/intA/conversas`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await lista.json()) as Envelope<Array<Record<string, unknown>>>;
    expect(body.data.find((c) => c.id === bot.id)?.status).toBe("HUMANO");
  });

  it("cobranças: lista real da empresa, cobrar registra e outra empresa não alcança (404)", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos);
    const token = makeToken("c1");

    const antes = await fetch(`${url}/api/cobrancas`, { headers: { Authorization: `Bearer ${token}` } });
    const corpoAntes = (await antes.json()) as Envelope<Array<Record<string, unknown>>>;
    expect(corpoAntes.data.map((c) => c.id).sort()).toEqual(["e1", "e2"]); // e9 é da Beta
    expect(corpoAntes.data.find((c) => c.id === "e2")?.cobrado).toBe(false);

    const cobrar = await fetch(`${url}/api/cobrancas/e2/cobrar`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    expect(cobrar.status).toBe(200);
    expect(((await cobrar.json()) as Envelope<unknown>).message).toBe("Cobrança registrada.");

    const depois = await fetch(`${url}/api/cobrancas`, { headers: { Authorization: `Bearer ${token}` } });
    const corpoDepois = (await depois.json()) as Envelope<Array<Record<string, unknown>>>;
    expect(corpoDepois.data.find((c) => c.id === "e2")?.cobrado).toBe(true);

    // emissão da Beta com token da Alfa → 404
    const cruzado = await fetch(`${url}/api/cobrancas/e9/cobrar`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    expect(cruzado.status).toBe(404);
  });
});

describe("seletor de empresas (empresas + trocar-empresa)", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function sobe(repos: InMemoryRepositories): Promise<string> {
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;
    return `http://localhost:${listening.port}`;
  }

  it("GET /api/auth/empresas lista as empresas do usuário ordenadas por nome", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos);

    const res = await fetch(`${url}/api/auth/empresas`, { headers: { Authorization: `Bearer ${makeToken("c1")}` } });
    const body = (await res.json()) as Envelope<Array<{ id: string; name: string }>>;

    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      { id: "c1", name: "Clínica Alfa" },
      { id: "c2", name: "Clínica Beta" },
    ]);
  });

  it("POST /api/auth/trocar-empresa re-emite o token com o novo tenant; /me segue o token", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos);

    const res = await fetch(`${url}/api/auth/trocar-empresa`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "c2" }),
    });
    const body = (await res.json()) as Envelope<{ accessToken: string; user: { companyId: string } }>;

    expect(res.status).toBe(200);
    expect(body.data.user.companyId).toBe("c2");
    const claims = jwt.verify(body.data.accessToken, JWT_SECRET) as { companyId: string };
    expect(claims.companyId).toBe("c2");

    // o /me devolve o companyId do TOKEN novo (a seleção sobrevive a refresh)
    const me = await fetch(`${url}/api/auth/me`, { headers: { Authorization: `Bearer ${body.data.accessToken}` } });
    const meBody = (await me.json()) as Envelope<{ companyId: string }>;
    expect(meBody.data.companyId).toBe("c2");
  });

  it("trocar para empresa sem membership → 403; e o token continua o antigo", async () => {
    const { repos } = await seedCenario();
    const url = await sobe(repos);

    const res = await fetch(`${url}/api/auth/trocar-empresa`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "c-fora" }),
    });
    expect(res.status).toBe(403);
  });
});
