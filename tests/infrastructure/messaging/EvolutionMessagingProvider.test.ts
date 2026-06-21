import { describe, expect, it, vi, beforeEach } from "vitest";
import { EvolutionMessagingProvider } from "../../../src/infrastructure/messaging/evolution/EvolutionMessagingProvider";

describe("EvolutionMessagingProvider", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("sendText faz POST no endpoint certo com apikey", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    const p = new EvolutionMessagingProvider({ baseUrl: "http://evo:8080", apiKey: "k", instance: "megus" });
    await p.sendText({ to: "5511988887777", text: "oi" });
    const [url, opts] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://evo:8080/message/sendText/megus");
    expect((opts.headers as Record<string, string>)["apikey"]).toBe("k");
    expect(JSON.parse(opts.body as string).text).toBe("oi");
  });
});
