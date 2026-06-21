/**
 * Porta de validação CPF↔NOME.
 *
 * Hoje: MOCK. Futuro: fonte real (SERPRO DataValid, ou serviço pago tipo CPF.CNPJ,
 * Infosimples, Sintegra WS). A BrasilAPI NÃO tem endpoint de CPF (verificado).
 *
 * O dígito verificador é validado localmente no VO Cpf; ISTO confere o NOME ligado
 * ao CPF — é o que mata o erro de "CPF certo, pessoa errada".
 */
export interface CpfLookupResult {
  found: boolean;
  name: string | null; // nome ligado ao CPF na fonte (null se não encontrado)
}

export interface ICpfProvider {
  lookupName(cpfDigits: string): Promise<CpfLookupResult>;
}
