// Camada única de acesso HTTP ao backend Megus. Mesma convenção do
// apiClient.js do wireframe, promovida a TS: base em `VITE_API_URL`, Bearer
// do localStorage quando houver, envelope `ResultResponse` desembrulhado.

// Em produção (Vercel) a env fica vazia → base relativa "" → as chamadas batem
// em /api/* na mesma origem, e o vercel.json faz proxy pro backend (evita o
// bloqueio de mixed-content HTTPS→HTTP). Em dev, o .env aponta direto pro backend.
const API_URL = import.meta.env.VITE_API_URL ?? "";
const TOKEN_KEY = "megus_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Espelha o `ResultResponse<T>` do backend (`src/infrastructure/http/api/result.ts`). */
export interface ResultResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  errors: string[] | null;
  correlationId?: string | null;
  statusCode?: number | null;
}

export class ApiError extends Error {
  readonly errors: string[] | null;
  readonly statusCode: number | null;

  constructor(message: string, errors: string[] | null = null, statusCode: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.errors = errors;
    this.statusCode = statusCode;
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Chama `${VITE_API_URL}${path}` e devolve `data` já desembrulhado do
 * envelope `ResultResponse`. Em falha (rede, JSON inválido ou
 * `success: false`), lança `ApiError` — quem chama trata com try/catch
 * (formulários) ou deixa o @tanstack/react-query capturar.
 */
export async function apiFetch<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
  }

  const text = await response.text();
  let json: ResultResponse<T> | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as ResultResponse<T>;
    } catch {
      throw new ApiError("Resposta inválida do servidor.", null, response.status);
    }
  }

  if (!json) {
    if (!response.ok) {
      throw new ApiError(`Falha na requisição (${response.status}).`, null, response.status);
    }
    return null as T;
  }

  if (!json.success) {
    throw new ApiError(
      json.message ?? json.errors?.[0] ?? `Falha na requisição (${response.status}).`,
      json.errors ?? null,
      json.statusCode ?? response.status,
    );
  }

  return json.data as T;
}
