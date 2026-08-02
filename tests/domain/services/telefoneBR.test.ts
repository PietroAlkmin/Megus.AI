import { describe, expect, it } from "vitest";
import { ehValido, normalizar, variantes } from "../../../src/domain/services/telefoneBR";

/**
 * O número é o ÚNICO elo entre a cobrança e o paciente: a Charge aponta para um
 * Contact, e o Contact é achado pelo telefone. Errar aqui cria cobrança que não
 * dá para enviar nem para quitar — dinheiro parado sem ninguém saber.
 */
describe("telefoneBR.normalizar", () => {
  it.each([
    ["11 94284-2271", "5511942842271"], // como a clínica escreve
    ["(12) 99652-6854", "5512996526854"],
    ["1142842271", "551142842271"], // fixo com DDD
    ["+55 11 94284-2271", "5511942842271"], // já com DDI
    ["5511942842271", "5511942842271"],
  ])("%s → %s", (escrito, esperado) => {
    expect(normalizar(escrito)).toBe(esperado);
  });

  it("vazio → null (campo não preenchido não vira número inventado)", () => {
    expect(normalizar("")).toBeNull();
    expect(normalizar(null)).toBeNull();
  });
});

describe("telefoneBR.ehValido", () => {
  it.each([
    ["5511942842271", true], // celular atual
    ["551142842271", true], // 8 dígitos: fixo OU celular antigo
    ["5512996526854", true],
  ])("aceita %s", (n, ok) => expect(ehValido(n)).toBe(ok));

  it.each([
    ["55119428227", "dígito a menos"],
    ["551194284227100", "dígito a mais"],
    ["119428422710", "sem DDI e tamanho errado"],
    ["5501942842271", "DDD inexistente"],
    ["1194284227", "sem DDI"],
    ["5511142842271", "9 dígitos que não começam com 9"],
  ])("recusa %s (%s)", (n) => expect(ehValido(n)).toBe(false));
});

/**
 * A variante só existe para a linha que EXISTIA antes do nono dígito — o 9 foi
 * prefixado a celulares cujo número já começava com 6-9. É por isso que
 * 99876-5432 tem forma antiga (9876-5432) e 94284-2271 não tem: embaixo do 9
 * dele há "4284-2271", cara de fixo, número que nunca foi aquele celular.
 */
describe("telefoneBR.variantes", () => {
  it("celular ANTIGO (local começava com 6-9) casa nas duas formas", () => {
    expect(variantes("5511998765432")).toEqual(["5511998765432", "551198765432"]);
    expect(variantes("551198765432")).toEqual(["551198765432", "5511998765432"]);
  });

  it("celular que só existe COM o 9 não ganha variante de fixo", () => {
    // 94284-2271 → sem o 9 viraria 4284-2271, que é faixa de fixo: procurar por
    // ele acharia o telefone da recepção, não o celular do paciente.
    expect(variantes("5511942842271")).toEqual(["5511942842271"]);
  });

  it("a forma GRAVADA vem primeiro (desempate previsível)", () => {
    expect(variantes("551198765432")[0]).toBe("551198765432");
  });

  it("fixo não ganha variante — acrescentar o 9 inventaria um celular", () => {
    expect(variantes("551132224444")).toEqual(["551132224444"]); // local 3222-4444
  });

  it("número que não reconhecemos passa inteiro, sem palpite", () => {
    expect(variantes("447911123456")).toEqual(["447911123456"]);
    expect(variantes("")).toEqual([]);
  });
});
