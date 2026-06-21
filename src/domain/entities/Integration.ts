/**
 * Integração = um cliente do Megus (ex.: o consultório de Alphaville).
 * Mapeia número de WhatsApp → cliente, e guarda a referência ao backend fiscal
 * (qual empresa/credencial no ERP). Enquanto o fiscal é MOCK, fiscalProviderRef = null.
 */
export interface Integration {
  id: string;
  displayName: string; // nome do cliente
  whatsappNumber: string; // número conectado (E.164)

  // Identidade fiscal do CLIENTE (prestador) — usada na conferência do comprovante e na emissão
  fiscalDoc: string; // CNPJ (ou CPF) do prestador
  fiscalName: string; // razão/nome do prestador

  // Referência opaca ao backend fiscal (ex.: companyId/apiKey no Kapty). null = mock.
  fiscalProviderRef: string | null;

  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
