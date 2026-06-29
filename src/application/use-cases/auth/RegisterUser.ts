import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { IUserRepository } from "../../../domain/ports/repositories";
import { DomainError } from "../../../domain/errors/DomainError";

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string | null;
  /** Se não vier, cria uma empresa nova (companyId) para este usuário. */
  companyId?: string;
}

export interface RegisterOutput {
  userId: string;
  companyId: string;
}

/**
 * Cria uma conta. Regras:
 *  - e-mail único (não pode haver dois usuários com o mesmo e-mail);
 *  - senha com no mínimo 6 caracteres, guardada só como hash (bcrypt);
 *  - se nenhum companyId for informado, gera um novo (a empresa nasce com o 1º usuário).
 */
export class RegisterUser {
  constructor(private readonly users: IUserRepository) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new DomainError("E-mail é obrigatório.", "AUTH_EMAIL_REQUIRED");
    if (!input.password || input.password.length < 6)
      throw new DomainError("A senha precisa ter ao menos 6 caracteres.", "AUTH_WEAK_PASSWORD");

    const existing = await this.users.findByEmail(email);
    if (existing) throw new DomainError("Já existe uma conta com este e-mail.", "AUTH_EMAIL_TAKEN");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const companyId = input.companyId ?? randomUUID();
    const now = new Date();

    const user = {
      id: randomUUID(),
      email,
      passwordHash,
      companyId,
      displayName: input.displayName ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.users.save(user);

    return { userId: user.id, companyId };
  }
}