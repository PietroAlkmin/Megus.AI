import { randomUUID } from "node:crypto";
import type { EmissionIntent } from "../../domain/entities/EmissionIntent";
import type {
  FiscalEmissionResult,
  IFiscalProvider,
  UpsertCustomerInput,
  UpsertCustomerResult,
} from "../../domain/ports/IFiscalProvider";

/**
 * MOCK do backend fiscal (a startup não fala com a Kapty por ora).
 *
 * - emitNfse: devolve uma chave/PDF FAKE como se a NFS-e tivesse sido emitida.
 * - upsertCustomer: dedup em memória por CPF.
 *
 * Trocar por KaptyFiscalProvider (X-API-KEY/ThirdPartyIntegration) depois — mesma porta.
 */
export class MockFiscalProvider implements IFiscalProvider {
  private readonly customersByCpf = new Map<string, string>();

  async emitNfse(intent: EmissionIntent): Promise<FiscalEmissionResult> {
    const fiscalKey = `MOCK${Date.now()}${intent.tomadorCpf}`.slice(0, 44);
    return {
      success: true,
      fiscalKey,
      pdfUrl: `mock://nfse/${fiscalKey}.pdf`,
      message: "NFS-e MOCK emitida (nenhuma nota fiscal real foi gerada).",
    };
  }

  async upsertCustomer(input: UpsertCustomerInput): Promise<UpsertCustomerResult> {
    const existing = this.customersByCpf.get(input.cpf);
    if (existing) return { customerId: existing, created: false };
    const customerId = randomUUID();
    this.customersByCpf.set(input.cpf, customerId);
    return { customerId, created: true };
  }
}
