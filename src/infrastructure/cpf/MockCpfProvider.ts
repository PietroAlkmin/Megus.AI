import type { CpfLookupResult, ICpfProvider } from "../../domain/ports/ICpfProvider";

/**
 * MOCK do provider de CPF↔nome (para segunda).
 *
 * Mantém um mapa em memória CPF(11 dígitos) → nome. Permite demonstrar o caminho
 * feliz (nome bate) e o de erro (nome não bate / não encontrado) sem depender de
 * fonte externa paga. Trocar por SerproCpfProvider depois (mesma porta).
 */
export class MockCpfProvider implements ICpfProvider {
  private readonly seed: Map<string, string>;

  constructor(seed: Record<string, string> = {}) {
    this.seed = new Map(Object.entries(seed));
  }

  async lookupName(cpfDigits: string): Promise<CpfLookupResult> {
    const name = this.seed.get(cpfDigits);
    return name ? { found: true, name } : { found: false, name: null };
  }
}
