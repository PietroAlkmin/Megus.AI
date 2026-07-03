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
  pixType: string;               // cpf | cnpj | phone | email | aleatoria
  pixKey: string;
  paymentInstructions: string;

  updatedAt: Date;
}