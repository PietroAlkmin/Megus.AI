import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { createApiApp } from "../../src/infrastructure/http/api/app";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { IWhatsAppProvisioner } from "../../src/domain/ports/IWhatsAppProvisioner";

const JWT_SECRET = "test-secret-whatsapp";

interface Envelope<T> {
  success: boolean;
  data: T;
}

async function readJson<T>(res: Response): Promise<Envelope<T>> {
  return (await res.json()) as Envelope<T>;
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
      whatsappNumber: "",
      fiscalDoc: "12345678000199",
      fiscalName: "Consultório X LTDA",
      fiscalProviderRef: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    }],
  });
  return repos;
}

function makeToken(companyId: string): string {
  return jwt.sign({ sub: "user1", companyId, email: "piloto@megus.ai" }, JWT_SECRET);
}

describe("POST/GET /api/agente/whatsapp", () => {
  let server: Server;
  afterEach(() => server?.close());

  it("POST /connect provisiona a instância da empresa, grava na integração e devolve o qr", async () => {
    const repos = seedRepos();
    const provisioner: IWhatsAppProvisioner = {
      provision: vi.fn(async () => ({ qrBase64: "data:image/png;base64,ABC123" })),
      status: vi.fn(),
    };
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const res = await fetch(`http://localhost:${listening.port}/api/agente/whatsapp/connect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJson<{ qr: string | null; instance: string }>(res);

    expect(res.status).toBe(200);
    expect(body.data.qr).toBe("data:image/png;base64,ABC123");
    expect(body.data.instance).toBe("megus-int1"); // integração não tinha evolutionInstance ainda
    expect(provisioner.provision).toHaveBeenCalledWith("megus-int1");

    // gravou de fato na integração (não é só efeito da resposta)
    const saved = await repos.integrations.getById("int1");
    expect(saved?.evolutionInstance).toBe("megus-int1");
  });

  it("POST /connect sem token responde 401", async () => {
    const repos = seedRepos();
    const provisioner: IWhatsAppProvisioner = { provision: vi.fn(), status: vi.fn() };
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;

    const res = await fetch(`http://localhost:${listening.port}/api/agente/whatsapp/connect`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("GET /status sem evolutionInstance ainda → connected:false, sem chamar o provisioner", async () => {
    const repos = seedRepos();
    const provisioner: IWhatsAppProvisioner = { provision: vi.fn(), status: vi.fn() };
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const res = await fetch(`http://localhost:${listening.port}/api/agente/whatsapp/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJson<{ connected: boolean; number: string | null }>(res);

    expect(res.status).toBe(200);
    expect(body.data.connected).toBe(false);
    expect(provisioner.status).not.toHaveBeenCalled();
  });

  it("GET /status connected → grava o número (do ownerJid) na integração", async () => {
    const repos = seedRepos();
    // integração já provisionada numa chamada anterior a /connect
    await repos.integrations.updateConnection("int1", "megus-int1", "");
    const provisioner: IWhatsAppProvisioner = {
      provision: vi.fn(),
      status: vi.fn(async () => ({ connected: true, number: "5511988887777" })),
    };
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const res = await fetch(`http://localhost:${listening.port}/api/agente/whatsapp/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJson<{ connected: boolean; number: string | null }>(res);

    expect(res.status).toBe(200);
    expect(body.data.connected).toBe(true);
    expect(body.data.number).toBe("5511988887777");
    expect(provisioner.status).toHaveBeenCalledWith("megus-int1");

    const saved = await repos.integrations.getById("int1");
    expect(saved?.whatsappNumber).toBe("5511988887777");
  });

  it("GET /status não conectado → não chama updateConnection (não regride o número já gravado)", async () => {
    const repos = seedRepos();
    await repos.integrations.updateConnection("int1", "megus-int1", "5511988887777");
    const provisioner: IWhatsAppProvisioner = {
      provision: vi.fn(),
      status: vi.fn(async () => ({ connected: false, number: null })),
    };
    const app = createApiApp({ repos, jwtSecret: JWT_SECRET, corsOrigins: "*", provisioner });
    const listening = await listen(app);
    server = listening.server;
    const token = makeToken("company-x");

    const res = await fetch(`http://localhost:${listening.port}/api/agente/whatsapp/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await readJson<{ connected: boolean; number: string | null }>(res);

    expect(body.data.connected).toBe(false);
    const saved = await repos.integrations.getById("int1");
    expect(saved?.whatsappNumber).toBe("5511988887777"); // preservado, não apagado
  });
});
