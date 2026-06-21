/**
 * Value Object: CPF do paciente/tomador.
 *
 * A validação de dígito verificador é portada (verificada) de
 * Kapty.WebStatic/src/utils/brDocuments.ts → isValidCPF.
 *
 * IMPORTANTE: isto valida apenas que o CPF é um número VÁLIDO (formato + dígito).
 * Validar CPF↔NOME (a parte que mata o erro de cadastro) NÃO está aqui — é uma
 * fonte externa, atrás da porta ICpfProvider.
 */
export class Cpf {
  static readonly LENGTH = 11;

  private constructor(public readonly digits: string) {}

  static onlyDigits(raw: string): string {
    return (raw ?? "").replace(/\D/g, "");
  }

  static isValid(raw: string): boolean {
    const clean = Cpf.onlyDigits(raw);
    if (clean.length !== Cpf.LENGTH || /^(\d)\1+$/.test(clean)) return false;

    let add = 0;
    for (let i = 0; i < 9; i += 1) add += Number(clean[i]) * (10 - i);
    let rev = 11 - (add % 11);
    if (rev >= 10) rev = 0;
    if (rev !== Number(clean[9])) return false;

    add = 0;
    for (let i = 0; i < 10; i += 1) add += Number(clean[i]) * (11 - i);
    rev = 11 - (add % 11);
    if (rev >= 10) rev = 0;
    return rev === Number(clean[10]);
  }

  /** Retorna o VO se válido, senão null. Nunca lança. */
  static tryCreate(raw: string): Cpf | null {
    const clean = Cpf.onlyDigits(raw);
    return Cpf.isValid(clean) ? new Cpf(clean) : null;
  }

  format(): string {
    const d = this.digits;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  equals(other: Cpf): boolean {
    return this.digits === other.digits;
  }
}
