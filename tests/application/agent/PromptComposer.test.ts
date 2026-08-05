import { describe, it, expect } from "vitest";
import { composePrompt } from "../../../src/application/agent/PromptComposer";
import type { AgentContext } from "../../../src/domain/ports/IAgentBrain";

function ctx(over: Partial<AgentContext> = {}): AgentContext {
  return {
    companyId: "c1",
    persona: { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "Seja gentil.", fewShotDialogs: [] },
    business: { companyName: "Clínica X", profile: null, services: [{ description: "Massagem", price: 180, emissivel: true }, { description: "Consulta", price: 250, emissivel: false }] },
    state: "new", history: [], openCharges: [], cadastroPendente: [], collected: { cpfNameVerified: false, fullNameMasked: null, cpfMasked: null, emissionStatus: null }, today: "sábado, 5 de julho de 2026",
    ...over,
  };
}

const PROFILE_CHEIO = {
  fantasyName: "Clínica Sorriso", address: "Al. Rio Negro, 1200", city: "São Paulo", state: "SP", phone: "(11) 4002-8922",
  email: "oi@sorriso.com", pixType: "cnpj", pixKey: "11222333000181", pixDescricao: "", pixTypeNota: "", pixKeyNota: "", pixDescricaoNota: "", paymentInstructions: "Envie o comprovante aqui.",
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
  /**
   * A clínica recebe em contas DIFERENTES conforme o paciente peça ou não nota
   * fiscal. Mandar a chave errada põe dinheiro na conta errada — problema de
   * contador, não de software.
   */
  it("com duas chaves: o prompt separa as contas e manda descobrir a nota ANTES de enviar", () => {
    const sys = composePrompt(
      ctx({
        business: {
          companyName: "Clínica Sorriso Ltda",
          profile: {
            ...PROFILE_CHEIO,
            pixDescricao: "conta da clínica",
            pixTypeNota: "cnpj",
            pixKeyNota: "99888777000166",
            pixDescricaoNota: "conta PJ, com emissão de nota",
          },
          services: [],
        },
      }),
    )[0]!.content as string;

    expect(sys).toContain("SEM nota fiscal");
    expect(sys).toContain("chave 11222333000181 — conta da clínica");
    expect(sys).toContain("COM nota fiscal");
    expect(sys).toContain("chave 99888777000166 — conta PJ, com emissão de nota");
    expect(sys).toContain("ANTES de enviar a chave");
    expect(sys).toContain("Nunca mande as duas");
  });

  it("com UMA chave só: nem menciona a distinção de nota", () => {
    // Clínica de conta única não pode ver o agente perguntando sobre nota
    // apenas para escolher chave — a pergunta não teria consequência.
    const sys = composePrompt(
      ctx({ business: { companyName: "X", profile: { ...PROFILE_CHEIO, pixDescricao: "conta da clínica" }, services: [] } }),
    )[0]!.content as string;

    expect(sys).toContain("Pix (cnpj), chave 11222333000181 — conta da clínica");
    expect(sys).not.toContain("SEM nota fiscal");
    expect(sys).not.toContain("A conta MUDA");
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
  /**
   * Falha real em prod (02/08): o paciente pediu para pagar "uma consulta em
   * aberto" e o agente mandou esperar a equipe confirmar o valor — que estava no
   * banco. Sem este bloco ele não tem o dado para responder.
   */
  it("cobranças em aberto entram com valor e o agente é instruído a informar", () => {
    const sys = composePrompt(
      ctx({ openCharges: [{ description: "Consulta", amount: 2, enviada: true }] }),
    )[0]!.content as string;

    expect(sys).toContain("Cobranças em ABERTO deste cliente");
    expect(sys).toContain("- Consulta: R$ 2,00 (cobrança já enviada)");
    expect(sys).toContain("em vez de encaminhar para a equipe");
  });

  it("cobrança ainda não disparada não diz 'já enviada'", () => {
    const sys = composePrompt(
      ctx({ openCharges: [{ description: "Sessão", amount: 180.5, enviada: false }] }),
    )[0]!.content as string;

    expect(sys).toContain("- Sessão: R$ 180,50");
    expect(sys).not.toContain("já enviada");
  });

  it("o bloco proíbe dar pagamento por confirmado — isso é do gate B, não do modelo", () => {
    const sys = composePrompt(ctx({ openCharges: [{ description: "Consulta", amount: 90, enviada: true }] }))[0]!
      .content as string;
    expect(sys).toContain("NUNCA dê o pagamento por confirmado");
    expect(sys).toContain("comprovante");
  });

  it("sem cobrança em aberto: nenhum bloco (cliente em dia não vê cobrança inventada)", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).not.toContain("Cobranças em ABERTO");
  });

  it("várias cobranças em aberto viram uma linha cada", () => {
    const sys = composePrompt(
      ctx({
        openCharges: [
          { description: "Consulta", amount: 200, enviada: true },
          { description: "Colete", amount: 180, enviada: false },
        ],
      }),
    )[0]!.content as string;
    expect(sys).toContain("- Consulta: R$ 200,00 (cobrança já enviada)");
    expect(sys).toContain("- Colete: R$ 180,00");
  });

  /**
   * O toggle É a instrução. Antes a clínica escrevia "peça nome, CPF…" no texto
   * livre da persona E precisava lembrar de ligar algo — duas dependências para
   * o mesmo efeito. Este bloco nasce do que ela marcou no painel.
   */
  it("cadastro pendente vira bloco com os campos que faltam", () => {
    const sys = composePrompt(ctx({ cadastroPendente: ["Nome completo", "CPF", "Endereço completo com CEP"] }))[0]!
      .content as string;

    expect(sys).toContain("Cadastro que esta clínica coleta");
    expect(sys).toContain("- Nome completo");
    expect(sys).toContain("- Endereço completo com CEP");
    expect(sys).toContain("no máximo DOIS por mensagem");
  });

  it("o bloco PROÍBE condicionar o atendimento à entrega dos dados", () => {
    // Coletar cadastro não pode virar pedágio: quem procura a clínica quer
    // resolver algo, e o cadastro acompanha o atendimento — não o bloqueia.
    const sys = composePrompt(ctx({ cadastroPendente: ["CPF"] }))[0]!.content as string;
    expect(sys).toContain("NUNCA condicione");
  });

  it("nada pendente (desligado, ou o paciente já respondeu tudo) → sem bloco", () => {
    const sys = composePrompt(ctx())[0]!.content as string;
    expect(sys).not.toContain("Cadastro que esta clínica coleta");
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
