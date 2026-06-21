import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../../src/infrastructure/http/server";
import type { Server } from "node:http";

let server: Server;
afterEach(() => server?.close());

function listen(s: Server): Promise<number> {
  return new Promise((res) => s.listen(0, () => res((s.address() as { port: number }).port)));
}

describe("http server", () => {
  it("POST /webhook/evolution chama onWebhook e responde 200", async () => {
    const onWebhook = vi.fn(async () => {});
    server = createServer({ onWebhook, getQr: async () => null });
    const port = await listen(server);
    const res = await fetch(`http://localhost:${port}/webhook/evolution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "messages.upsert" }),
    });
    expect(res.status).toBe(200);
    // onWebhook is called fire-and-forget, give it a tick to be called
    await new Promise((r) => setTimeout(r, 10));
    expect(onWebhook).toHaveBeenCalledOnce();
  });

  it("GET /health responde ok", async () => {
    server = createServer({ onWebhook: async () => {}, getQr: async () => null });
    const port = await listen(server);
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
  });

  it("POST /dev/inbound chama onDevInbound e responde 200", async () => {
    const onDevInbound = vi.fn(async () => {});
    server = createServer({ onWebhook: async () => {}, getQr: async () => null, onDevInbound });
    const port = await listen(server);
    const body = { from: "5511988887777", to: "5511900000000", kind: "text", text: "quero a nota" };
    const res = await fetch(`http://localhost:${port}/dev/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(onDevInbound).toHaveBeenCalledOnce();
  });

  it("POST /dev/inbound sem onDevInbound responde 200 sem erro", async () => {
    server = createServer({ onWebhook: async () => {}, getQr: async () => null });
    const port = await listen(server);
    const res = await fetch(`http://localhost:${port}/dev/inbound`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "5511988887777", to: "5511900000000", kind: "text", text: "oi" }),
    });
    expect(res.status).toBe(200);
  });
});
