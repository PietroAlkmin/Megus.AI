/**
 * Value Object: número de WhatsApp/telefone, normalizado para E.164 (Brasil por default).
 * É a identidade do contato no canal — agnóstico de provedor.
 */
export class PhoneNumber {
  private constructor(public readonly e164: string) {}

  static tryCreate(raw: string): PhoneNumber | null {
    const digits = (raw ?? "").replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return null;
    const withCc = digits.startsWith("55") ? digits : `55${digits}`;
    return new PhoneNumber(`+${withCc}`);
  }

  get digits(): string {
    return this.e164.replace(/\D/g, "");
  }

  equals(other: PhoneNumber): boolean {
    return this.e164 === other.e164;
  }
}
