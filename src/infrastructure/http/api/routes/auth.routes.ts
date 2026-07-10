import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ok, fail } from "../result";
import { DomainError } from "../../../../domain/errors/DomainError";
import type { RegisterUser } from "../../../../application/use-cases/auth/RegisterUser";
import type { LoginUser } from "../../../../application/use-cases/auth/LoginUser";
import type { SwitchCompany } from "../../../../application/use-cases/auth/SwitchCompany";
import type { IMembershipRepository, IUserRepository } from "../../../../domain/ports/repositories";
import type { AuthContext } from "../authMiddleware";
import bcrypt from "bcryptjs";

export interface AuthRoutesDeps {
  registerUser: RegisterUser;
  loginUser: LoginUser;
  switchCompany: SwitchCompany;
  users: IUserRepository;
  memberships: IMembershipRepository;
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

const perfilSchema = z.object({
  displayName: z.string().min(1, "Informe o nome."),
});

const senhaSchema = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual."),
  senhaNova: z.string().min(6, "A nova senha precisa ter ao menos 6 caracteres."),
});

const trocarEmpresaSchema = z.object({
  companyId: z.string().min(1, "Informe a empresa."),
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
    // companyId do TOKEN (não da 1ª membership): preserva a empresa escolhida
    // no seletor mesmo após refresh da página.
    ok(res, { id: user.id, email: user.email, companyId: auth.companyId, displayName: user.displayName });
  });

  // GET /api/auth/empresas — empresas a que o usuário tem acesso (seletor do painel)
  r.get("/empresas", deps.authMiddleware, async (req: Request, res: Response) => {
    const auth = req.auth as AuthContext;
    const empresas = await deps.memberships.listCompaniesByUserId(auth.userId);
    ok(res, [...empresas].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  });

  // POST /api/auth/trocar-empresa — re-emite o token com o novo tenant (protegida)
  r.post("/trocar-empresa", deps.authMiddleware, async (req: Request, res: Response) => {
    const auth = req.auth as AuthContext;
    const parsed = trocarEmpresaSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    try {
      const out = await deps.switchCompany.execute({ userId: auth.userId, companyId: parsed.data.companyId });
      ok(res, out, "Empresa alterada.");
    } catch (e) {
      handleError(res, e);
    }
  });

  // PUT /api/auth/perfil — edita o nome do usuário (protegida)
  r.put("/perfil", deps.authMiddleware, async (req: Request, res: Response) => {
    const auth = req.auth as AuthContext;
    const parsed = perfilSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    const user = await deps.users.findById(auth.userId);
    if (!user) { fail(res, "Usuário não encontrado.", 404, "NOT_FOUND"); return; }

    user.displayName = parsed.data.displayName;
    user.updatedAt = new Date();
    await deps.users.save(user);
    ok(res, { id: user.id, email: user.email, displayName: user.displayName }, "Perfil atualizado.");
  });

  // PUT /api/auth/senha — troca a senha (protegida)
  r.put("/senha", deps.authMiddleware, async (req: Request, res: Response) => {
    const auth = req.auth as AuthContext;
    const parsed = senhaSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, parsed.error.issues[0]?.message ?? "Dados inválidos.", 400, "VALIDATION");
      return;
    }
    const user = await deps.users.findById(auth.userId);
    if (!user) { fail(res, "Usuário não encontrado.", 404, "NOT_FOUND"); return; }

    const ok1 = await bcrypt.compare(parsed.data.senhaAtual, user.passwordHash);
    if (!ok1) { fail(res, "Senha atual incorreta.", 400, "AUTH_WRONG_PASSWORD"); return; }

    user.passwordHash = await bcrypt.hash(parsed.data.senhaNova, 10);
    user.updatedAt = new Date();
    await deps.users.save(user);
    ok(res, { ok: true }, "Senha alterada com sucesso.");
  });

  return r;
}

function handleError(res: Response, e: unknown): void {
  if (e instanceof DomainError) {
    // mapeia alguns códigos de domínio para status HTTP adequados
    const status = e.code === "AUTH_EMAIL_TAKEN" ? 409
      : e.code === "AUTH_INVALID_CREDENTIALS" ? 401
      : e.code === "AUTH_COMPANY_FORBIDDEN" ? 403
      : e.code === "AUTH_USER_NOT_FOUND" ? 404
      : 400;
    fail(res, e.message, status, e.code);
    return;
  }
  console.error("[auth] erro inesperado:", e);
  fail(res, "Erro interno. Tente novamente.", 500, "INTERNAL");
}