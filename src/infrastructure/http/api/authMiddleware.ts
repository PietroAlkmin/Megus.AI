import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { fail } from "./result";

/**
 * Middleware de autenticação. Lê o token "Bearer <jwt>" do header Authorization,
 * valida, e injeta { userId, companyId } em req.auth.
 *
 * As rotas protegidas usam req.auth.companyId para filtrar dados — isolamento
 * de tenant. Sem token válido, responde 401 e não deixa passar.
 */

export interface AuthContext {
  userId: string;
  companyId: string;
  email: string;
}

// Estende o Request do Express com o nosso contexto de auth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function makeAuthMiddleware(jwtSecret: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      fail(res, "Não autenticado.", 401, "AUTH_MISSING_TOKEN");
      return;
    }

    try {
      const payload = jwt.verify(token, jwtSecret) as { sub: string; companyId: string; email: string };
      req.auth = { userId: payload.sub, companyId: payload.companyId, email: payload.email };
      next();
    } catch {
      fail(res, "Sessão expirada ou inválida.", 401, "AUTH_INVALID_TOKEN");
    }
  };
}