import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ok, fail } from "../result";
import { DomainError } from "../../../../domain/errors/DomainError";
import type { RegisterUser } from "../../../../application/use-cases/auth/RegisterUser";
import type { LoginUser } from "../../../../application/use-cases/auth/LoginUser";
import type { IUserRepository } from "../../../../domain/ports/repositories";
import type { AuthContext } from "../authMiddleware";

export interface AuthRoutesDeps {
  registerUser: RegisterUser;
  loginUser: LoginUser;
  users: IUserRepository;
  authMiddleware: (req: any, res: any, next: any) => void;
}

const registerSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

export function authRoutes(deps: AuthRoutesDeps): Router {
  const r = Router();

  // POST /api/auth/register
  r.post("/register", async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    try {
      const out = await deps.registerUser.execute(parsed.data);
      ok(res, { userId: out.userId }, "Conta criada com sucesso.", 201);
    } catch (e) {
      handleError(res, e);
    }
  });

  // POST /api/auth/login
  r.post("/login", async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    try {
      const out = await deps.loginUser.execute(parsed.data);
      ok(res, out);
    } catch (e) {
      handleError(res, e);
    }
  });

  // GET /api/auth/me  (protegida)
  r.get("/me", deps.authMiddleware, async (req: Request, res: Response) => {
    const auth = req.auth as AuthContext;
    const user = await deps.users.findById(auth.userId);
    if (!user) {
      fail(res, "Usuário não encontrado.", 404, "NOT_FOUND");
      return;
    }
    ok(res, { id: user.id, email: user.email, companyId: user.companyId, displayName: user.displayName });
  });

  return r;
}

function handleError(res: Response, e: unknown): void {
  if (e instanceof DomainError) {
    // mapeia alguns códigos de domínio para status HTTP adequados
    const status = e.code === "AUTH_EMAIL_TAKEN" ? 409
      : e.code === "AUTH_INVALID_CREDENTIALS" ? 401
      : 400;
    fail(res, e.message, status, e.code);
    return;
  }
  console.error("[auth] erro inesperado:", e);
  fail(res, "Erro interno. Tente novamente.", 500, "INTERNAL");
}