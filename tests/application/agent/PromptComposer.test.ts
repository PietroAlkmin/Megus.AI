import { describe, it, expect } from "vitest";
import { composePrompt } from "../../../src/application/agent/PromptComposer";
import type { AgentContext } from "../../../src/domain/ports/IAgentBrain";

function ctx(over: Partial<AgentContext> = {}): AgentContext {
  return {
    companyId: "c1",
    persona: { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "Seja gentil.", fewShotDialogs: [] },
    business: { companyName: "Clínica X", profile: null, services: [{ description: "Massagem", price: 180, emissivel: true }, { description: "Consulta", price: 250, emissivel: false }] },
    state: "new", history: [], collected: { cpfNameVerified: false, fullNameMasked: null, cpfMasked: null, emissionStatus: null }, today: "sábado, 5 de julho de 2026",
    ...over,
  };
}

const PROFILE_CHEIO = {
  fantasyName: "Clínica Sorriso", address: "Al. Rio Negro, 1200", city: "São Paulo", state: "SP", phone: "(11) 4002-8922",
  email: "oi@sorriso.com", pixType: "cnpj", pixKey: "11222333000181", paymentInstructions: "Envie o comprovante aqui.",
};
describe("composePrompt", () => {
  it("system carrega nome, empresa, catálogo com preços e a data", () => {
    const msgs = composePrompt(ctx());
    expect(msgs[0]!.role).toBe("system");
    const sys = msgs[0]!.content as string;
    expect(sys).toContain("Kaua");
    expect(sys).toContain("Clínica X");
    expect(sys).toContain("Massagem");
    expect(sys).toContain("180");
    expect(sys).toContain("2026");
  });
  it("tom/emojis/idioma mudam o system (snapshot por config)", () => {
    const formalNoEmoji = composePrompt(ctx({ persona: { ...ctx().persona, tone: "formal", emojis: false, lang: "en" } }))[0]!.content as string;
    expect(formalNoEmoji).toContain("senhor");
    expect(formalNoEmoji.toLowerCase()).toContain("não use emoji");
  });
  it("few-shot entra como pares user/assistant antes do histórico", () => {
    const msgs = composePrompt(ctx({ persona: { ...ctx().persona, fewShotDialogs: [{ q: "oi", a: "olá!" }] } }));
    expect(msgs[1]!.role).toBe("user");
    expect(msgs[1]!.content).toBe("oi");
    expect(msgs[2]!.role).toBe("assistant");
    expect(msgs[2]!.content).toBe("olá!");
  });
  it("regra fiscal está no system (nunca dizer que emitiu)", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).toMatch(/nunca diga que emitiu/i);
  });
  it("cadastro é regra GENÉRICA, separada da fiscal (não presumir que nome+CPF é pra nota)", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).toContain("AÇÃO EM CURSO");
    expect(sys).toMatch(/não presuma que é para nota fiscal/i);
    // e a regra da NOTA não fala mais em pedir nome+CPF (des-overfit)
    const fiscalIdx = sys.indexOf("intent_emit");
    expect(sys.slice(fiscalIdx, fiscalIdx + 160)).not.toMatch(/nome completo \+ CPF/);
  });
  it("segmento entra com rótulo humano, não o id cru", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).toContain("Saúde / Clínica");
    expect(sys).not.toContain("Segmento: saude.");
  });
  it("com cadastro: apresenta pelo nome FANTASIA e monta o bloco da empresa (Pix incluso)", () => {
    const sys = composePrompt(
      ctx({ business: { companyName: "Clínica Sorriso Ltda", profile: PROFILE_CHEIO, services: [] } }),
    )[0]!.content as string;
    expect(sys).toContain("atendente da Clínica Sorriso."); // fantasia na apresentação
    expect(sys).toContain("Razão social: Clínica Sorriso Ltda");
    expect(sys).toContain("Endereço: Al. Rio Negro, 1200");
    expect(sys).toContain("Cidade: São Paulo/SP");
    expect(sys).toContain("Pix (cnpj), chave 11222333000181");
    expect(sys).toContain("Envie o comprovante aqui.");
    expect(sys).toContain("não invente o que não está aqui");
  });
  it("sem cadastro (profile null): sem bloco de empresa e apresentação pela razão social", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).toContain("atendente da Clínica X.");
    expect(sys).not.toContain("Sobre a empresa");
  });
  it("ferramentas entram como lista declarativa (nome+propósito) + nudge genérico de ponderação", () => {
    const sys = composePrompt(ctx(), [
      { name: "get_current_datetime", description: "Data e hora atuais no fuso de São Paulo." },
      { name: "calendar_listar", description: "Horários livres da agenda." },
    ])[0]!.content as string;
    expect(sys).toContain("Ferramentas disponíveis:");
    expect(sys).toContain("- get_current_datetime: Data e hora atuais no fuso de São Paulo.");
    expect(sys).toContain("- calendar_listar: Horários livres da agenda.");
    // nudge GENÉRICO (pondere qual usar) — nunca regra por cenário ("se perguntarem a hora...")
    expect(sys).toMatch(/pondere/i);
    expect(sys).toMatch(/nunca invente|não invente/i);
    expect(sys).not.toMatch(/se perguntarem|quando perguntarem/i);
  });
  it("sem ferramentas: nenhum bloco de ferramentas no system", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).not.toContain("Ferramentas disponíveis");
  });
  it("notices: avisos transientes entram como bloco 'Avisos do sistema'; sem notices, sem bloco", () => {
    const com = composePrompt(ctx({ notices: ["O cadastro do cliente acabou de ser VALIDADO com sucesso."] }))[0]!.content as string;
    expect(com).toContain("Avisos do sistema");
    expect(com).toContain("- O cadastro do cliente acabou de ser VALIDADO com sucesso.");
    const sem = composePrompt(ctx())[0]!.content as string;
    expect(sem).not.toContain("Avisos do sistema");
  });
  it("campos ausentes do cadastro NÃO viram linha (sem placeholder no prompt)", () => {
    const sys = composePrompt(
      ctx({ business: { companyName: "Clínica X", profile: { ...PROFILE_CHEIO, email: null, paymentInstructions: null }, services: [] } }),
    )[0]!.content as string;
    expect(sys).not.toContain("E-mail");
    expect(sys).not.toContain("Instruções de pagamento");
    expect(sys).toContain("Telefone: (11) 4002-8922");
  });
});
