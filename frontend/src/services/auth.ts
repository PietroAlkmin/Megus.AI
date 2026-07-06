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
