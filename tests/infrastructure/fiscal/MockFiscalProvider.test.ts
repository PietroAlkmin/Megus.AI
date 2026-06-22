import { describe, expect, it } from "vitest";
import { MockFiscalProvider } from "../../../src/infrastructure/fiscal/MockFiscalProvider";
import type { EmissionIntent } from "../../../src/domain/entities/EmissionIntent";

const intent = { tomadorCpf: "12345678901", tomadorName: "Cliente", amount: 180 } as unknown as EmissionIntent;

describe("MockFiscalProvider", () => {
  it("devolve a URL servida quando configurada (WhatsApp consegue baixar)", async () => {
    const f = new MockFiscalProvider("http://megus-app:3000/nota-demo.pdf");
    const r = await f.emitNfse(intent);
    expect(r.success).toBe(true);
    expect(r.pdfUrl).toBe("http://megus-app:3000/nota-demo.pdf");
  });

  it("cai no esquema mock:// quando sem URL", async () => {
    const f = new MockFiscalProvider();
    const r = await f.emitNfse(intent);
    expect(r.pdfUrl?.startsWith("mock://")).toBe(true);
  });
});
