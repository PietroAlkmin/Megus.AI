import { apiFetch, clearToken, getToken, setToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  companyId: string;
  displayName: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  expiresAtUtc: string;
  user: AuthUser;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName?: string;
}

export interface RegisterResult {
  userId: string;
  companyId: string;
}

/** POST /api/auth/login — guarda o accessToken no localStorage em caso de sucesso. */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("POST", "/api/auth/login", payload);
  setToken(result.accessToken);
  return result;
}

/** POST /api/auth/register — não autentica sozinho; o fluxo segue para /login. */
export async function register(payload: RegisterPayload): Promise<RegisterResult> {
  return apiFetch<RegisterResult>("POST", "/api/auth/register", payload);
}

/** Uma empresa a que o usuário tem acesso (seletor do topo). */
export interface EmpresaRef {
  id: string;
  name: string;
}

/** GET /api/auth/empresas — empresas do usuário logado, ordenadas por nome. */
export async function empresas(): Promise<EmpresaRef[]> {
  return apiFetch<EmpresaRef[]>("GET", "/api/auth/empresas");
}

/**
 * POST /api/auth/trocar-empresa — troca o tenant ativo. O backend re-emite o
 * token com o novo companyId; guardamos o token novo e devolvemos o user.
 */
export async function trocarEmpresa(companyId: string): Promise<LoginResult> {
  const result = await apiFetch<LoginResult>("POST", "/api/auth/trocar-empresa", { companyId });
  setToken(result.accessToken);
  return result;
}

/** GET /api/auth/me — dados do usuário logado (token Bearer via lib/api). */
export async function me(): Promise<AuthUser> {
  return apiFetch<AuthUser>("GET", "/api/auth/me");
}

/** Apenas limpa o token local — não há endpoint de logout no backend (JWT stateless). */
export function logout(): void {
  clearToken();
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}
