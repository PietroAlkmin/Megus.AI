import { useQuery, useQueryClient } from "@tanstack/react-query";
import Brand from "@/components/Brand";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as authService from "@/services/auth";
import { ApiError } from "@/lib/api";
import { Bot, Building2, LogOut, MessageSquare, MessagesSquare, Receipt, Zap } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

// Empresa e Agente entram nesta etapa (Task 2 — onboarding) com rota própria.
// Integrações: canal (WhatsApp) + ferramentas do agente (agenda/Google Calendar).
const NAV_ITEMS = [
  { id: "atendimentos", label: "Atendimentos", icon: MessageSquare, to: "/atendimentos" as const },
  { id: "conversas", label: "Conversas", icon: MessagesSquare, to: "/conversas" as const },
  { id: "cobrancas", label: "Cobranças", icon: Receipt, to: "/cobrancas" as const },
  { id: "integracoes", label: "Integrações", icon: Zap, to: "/integracoes" as const },
  { id: "agente", label: "Agente", icon: Bot, to: "/agente" as const },
  { id: "empresa", label: "Empresa", icon: Building2, to: "/empresa" as const },
] as const;

export default function Shell() {
  const { user, switchCompany, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Empresas a que o usuário tem acesso (seletor). Vem ordenado por nome do backend.
  const empresasQuery = useQuery({ queryKey: ["auth", "empresas"], queryFn: authService.empresas });
  const empresas = empresasQuery.data ?? [];
  const empresaAtual = empresas.find((e) => e.id === user?.companyId);

  async function handleTrocarEmpresa(companyId: string) {
    if (companyId === user?.companyId) return;
    try {
      await switchCompany(companyId);
      // Token novo = tenant novo: zera o cache pra tudo refazer sob a nova empresa.
      queryClient.clear();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível trocar de empresa.");
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="z-30 flex h-[68px] shrink-0 items-center gap-3.5 border-b border-border bg-card px-5">
        <Brand />
        <span className="h-[30px] w-px shrink-0 bg-border" />
        <div className="flex flex-col gap-0.5 leading-tight">
          <span className="text-[13.5px] font-bold text-foreground">{user?.displayName ?? user?.email ?? "—"}</span>
          {empresas.length > 1 ? (
            <Select value={user?.companyId ?? ""} onValueChange={handleTrocarEmpresa}>
              <SelectTrigger className="h-6 w-auto gap-1 border-none bg-transparent px-0 py-0 text-[11.5px] font-medium text-muted-foreground shadow-none hover:text-foreground focus:ring-0 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5">
                <Building2 className="h-3.5 w-3.5" />
                <SelectValue placeholder="Escolher empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : empresaAtual ? (
            <span className="text-[10.5px] text-muted-foreground">{empresaAtual.name}</span>
          ) : null}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="z-10 flex w-[72px] shrink-0 flex-col border-r border-border bg-secondary/60">
          <nav className="flex flex-1 flex-col gap-1 p-1.5 pt-2.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              // (Todos os itens têm rota hoje; o padrão de item "em breve" —
              // botão desabilitado — saiu junto com a última reserva, Integrações.)
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  title={item.label}
                  className="flex flex-col items-center justify-center gap-1 rounded-md py-2"
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-[9px] transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-[0_4px_14px_rgba(27,35,48,0.3)]"
                            : "text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                      </span>
                      <span className={cn("text-[10px] font-bold", isActive ? "text-primary" : "text-muted-foreground")}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-background">
          <div key={location.pathname} className="animate-in fade-in slide-in-from-bottom-2 duration-700">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
