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

  it("sendMedia busca a URL e envia como base64 (Evolution rejeita URL interna)", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/nota-demo.pdf")) {
        return { ok: true, status: 200, arrayBuffer: async () => pdfBytes.buffer } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as unknown as Response;
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const p = new EvolutionMessagingProvider({ baseUrl: "http://evo:8080", apiKey: "k", instance: "megus" });
    await p.sendMedia({ to: "5511988887777", mimetype: "application/pdf", url: "http://megus-app:3000/nota-demo.pdf", filename: "nota.pdf", caption: "x" });

    const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    const post = calls.find(([u]) => String(u).includes("/message/sendMedia/"));
    expect(post).toBeDefined();
    const body = JSON.parse(post![1].body as string);
    expect(body.media).toBe(Buffer.from(pdfBytes).toString("base64"));
    expect(body.mediatype).toBe("document");
  });
});
