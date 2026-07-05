import { describe, it, expect } from "vitest";
import { assembleContext, maskCpf, maskName } from "../../../src/application/agent/ContextAssembler";

const integration: any = { id: "int1", fiscalName: "Clínica X LTDA" };
const agentConfig: any = { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "oi", fewShotDialogs: [], capabilities: { linkedServiceIds: ["svc1"] } };
const services: any = [{ id: "svc1", description: "Massagem", price: 180 }, { id: "svc2", description: "Consulta", price: 250 }];

describe("ContextAssembler", () => {
  it("maskCpf esconde o miolo", () => { expect(maskCpf("52998224725")).toBe("529.***.**7-25"); expect(maskCpf(null)).toBeNull(); });
  it("maskName vira 1º nome + inicial", () => { expect(maskName("João da Silva")).toBe("João S."); expect(maskName(null)).toBeNull(); });
  it("monta persona, negócio (emissivel por linkedServiceIds) e collected", () => {
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration, services, contact: { fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true } as any, history: [], today: "hoje" });
    expect(ctx.persona.name).toBe("Kaua");
    expect(ctx.business.companyName).toBe("Clínica X LTDA");
    expect(ctx.business.services.find(s => s.description === "Massagem")!.emissivel).toBe(true);
    expect(ctx.business.services.find(s => s.description === "Consulta")!.emissivel).toBe(false);
    expect(ctx.collected.cpfNameVerified).toBe(true);
    expect(ctx.collected.cpfMasked).toBe("529.***.**7-25");
    expect(ctx.collected.fullNameMasked).toBe("João S.");
  });
});
