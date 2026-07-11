import { describe, it, expect } from "vitest";
import { assembleContext, maskCpf, maskName } from "../../../src/application/agent/ContextAssembler";

const integration: any = { id: "int1", fiscalName: "Clínica X LTDA" };
const agentConfig: any = { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "oi", fewShotDialogs: [], capabilities: { linkedServiceIds: ["svc1"] } };
const services: any = [{ id: "svc1", description: "Massagem", price: 180 }, { id: "svc2", description: "Consulta", price: 250 }];

describe("ContextAssembler", () => {
  it("maskCpf esconde o miolo", () => { expect(maskCpf("52998224725")).toBe("529.***.**7-25"); expect(maskCpf(null)).toBeNull(); });
  it("maskName vira 1º nome + inicial", () => { expect(maskName("João da Silva")).toBe("João S."); expect(maskName(null)).toBeNull(); });
  it("monta persona, negócio (emissivel por linkedServiceIds) e collected", () => {
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration, companyProfile: null, services, contact: { fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true } as any, history: [], today: "hoje" });
    expect(ctx.persona.name).toBe("Kaua");
    expect(ctx.business.companyName).toBe("Clínica X LTDA");
    expect(ctx.business.profile).toBeNull(); // sem cadastro → sem bloco de empresa
    expect(ctx.business.services.find(s => s.description === "Massagem")!.emissivel).toBe(true);
    expect(ctx.business.services.find(s => s.description === "Consulta")!.emissivel).toBe(false);
    expect(ctx.collected.cpfNameVerified).toBe(true);
    expect(ctx.collected.cpfMasked).toBe("529.***.**7-25");
    expect(ctx.collected.fullNameMasked).toBe("João S.");
  });

  it("cadastro da empresa entra só com campos PREENCHIDOS ('' não vira linha)", () => {
    const companyProfile: any = {
      companyId: "c1", name: "Clínica Sorriso", fiscalName: "Clínica Sorriso Ltda", fiscalDoc: "11222333000181",
      municipalRegistration: "", email: "", phone: "(11) 4002-8922", zip: "", address: "", city: "São Paulo", state: "SP",
      pixType: "cnpj", pixKey: "11222333000181", paymentInstructions: "  ", updatedAt: new Date(),
    };
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration, companyProfile, services, contact: null, history: [], today: "hoje" });
    expect(ctx.business.profile).toEqual({
      fantasyName: "Clínica Sorriso", address: null, city: "São Paulo", state: "SP", phone: "(11) 4002-8922",
      email: null, pixType: "cnpj", pixKey: "11222333000181", paymentInstructions: null,
    });
  });

  it("cadastro todo vazio → profile null; pixType sem chave não conta como dado", () => {
    const vazio: any = {
      companyId: "c1", name: "", fiscalName: "", fiscalDoc: "", municipalRegistration: "",
      email: "", phone: "", zip: "", address: "", city: "", state: "",
      pixType: "cnpj", pixKey: "", paymentInstructions: "", updatedAt: new Date(),
    };
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration, companyProfile: vazio, services, contact: null, history: [], today: "hoje" });
    expect(ctx.business.profile).toBeNull();
  });

  it("companyId vem da integration", () => {
    const integrationComCompany: any = { ...integration, companyId: "c1" };
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration: integrationComCompany, companyProfile: null, services, contact: null, history: [], today: "hoje" });
    expect(ctx.companyId).toBe("c1");
  });

  it("sem companyId na integration (fixture antiga) → \"\" (nunca undefined)", () => {
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration, companyProfile: null, services, contact: null, history: [], today: "hoje" });
    expect(ctx.companyId).toBe("");
  });
});
