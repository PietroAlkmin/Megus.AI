import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import * as authService from "@/services/auth";
import { getToken } from "@/lib/api";

export interface AuthContextValue {
  user: authService.AuthUser | null;
  /** true enquanto valida o token existente (GET /me) na carga da página. */
  isLoading: boolean;
  login: (payload: authService.LoginPayload) => Promise<void>;
  register: (payload: authService.RegisterPayload) => Promise<authService.RegisterResult>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<authService.AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Na carga da página, se já existe token no localStorage, valida contra
  // GET /api/auth/me. Token inválido/expirado → limpa e cai pra tela de login.
  useEffect(() => {
    let active = true;

    async function loadUser() {
      if (!getToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const currentUser = await authService.me();
        if (active) setUser(currentUser);
      } catch {
        authService.logout();
        if (active) setUser(null);
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (payload: authService.LoginPayload) => {
    const result = await authService.login(payload);
    setUser(result.user);
  }, []);

  const register = useCallback(async (payload: authService.RegisterPayload) => {
    return authService.register(payload);
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>;
}
