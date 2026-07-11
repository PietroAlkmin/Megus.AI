import { describe, expect, it } from "vitest";
import { toWhatsAppFormatting } from "../../../src/infrastructure/messaging/whatsappFormat";

describe("toWhatsAppFormatting — Markdown do modelo → formatação do WhatsApp", () => {
  it("**negrito** vira *negrito* (caso real: hora e telefone)", () => {
    expect(toWhatsAppFormatting("Agora são **16:54** em São Paulo.")).toBe("Agora são *16:54* em São Paulo.");
    expect(toWhatsAppFormatting("Nosso telefone é **+55 11 3322-1100**.")).toBe("Nosso telefone é *+55 11 3322-1100*.");
  });

  it("múltiplos negritos na mesma frase", () => {
    expect(toWhatsAppFormatting("**A** e **B**")).toBe("*A* e *B*");
  });

  it("__itálico__ vira _itálico_", () => {
    expect(toWhatsAppFormatting("olha __isso__")).toBe("olha _isso_");
  });

  it("formatação já-WhatsApp fica intocada (idempotente)", () => {
    expect(toWhatsAppFormatting("já *certo* e _ok_")).toBe("já *certo* e _ok_");
  });

  it("asterisco solto/matemática não é tocado", () => {
    expect(toWhatsAppFormatting("2 * 3 = 6 e 4*5")).toBe("2 * 3 = 6 e 4*5");
  });
});
