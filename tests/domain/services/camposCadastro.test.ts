import { describe, expect, it } from "vitest";
import { cadastroPendente } from "../../../src/domain/services/camposCadastro";
import type { Contact } from "../../../src/domain/entities/Contact";

/**
 * O que AINDA falta pedir.
 *
 * Só o que falta entra no prompt: repetir pergunta já respondida é o jeito mais
 * rápido de o paciente desistir — e ele responde ao longo da conversa, não tudo
 * de uma vez.
 */
function contato(over: Partial<Contact> = {}): Contact {
  return {
    id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777",
    fullName: null, cpf: null, cpfNameVerified: false, ficha: {},
    createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

const TODOS = ["nome", "cpf", "nascimento", "sexo", "email", "endereco", "convenio"];

describe("cadastroPendente", () => {
  it("desligado → vazio, mesmo com campos marcados (o agente não pede nada)", () => {
    expect(cadastroPendente({ ligado: false, campos: TODOS }, contato())).toEqual([]);
  });

  it("ausente (agente antigo) → vazio", () => {
    expect(cadastroPendente(undefined, contato())).toEqual([]);
  });

  it("ligado → só os campos MARCADOS, com o rótulo que vai pro prompt", () => {
    expect(cadastroPendente({ ligado: true, campos: ["nome", "cpf"] }, contato())).toEqual([
      "Nome completo",
      "CPF",
    ]);
  });

  it("o que o paciente já respondeu SAI da lista", () => {
    const c = contato({ fullName: "Pietro Alkmin", cpf: "54625255830", ficha: { email: "p@t.com" } });
    expect(cadastroPendente({ ligado: true, campos: ["nome", "cpf", "email", "nascimento"] }, c)).toEqual([
      "Data de nascimento",
    ]);
  });

  it("endereço conta como respondido se veio o CEP (o paciente manda em partes)", () => {
    const c = contato({ ficha: { cep: "06573000" } });
    expect(cadastroPendente({ ligado: true, campos: ["endereco"] }, c)).toEqual([]);
  });

  it("campo em branco não conta como respondido", () => {
    const c = contato({ fullName: "   ", ficha: { email: "" } });
    expect(cadastroPendente({ ligado: true, campos: ["nome", "email"] }, c)).toEqual(["Nome completo", "E-mail"]);
  });

  it("sem contato ainda (primeira mensagem) → tudo que foi marcado", () => {
    expect(cadastroPendente({ ligado: true, campos: ["nome", "cpf"] }, null)).toHaveLength(2);
  });
});
