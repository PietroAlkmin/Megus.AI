import { describe, expect, it } from "vitest";
import { mapEvolutionWebhook } from "../../../src/infrastructure/messaging/evolution/webhookMapper";

const sample = {
  event: "messages.upsert",
  instance: "megus",
  data: { key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "ABC" }, pushName: "João", messageType: "conversation", message: { conversation: "oi" } },
  sender: "5511999990000@s.whatsapp.net",
};

describe("mapEvolutionWebhook", () => {
  it("mapeia texto inbound", () => {
    const m = mapEvolutionWebhook(sample);
    expect(m).not.toBeNull();
    expect(m?.from).toBe("5511988887777");
    expect(m?.to).toBe("5511999990000");
    expect(m?.kind).toBe("text");
    expect(m?.text).toBe("oi");
  });
  it("ignora fromMe", () => {
    expect(mapEvolutionWebhook({ ...sample, data: { ...sample.data, key: { ...sample.data.key, fromMe: true } } })).toBeNull();
  });
  it("ignora evento não-mensagem", () => {
    expect(mapEvolutionWebhook({ event: "connection.update", data: {} })).toBeNull();
  });
});
