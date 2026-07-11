import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Server } from "node:http";
import { createApiApp } from "../../src/infrastructure/http/api/app";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { IWhatsAppProvisioner } from "../../src/domain/ports/IWhatsAppProvisioner";
import type { ComposioConnectOps } from "../../src/infrastructure/tools/composio/ComposioAgentToolsProvider";

const JWT_SECRET = "test-secret-ferramentas";

// Rotas de ferramentas não tocam repos/provisioner — stubs só pra satisfazer o tipo de ApiDeps.
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

function makeToken(companyId: string): string {
  return jwt.sign({ sub: "u1", companyId, email: "time@megus.ai" }, JWT_SECRET);
}

/** Fake do ComposioConnectOps — zero rede, mesmo shape que as rotas dependem. */
function fakeConnectOps(overrides: Partial<ComposioConnectOps> = {}): ComposioConnectOps {
  return {
    initiate: vi.fn(async () => ({ id: "conn_1", redirectUrl: "https://accounts.google.com/o/oauth2/auth?x=1" })),
    listActive: vi.fn(async () => 0),
    ...overrides,
  };
}

describe("POST/GET /api/agente/ferramentas/agenda", () => {
  let server: Server;
  afterEach(() => server?.close());

  async function sobe(deps: { connectOps?: ComposioConnectOps; gcalAuthConfigId?: string }): Promise<string> {
    const app = createApiApp({
      repos: new InMemoryRepositories(),
      jwtSecret: JWT_SECRET,
      corsOrigins: "*",
      provisioner,
      ...deps,
    });
    const listening = await listen(app);
    server = listening.server;
    return `http://localhost:${listening.port}`;
  }

  it("POST /conectar devolve a url de OAuth quando env+provider presentes", async () => {
    const connectOps = fakeConnectOps();
    const url = await sobe({ connectOps, gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/conectar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<{ url: string }>;

    expect(res.status).toBe(200);
    expect(body.data.url).toBe("https://accounts.google.com/o/oauth2/auth?x=1");
    expect(connectOps.initiate).toHaveBeenCalledWith("c1", "ac_123");
  });

  it("POST /conectar sem COMPOSIO_GCAL_AUTH_CONFIG_ID → 503, sem chamar o provider", async () => {
    const connectOps = fakeConnectOps();
    const url = await sobe({ connectOps }); // sem gcalAuthConfigId

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/conectar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<null>;

    expect(res.status).toBe(503);
    expect(body.errors).toEqual(["TOOLS_UNAVAILABLE"]);
    expect(connectOps.initiate).not.toHaveBeenCalled();
  });

  it("POST /conectar sem connectOps (Composio desligado) → 503", async () => {
    const url = await sobe({ gcalAuthConfigId: "ac_123" }); // sem connectOps

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/conectar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });

    expect(res.status).toBe(503);
  });

  it("POST /conectar sem token → 401", async () => {
    const url = await sobe({ connectOps: fakeConnectOps(), gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/conectar`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("POST /conectar com redirectUrl nulo do provider → 502", async () => {
    const connectOps = fakeConnectOps({ initiate: vi.fn(async () => ({ id: "conn_1", redirectUrl: null })) });
    const url = await sobe({ connectOps, gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/conectar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<null>;

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
  });

  it("POST /conectar: companyId vem SEMPRE do JWT, nunca do corpo (cross-tenant impossível por construção)", async () => {
    const connectOps = fakeConnectOps();
    const url = await sobe({ connectOps, gcalAuthConfigId: "ac_123" });

    await fetch(`${url}/api/agente/ferramentas/agenda/conectar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("c1")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "c-outra-empresa" }), // tentativa de smuggling — precisa ser ignorada
    });

    expect(connectOps.initiate).toHaveBeenCalledWith("c1", "ac_123");
  });

  it("GET /status: conectado=true quando há conta ativa", async () => {
    const connectOps = fakeConnectOps({ listActive: vi.fn(async () => 1) });
    const url = await sobe({ connectOps, gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/status`, {
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<{ conectado: boolean }>;

    expect(res.status).toBe(200);
    expect(body.data.conectado).toBe(true);
    expect(connectOps.listActive).toHaveBeenCalledWith("c1", "googlecalendar");
  });

  it("GET /status: conectado=false quando não há conta ativa", async () => {
    const connectOps = fakeConnectOps({ listActive: vi.fn(async () => 0) });
    const url = await sobe({ connectOps, gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/status`, {
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<{ conectado: boolean }>;

    expect(res.status).toBe(200);
    expect(body.data.conectado).toBe(false);
  });

  it("GET /status sem connectOps (Composio desligado) → 200 conectado:false, nunca 5xx", async () => {
    const url = await sobe({}); // sem connectOps nem gcalAuthConfigId

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/status`, {
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<{ conectado: boolean }>;

    expect(res.status).toBe(200);
    expect(body.data.conectado).toBe(false);
  });

  it("GET /status: listActive rejeitando → 200 conectado:false (fail-safe, nunca 5xx)", async () => {
    const connectOps = fakeConnectOps({
      listActive: vi.fn(async () => {
        throw new Error("composio fora do ar");
      }),
    });
    const url = await sobe({ connectOps, gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/status`, {
      headers: { Authorization: `Bearer ${makeToken("c1")}` },
    });
    const body = (await res.json()) as Envelope<{ conectado: boolean }>;

    expect(res.status).toBe(200);
    expect(body.data.conectado).toBe(false);
  });

  it("GET /status sem token → 401", async () => {
    const url = await sobe({ connectOps: fakeConnectOps(), gcalAuthConfigId: "ac_123" });

    const res = await fetch(`${url}/api/agente/ferramentas/agenda/status`);
    expect(res.status).toBe(401);
  });
});
