import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import type { IUserRepository } from "../../../domain/ports/repositories";
import type { User } from "../../../domain/entities/User";

/**
 * Repositório de usuários usando Prisma (banco real).
 *
 * Reconciliação com o schema real:
 *  - a tabela User NÃO tem companyId; o vínculo vem da tabela Membership.
 *  - por isso, ao ler um usuário, buscamos também a Membership dele para
 *    descobrir o companyId, e montamos o objeto User que o resto do código espera.
 *  - ao criar um usuário (save de um user novo), criamos User + Company + Membership
 *    numa transação, para respeitar o modelo real.
 *
 * O campo displayName do domínio mapeia para a coluna `name` do banco.
 */
export class PrismaUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const row = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { Membership: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await prisma.user.findUnique({
      where: { id },
      include: { Membership: true },
    });
    return row ? this.toDomain(row) : null;
  }

  async save(user: User): Promise<void> {
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      include: { Membership: true },
    });

    if (existing) {
      // atualização simples dos campos do próprio User
      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: user.displayName ?? existing.name,
          email: user.email.toLowerCase(),
          passwordHash: user.passwordHash,
          updatedAt: new Date(),
        },
      });
      return;
    }

    // usuário novo: cria User + Company + Membership numa transação.
    // (tx tipado como any: o tipo exato do client transacional varia por versão
    //  do Prisma; usamos só .user/.company/.membership, que existem sempre.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      await tx.user.create({
        data: {
          id: user.id,
          name: user.displayName ?? user.email.split("@")[0],
          email: user.email.toLowerCase(),
          passwordHash: user.passwordHash,
          updatedAt: new Date(),
        },
      });

      // garante a Company do tenant (companyId veio do caso de uso)
      const company = await tx.company.findUnique({ where: { id: user.companyId } });
      if (!company) {
        await tx.company.create({
          data: {
            id: user.companyId,
            name: user.displayName ? `Empresa de ${user.displayName}` : "Minha empresa",
            fiscalDoc: "",
            fiscalName: "",
            updatedAt: new Date(),
          },
        });
      }

      await tx.membership.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          companyId: user.companyId,
          role: "owner",
        },
      });
    });
  }

  // Converte a linha do banco (User + Membership) no User do domínio.
  private toDomain(row: {
    id: string; name: string; email: string; passwordHash: string | null;
    createdAt: Date; updatedAt: Date;
    Membership: { companyId: string }[];
  }): User {
    const companyId = row.Membership[0]?.companyId ?? "";
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash ?? "",
      companyId,
      displayName: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}