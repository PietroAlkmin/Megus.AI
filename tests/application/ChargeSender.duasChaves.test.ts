import { describe, expect, it } from "vitest";
import { montarMensagemCobranca } from "../../src/application/charges/ChargeSender";

/**
 * Com DUAS contas, a cobrança não pode mandar chave nenhuma.
 *
 * A clínica recebe em lugares diferentes conforme o paciente peça ou não nota
 * fiscal. Mandar a principal "por padrão" põe metade dos pagamentos na conta
 * errada — e ninguém descobre até o contador fechar o mês. Então a cobrança
 * PERGUNTA, e a chave sai no turno seguinte (o agente tem as duas no contexto,
 * com a regra de qual usar).
 */
const base = {
  fullName: "Pietro Alkmin",
  description: "Consulta",
  amount: 280,
  pixType: "cnpj",
  pixKey: "28756515000135",
  fiscalEnabled: false,
};

describe("mensagem de cobrança", () => {
  it("UMA conta: manda a chave junto, como sempre", () => {
    const t = montarMensagemCobranca(base);
    expect(t).toContain("R$ 280,00");
    expect(t).toContain("Pix (cnpj): 28756515000135");
    expect(t).toContain("comprovante");
  });

  it("DUAS contas: NÃO manda chave — pergunta sobre a nota primeiro", () => {
    const t = montarMensagemCobranca({ ...base, temChaveDeNota: true });
    expect(t).toContain("R$ 280,00");
    expect(t).not.toContain("28756515000135"); // nenhuma chave na mensagem
    expect(t).not.toContain("Pix (cnpj):");
    expect(t).toContain("nota fiscal");
  });

  it("DUAS contas: pede o que a nota exige, na mesma mensagem", () => {
    // Perguntar a nota e só depois pedir CPF custaria mais um ida-e-volta com
    // um paciente que já está com o celular na mão.
    const t = montarMensagemCobranca({ ...base, temChaveDeNota: true });
    expect(t).toContain("nome completo");
    expect(t).toContain("CPF");
    expect(t).toContain("e-mail");
  });

  it("sem nome cadastrado não inventa saudação com nome", () => {
    const t = montarMensagemCobranca({ ...base, fullName: null, temChaveDeNota: true });
    expect(t.startsWith("Olá!")).toBe(true);
  });
});
