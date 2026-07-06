import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getToken } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** Protege rotas: sem token → /login imediatamente; com token, aguarda o /me antes de renderizar. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
