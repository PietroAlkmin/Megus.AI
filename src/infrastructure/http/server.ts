import http, { type Server } from "node:http";

export interface HttpDeps {
  onWebhook(body: unknown): Promise<void>;
  getQr(): Promise<string | null>;
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c: Buffer) => {
      data += c;
      if (data.length > 5_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export function createServer(deps: HttpDeps): Server {
  return http.createServer(async (req, res) => {
    const url = req.url ?? "";
    try {
      if (req.method === "POST" && url === "/webhook/evolution") {
        const body = await readJson(req);
        // Responde 200 imediatamente; o Evolution faz retry em não-2xx
        res.writeHead(200).end("ok");
        deps.onWebhook(body).catch((e: unknown) => console.error("webhook erro:", e));
        return;
      }
      if (req.method === "GET" && url === "/qr") {
        const qr = await deps.getQr();
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(qr ? `<img src="${qr}" alt="QR"/>` : "<p>Sem QR (já conectado?)</p>");
        return;
      }
      if (req.method === "GET" && url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(404).end("not found");
    } catch (e: unknown) {
      console.error(e);
      res.writeHead(500).end("error");
    }
  });
}
