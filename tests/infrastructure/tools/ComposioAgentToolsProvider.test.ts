import { describe, expect, it, vi } from "vitest";
import { ComposioAgentToolsProvider, keepCalendarTools, type ComposioSessionFactory } from "../../../src/infrastructure/tools/composio/ComposioAgentToolsProvider";

/** Fábrica fake — mesmo shape do ComposioSessionFactory (userId → sessão com .tools()). Zero rede. */
function fakeSessions(toolsByUser: Record<string, Record<string, unknown>>): ComposioSessionFactory {
  return vi.fn(async (userId: string) => ({
    tools: async () => toolsByUser[userId] ?? {},
  }));
}

describe("ComposioAgentToolsProvider", () => {
  it("cache: 2ª chamada pra mesma empresa NÃO bate na factory de novo (mesma referência)", async () => {
    const sessions = fakeSessions({ "co-A": { GOOGLECALENDAR_CREATE_EVENT: { description: "Cria evento" } } });
    const provider = new ComposioAgentToolsProvider(sessions);

    const first = await provider.forCompany("co-A");
    const second = await provider.forCompany("co-A");

    expect(sessions).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // cache HIT devolve o mesmo objeto, não recalcula
  });

  it("cache expira com ttl 0 → bate na factory a cada chamada", async () => {
    const sessions = fakeSessions({ "co-A": { GOOGLECALENDAR_CREATE_EVENT: { description: "Cria evento" } } });
    const provider = new ComposioAgentToolsProvider(sessions, 0);

    await provider.forCompany("co-A");
    await provider.forCompany("co-A");

    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it("scoping: empresas diferentes chamam a factory com o respectivo userId e recebem toolsets independentes", async () => {
    const sessions = fakeSessions({
      "co-A": { TOOL_A: { description: "tool de co-A" } },
      "co-B": { TOOL_B: { description: "tool de co-B" } },
    });
    const provider = new ComposioAgentToolsProvider(sessions);

    const a = await provider.forCompany("co-A");
    const b = await provider.forCompany("co-B");

    expect(sessions).toHaveBeenCalledWith("co-A");
    expect(sessions).toHaveBeenCalledWith("co-B");
    expect(a.infos.map((i) => i.name)).toEqual(["TOOL_A"]);
    expect(b.infos.map((i) => i.name)).toEqual(["TOOL_B"]);
  });

  it("fail-safe: a factory rejeitando devolve toolset vazio (sem throw)", async () => {
    const sessions: ComposioSessionFactory = vi.fn(async () => {
      throw new Error("composio fora do ar");
    });
    const provider = new ComposioAgentToolsProvider(sessions);

    await expect(provider.forCompany("co-A")).resolves.toEqual({ nativeTools: {}, infos: [] });
  });

  it("fail-safe: session.tools() rejeitando devolve toolset vazio (sem throw)", async () => {
    const sessions: ComposioSessionFactory = vi.fn(async () => ({
      tools: async () => {
        throw new Error("timeout Composio");
      },
    }));
    const provider = new ComposioAgentToolsProvider(sessions);

    await expect(provider.forCompany("co-A")).resolves.toEqual({ nativeTools: {}, infos: [] });
  });

  it("companyId vazio (sentinela do contrato do port) → toolset vazio SEM chamar a factory", async () => {
    const sessions: ComposioSessionFactory = vi.fn(async () => ({ tools: async () => ({}) }));
    const provider = new ComposioAgentToolsProvider(sessions);

    const result = await provider.forCompany("");

    expect(result).toEqual({ nativeTools: {}, infos: [] });
    expect(sessions).not.toHaveBeenCalled();
  });

  it("infos: nome+description vêm do toolset nativo; nativeTools é passthrough (mesma referência)", async () => {
    const raw = { GOOGLECALENDAR_CREATE_EVENT: { description: "Cria evento no Google Calendar" } };
    const sessions = fakeSessions({ "co-A": raw });
    const provider = new ComposioAgentToolsProvider(sessions);

    const { infos, nativeTools } = await provider.forCompany("co-A");

    expect(infos).toEqual([{ name: "GOOGLECALENDAR_CREATE_EVENT", description: "Cria evento no Google Calendar" }]);
    expect(nativeTools).toBe(raw);
  });

  it("infos: tool sem description cai no próprio nome (fallback)", async () => {
    const sessions = fakeSessions({ "co-A": { GOOGLECALENDAR_WEIRD: {} } });
    const provider = new ComposioAgentToolsProvider(sessions);

    const { infos } = await provider.forCompany("co-A");

    expect(infos).toEqual([{ name: "GOOGLECALENDAR_WEIRD", description: "GOOGLECALENDAR_WEIRD" }]);
  });

  it("erro NÃO entra no cache: falha transiente → a próxima chamada tenta de novo e recebe as tools", async () => {
    let calls = 0;
    const sessions: ComposioSessionFactory = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("composio fora do ar");
      return { tools: async () => ({ GOOGLECALENDAR_CREATE_EVENT: { description: "Cria evento" } }) };
    });
    const provider = new ComposioAgentToolsProvider(sessions);

    const down = await provider.forCompany("co-A");
    const up = await provider.forCompany("co-A");

    expect(down).toEqual({ nativeTools: {}, infos: [] });
    expect(up.infos.map((i) => i.name)).toEqual(["GOOGLECALENDAR_CREATE_EVENT"]);
    expect(sessions).toHaveBeenCalledTimes(2); // o vazio do erro NÃO ficou pinado no TTL
  });
});

describe("keepCalendarTools (curadoria do catálogo — garantia anti-vazamento)", () => {
  it("só tools GOOGLECALENDAR_* passam; o resto é descartado", () => {
    const all = {
      GOOGLECALENDAR_CREATE_EVENT: { description: "Cria evento" },
      GOOGLECALENDAR_FIND_FREE_SLOTS: { description: "Horários livres" },
      GMAIL_SEND_EMAIL: { description: "NÃO pode vazar" },
      SLACK_POST: {},
    };
    expect(Object.keys(keepCalendarTools(all)).sort()).toEqual([
      "GOOGLECALENDAR_CREATE_EVENT",
      "GOOGLECALENDAR_FIND_FREE_SLOTS",
    ]);
  });

  it("vazio → vazio (sem surpresa)", () => {
    expect(keepCalendarTools({})).toEqual({});
  });
});
