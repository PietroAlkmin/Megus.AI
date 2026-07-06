import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { createApiApp } from "../../src/infrastructure/http/api/app";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { IWhatsAppProvisioner } from "../../src/domain/ports/IWhatsAppProvisioner";

const JWT_SECRET = "test-secret-agente";

// Rotas de agente não usam o provisioner — stub só pra satisfazer o tipo de ApiDeps.
const provisioner: IWhatsAppProvisioner = { provision: vi.fn(), status: vi.fn() };

interface Persona {
  integrationId: string | null;
  name: string;
  segment: string;
  tone: string;
  emojis: boolean;
  lang: string;
  instructions: string;
  fewShotDialogs: { q: string; a: string }[];
  capabilities?: unknown;
  linkedServiceIds?: unknown;
}

interface Envelope {
  success: boolean;
  data: Persona;
}

async function readJson(res: Response): Promise<Envelope> {
  return (await res.json()) as Envelope;
}

function listen(app: ReturnType<typeof createApiApp>): Promise<{ port: number; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ port: (server.address() as { port: number }).port, server });
    });
  });
}

function seedRepos(): InMemoryRepositories {
  const repos = new InMemoryRepositories();
  const now = new Date();
  repos.seed({
    integrations: [{
      id: "int1",
      displayName: "Consultório X",
      whatsappNumber: "5511999990000",
      fiscalDoc: "12345678000199",
      fiscalName: "Consultório X LTDA",
      fiscalProviderRef: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    }],
    agentConfigs: [{
      id: "ag1",
      integrationId: "int1",
      name: "Kaua",
      segment: "saude",
      tone: "equilibrado",
      emojis: true,
      lang: "pt",
      instructions: "Seja cordial.",
      capabilities: {
        chat: true, agenda: false, agendaLink: null,
        fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"],
      },
      knowledgeFiles: [],
      fewShotDialogs: [{ q: "quanto custa?", a: "R$ 180." }],
      createdAt: now,
      updatedAt: now,
    }],
  });
  return repos;
}

function makeToken(companyId: string): string {
  return jwt.sign({ sub: "user1", companyId, email: "piloto@megus.ai" }, JWT_SECRET);
}

describe("GET/PUT /api/agente", () => {
  let server: Server;
  afterEach(() => server?.close());

  it("GET devolve a persona da integração da empresa logada", async () => {
    const repos = seedRepos();
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", useMock: false, provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const res = await fetch(`http://localhost:${listening.port}/api/agente`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Kaua");
    expect(body.data.segment).toBe("saude");
    expect(body.data.tone).toBe("equilibrado");
    expect(body.data.emojis).toBe(true);
    expect(body.data.lang).toBe("pt");
    expect(body.data.instructions).toBe("Seja cordial.");
    expect(body.data.fewShotDialogs).toEqual([{ q: "quanto custa?", a: "R$ 180." }]);
    expect(body.data.integrationId).toBe("int1");
    // escopo persona: não vaza capabilities/linkedServiceIds no envelope da rota
    expect(body.data.capabilities).toBeUndefined();
    expect(body.data.linkedServiceIds).toBeUndefined();
  });

  it("GET sem token responde 401", async () => {
    const repos = seedRepos();
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", useMock: false, provisioner });
    const listening = await listen(app);
    server = listening.server;

    const res = await fetch(`http://localhost:${listening.port}/api/agente`);
    expect(res.status).toBe(401);
  });

  it("PUT muda o tom, o GET seguinte reflete, e preserva linkedServiceIds/knowledgeFiles", async () => {
    const repos = seedRepos();
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", useMock: false, provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const putRes = await fetch(`http://localhost:${listening.port}/api/agente`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Kaua",
        segment: "saude",
        tone: "formal",
        emojis: false,
        lang: "pt",
        instructions: "Seja mais formal com o paciente.",
        fewShotDialogs: [{ q: "oi", a: "Olá, bom dia." }],
      }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await readJson(putRes);
    expect(putBody.success).toBe(true);
    expect(putBody.data.tone).toBe("formal");
    expect(putBody.data.emojis).toBe(false);

    const getRes = await fetch(`http://localhost:${listening.port}/api/agente`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody = await readJson(getRes);
    expect(getBody.data.tone).toBe("formal");
    expect(getBody.data.emojis).toBe(false);
    expect(getBody.data.instructions).toBe("Seja mais formal com o paciente.");
    expect(getBody.data.fewShotDialogs).toEqual([{ q: "oi", a: "Olá, bom dia." }]);

    // capabilities (linkedServiceIds) e knowledgeFiles preexistentes NÃO são tocados pelo PUT
    const saved = await repos.agentConfigs.getByIntegrationId("int1");
    expect(saved?.capabilities.linkedServiceIds).toEqual(["svc1"]);
    expect(saved?.capabilities.fiscalDocType).toBe("nfse");
    expect(saved?.knowledgeFiles).toEqual([]);
    expect(saved?.id).toBe("ag1");
  });

  it("empresa SEM integração ainda: PUT /api/agente cria a integração e salva a persona (200, não 404)", async () => {
    // Cadastro do zero: nenhuma integração seedada (nem serviço, nem WhatsApp
    // configurado antes). Configurar o agente deve funcionar mesmo assim.
    const repos = new InMemoryRepositories();
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", useMock: false, provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-nova");

    const putRes = await fetch(`http://localhost:${listening.port}/api/agente`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: "Kaua",
        segment: "estetica",
        tone: "descontraido",
        emojis: true,
        lang: "pt",
        instructions: "Seja animado.",
        fewShotDialogs: [],
      }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await readJson(putRes);
    expect(putBody.success).toBe(true);
    expect(putBody.data.name).toBe("Kaua");
    expect(putBody.data.integrationId).toBeTruthy();

    // a integração "Padrão" foi criada de fato (não é um efeito só da resposta)
    const created = await repos.integrations.getFirstByCompanyId("company-nova");
    expect(created).not.toBeNull();
    expect(created?.displayName).toBe("Padrão");

    const getRes = await fetch(`http://localhost:${listening.port}/api/agente`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody = await readJson(getRes);
    expect(getRes.status).toBe(200);
    expect(getBody.data.name).toBe("Kaua");
    expect(getBody.data.tone).toBe("descontraido");
  });

  it("PUT com dados inválidos responde 400", async () => {
    const repos = seedRepos();
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", useMock: false, provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const res = await fetch(`http://localhost:${listening.port}/api/agente`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Kaua", tone: "agressivo" }),
    });
    expect(res.status).toBe(400);
  });
});
