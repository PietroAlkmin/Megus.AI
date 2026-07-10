import jwt from "jsonwebtoken";
import type { IMembershipRepository, IUserRepository } from "../../../domain/ports/repositories";
import { DomainError } from "../../../domain/errors/DomainError";

export interface SwitchCompanyInput {
  userId: string;
  companyId: string;
}

export interface SwitchCompanyOutput {
  accessToken: string;
  expiresAtUtc: string;
  user: { id: string; email: string; companyId: string; displayName: string | null };
}

export interface SwitchCompanyDeps {
  users: IUserRepository;
  memberships: IMembershipRepository;
  jwtSecret: string;
  /** validade do token em segundos (default 1h — igual ao LoginUser) */
  tokenTtlSeconds?: number;
}

/**
 * Troca a empresa ativa do usuário logado (seletor do painel): valida a
 * membership e re-emite o JWT com o novo companyId. Como TODO o isolamento de
 * tenant lê o companyId do token, trocar de empresa = trocar de token — nenhuma
 * rota precisa mudar. (Padrão do seletor da Kapty, adaptado ao tenant-no-JWT.)
 */
export class SwitchCompany {
  constructor(private readonly deps: SwitchCompanyDeps) {}

  async execute(input: SwitchCompanyInput): Promise<SwitchCompanyOutput> {
    const user = await this.deps.users.findById(input.userId);
    if (!user) throw new DomainError("Usuário não encontrado.", "AUTH_USER_NOT_FOUND");

    const member = await this.deps.memberships.isMember(input.userId, input.companyId);
    if (!member) throw new DomainError("Você não tem acesso a esta empresa.", "AUTH_COMPANY_FORBIDDEN");

    const ttl = this.deps.tokenTtlSeconds ?? 3600;
    const accessToken = jwt.sign(
      { sub: user.id, companyId: input.companyId, email: user.email },
      this.deps.jwtSecret,
      { expiresIn: ttl },
    );
    const expiresAtUtc = new Date(Date.now() + ttl * 1000).toISOString();

    return {
      accessToken,
      expiresAtUtc,
      user: { id: user.id, email: user.email, companyId: input.companyId, displayName: user.displayName },
    };
  }
}
