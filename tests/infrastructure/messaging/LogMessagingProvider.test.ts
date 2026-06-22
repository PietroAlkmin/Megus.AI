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

});
