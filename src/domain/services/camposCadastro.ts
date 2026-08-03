import type { Contact } from "../entities/Contact";

/**
 * Os campos que a clínica pode pedir no primeiro contato.
 *
 * Uma lista só, compartilhada entre o painel (que mostra as opções) e o prompt
 * (que pede). Duas listas separadas divergiriam no primeiro campo novo — e a
 * divergência apareceria como "marquei convênio e ela não pergunta".
 *
 * `peso` é o atrito da pergunta: endereço custa duas ou três mensagens, sexo
 * custa uma palavra. O painel mostra isso porque cada campo marcado é uma
 * pergunta a mais entre o paciente e o que ele veio buscar.
 */
export const CAMPOS_CADASTRO = [
  { k: "nome", rotulo: "Nome completo", peso: "leve" },
  { k: "cpf", rotulo: "CPF", peso: "leve" },
  { k: "nascimento", rotulo: "Data de nascimento", peso: "leve" },
  { k: "sexo", rotulo: "Sexo", peso: "leve" },
  { k: "email", rotulo: "E-mail", peso: "medio" },
  { k: "endereco", rotulo: "Endereço completo com CEP", peso: "pesado" },
  { k: "convenio", rotulo: "Convênio", peso: "medio" },
] as const;

export type CampoCadastro = (typeof CAMPOS_CADASTRO)[number]["k"];

/** O contato já tem este campo? `nome`/`cpf` moram no contato; o resto, na ficha. */
function jaTem(contact: Contact | null, k: string): boolean {
  if (!contact) return false;
  if (k === "nome") return Boolean(contact.fullName?.trim());
  if (k === "cpf") return Boolean(contact.cpf);
  if (k === "endereco") return Boolean(contact.ficha.endereco?.trim() || contact.ficha.cep?.trim());
  return Boolean((contact.ficha as Record<string, string | undefined>)[k]?.trim());
}

/**
 * O que AINDA FALTA pedir — rótulos prontos para o prompt.
 *
 * Só o que falta, nunca a lista inteira: repetir o que o paciente já respondeu
 * é o jeito mais rápido de ele desistir. Desligado ⇒ vazio ⇒ o bloco some do
 * prompt (o agente não pede nada por iniciativa própria).
 */
export function cadastroPendente(
  cadastro: { ligado: boolean; campos: string[] } | undefined,
  contact: Contact | null,
): string[] {
  if (!cadastro?.ligado) return [];
  return CAMPOS_CADASTRO.filter((c) => cadastro.campos.includes(c.k) && !jaTem(contact, c.k)).map((c) => c.rotulo);
}
