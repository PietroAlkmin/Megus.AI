import { describe, expect, it } from "vitest";
import { LogMessagingProvider } from "../../../src/infrastructure/messaging/LogMessagingProvider";

describe("LogMessagingProvider", () => {
  it("guarda o outbound em vez de enviar", async () => {
    const p = new LogMessagingProvider();
    await p.sendText({ to: "5511988887777", text: "oi" });
    expect(p.sent).toHaveLength(1);
    expect(p.getConnectionStatus()).toBe("connected");
  });

  it("guarda sendMedia em sent[]", async () => {
    const p = new LogMessagingProvider();
    await p.sendMedia({ to: "5511988887777", mimetype: "image/png", url: "http://x.com/img.png" });
    expect(p.sent).toHaveLength(1);
  });

  it("dispatchInbound entrega a mensagem ao handler registrado", async () => {
    const p = new LogMessagingProvider();
    const received: string[] = [];
    p.onInboundMessage(async (m) => { received.push(m.text ?? ""); });
    await p.dispatchInbound({
      providerMessageId: "dev-1",
      from: "5511988887777",
      to: "551198888000",
      kind: "text",
      text: "quero a nota",
      media: null,
      timestamp: new Date(),
    });
    expect(received).toEqual(["quero a nota"]);
  });
});
