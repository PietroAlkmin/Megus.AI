import { DomainError } from "../../../domain/errors/DomainError";

/**
 * companyId ativo do usuário = a 1ª membership (mais antiga; o repo ordena por
 * createdAt). SEM fallback silencioso: um usuário sem membership é invariante
 * violada — todo `save` cria User+Company+Membership numa transação, e os seeds
 * também garantem a membership. Falhar ALTO aqui evita virar `companyId: ""`,
 * que com um predicado de tenant frouxo poderia abrir acesso indevido.
 */
export function resolveUserCompanyId(memberships: { companyId: string }[]): string {
  const companyId = memberships[0]?.companyId;
  if (!companyId) throw new DomainError("Usuário sem empresa vinculada.", "AUTH_NO_MEMBERSHIP");
  return companyId;
}
