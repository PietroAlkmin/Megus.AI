import type { EmissionIntent } from "../entities/EmissionIntent";

/**
 * Porta de BACKEND FISCAL — abstrai a emissão de NFS-e e o cadastro do cliente.
 *
 * Hoje: MOCK (a startup não fala com a Kapty por ora).
 * Futuro: adapter Kapty (via X-API-KEY/ThirdPartyIntegration) ou outro ERP.
 *
 * A IA NUNCA implementa isto. A emissão é DETERMINÍSTICA e recebe dados já validados.
 */
export interface FiscalEmissionResult {
  success: boolean;
  fiscalKey: string | null;
  pdfUrl: string | null;
  message: string | null;
}

export interface UpsertCustomerInput {
  integrationRef: string | null; // referência opaca ao tenant no ERP (null = mock)
  name: string;
  cpf: string; // 11 dígitos, validado
  whatsapp: string;
}

export interface UpsertCustomerResult {
  customerId: string;
  created: boolean; // false = já existia (dedup por CPF)
}

export interface IFiscalProvider {
  /** Emite a NFS-e a partir de um EmissionIntent JÁ validado. */
  emitNfse(intent: EmissionIntent): Promise<FiscalEmissionResult>;
  /** Cria ou reaproveita (dedup por CPF) o cliente no backend fiscal. */
  upsertCustomer(input: UpsertCustomerInput): Promise<UpsertCustomerResult>;
}
