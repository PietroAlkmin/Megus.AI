/**
 * Perfil da empresa (clínica) — ALINHADO à tabela Company do Azure.
 * Mesmos nomes de campo do banco, para trocar entre in-memory e Prisma sem tradução.
 * Ligado por companyId (= id da Company; o mesmo do token do usuário = tenant).
 */
export interface CompanyProfile {
  companyId: string; // = Company.id

  // cadastrais (nomes iguais aos do Azure)
  name: string;                  // nome fantasia
  fiscalName: string;            // razão social
  fiscalDoc: string;             // CNPJ
  municipalRegistration: string; // inscrição municipal
  email: string;
  phone: string;
  zip: string;
  address: string;
  city: string;
  state: string;

  // cobrança (Pix)
  //
  // Duas chaves porque a clínica recebe em contas diferentes conforme o paciente
  // peça ou não nota fiscal. A DESCRIÇÃO existe porque a chave sozinha não diz
  // nada ao agente — "28756…" é só um número; a descrição é o que permite ele
  // dizer ao paciente para onde está mandando.
  pixType: string;               // cpf | cnpj | phone | email | aleatoria
  pixKey: string;
  pixDescricao: string;
  /** Chave de quem PRECISA de nota. Vazia ⇒ usa a principal para todo mundo. */
  pixTypeNota: string;
  pixKeyNota: string;
  pixDescricaoNota: string;
  paymentInstructions: string;

  updatedAt: Date;
}