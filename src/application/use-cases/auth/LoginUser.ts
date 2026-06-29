import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { IUserRepository } from "../../../domain/ports/repositories";
import { DomainError } from "../../../domain/errors/DomainError";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  accessToken: string;
  expiresAtUtc: string;
  user: { id: string; email: string; companyId: string; displayName: string | null };
}

export interface LoginDeps {
  users: IUserRepository;
  jwtSecret: string;
  /** validade do token em segundos (default 1h) */
  tokenTtlSeconds?: number;
}

/**
 * Autentica e devolve um token JWT que carrega o userId e o companyId.
 * As rotas protegidas leem o companyId do token — base do isolamento de tenant.
 *
 * Mensagem de erro genérica de propósito ("e-mail ou senha inválidos"): não
 * revelar se foi o e-mail ou a senha que errou (evita enumerar contas).
 */
export class LoginUser {
  constructor(private readonly deps: LoginDeps) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const email = input.email.trim().toLowerCase();
    const user = await this.deps.users.findByEmail(email);
    const genericError = new DomainError("E-mail ou senha inválidos.", "AUTH_INVALID_CREDENTIALS");

    if (!user) {
      // mesmo custo de tempo de um usuário existente, para não vazar por timing
      await bcrypt.compare(input.password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv");
      throw genericError;
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw genericError;

    const ttl = this.deps.tokenTtlSeconds ?? 3600;
    const accessToken = jwt.sign(
      { sub: user.id, companyId: user.companyId, email: user.email },
      this.deps.jwtSecret,
      { expiresIn: ttl },
    );
    const expiresAtUtc = new Date(Date.now() + ttl * 1000).toISOString();

    return {
      accessToken,
      expiresAtUtc,
      user: { id: user.id, email: user.email, companyId: user.companyId, displayName: user.displayName },
    };
  }
}