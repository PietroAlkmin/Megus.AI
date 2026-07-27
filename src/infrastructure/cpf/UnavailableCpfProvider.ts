import type { CpfLookupResult, ICpfProvider } from "../../domain/ports/ICpfProvider";

/**
 * Fail-closed enquanto o provedor oficial de CPF não está integrado. Evita que
 * dados de demonstração sejam aceitos em produção como identidade real.
 */
export class UnavailableCpfProvider implements ICpfProvider {
  async lookupName(): Promise<CpfLookupResult> {
    return { found: false, name: null };
  }
}
