/**
 * Perfil cadastral da empresa (clínica) — dados que a tela "Empresa" edita.
 * Separado da Integration (que cuida do fluxo de WhatsApp) para não afetar o
 * que já roda. Ligado por companyId (o mesmo do token do usuário = tenant).
 *
 * Inclui os dados de cobrança (Pix) usados nas mensagens de pagamento.
 */
export interface CompanyProfile {
  companyId: string; // chave — liga ao tenant

  // cadastrais
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoMunicipal: string;
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  cidade: string;
  uf: string;

  // cobrança (Pix)
  pixTipo: string; // cpf | cnpj | telefone | email | aleatoria
  pixChave: string;
  instrucoesPagamento: string;

  updatedAt: Date;
}