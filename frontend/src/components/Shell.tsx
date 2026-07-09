import { NavLink, Outlet, useNavigate } from "react-router-dom";
import Brand from "@/components/Brand";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Bot, Building2, LogOut, MessageSquare, MessagesSquare, Receipt, Users, Zap } from "lucide-react";

// Empresa e Agente entram nesta etapa (Task 2 — onboarding) com rota própria.
// Integrações segue reservada para o próximo canal além do WhatsApp.
const NAV_ITEMS = [
  { id: "inicio", label: "Início", icon: Users, to: "/" as const },
  { id: "atendimentos", label: "Atendimentos", icon: MessageSquare, to: "/atendimentos" as const },
  { id: "conversas", label: "Conversas", icon: MessagesSquare, to: "/conversas" as const },
  { id: "empresa", label: "Empresa", icon: Building2, to: "/empresa" as const },
  { id: "agente", label: "Agente", icon: Bot, to: "/agente" as const },
  { id: "integracoes", label: "Integrações", icon: Zap, to: null },
  { id: "cobrancas", label: "Cobranças", icon: Receipt, to: "/cobrancas" as const },
] as const;

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      <header className="z-30 flex h-[68px] shrink-0 items-center gap-3.5 border-b border-border bg-card px-5">
        <Brand />
        <span className="h-[30px] w-px shrink-0 bg-border" />
        <div className="flex flex-col leading-tight">
          <span className="text-[13.5px] font-bold text-foreground">{user?.displayName ?? user?.email ?? "—"}</span>
          <span className="text-[10.5px] text-muted-foreground">Empresa {user?.companyId?.slice(0, 8) ?? "—"}</span>
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

              if (!item.to) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled
                    title={`${item.label} (em breve)`}
                    className="flex flex-col items-center justify-center gap-1 rounded-md py-2 disabled:cursor-default"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-[9px] text-muted-foreground/50">
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground/50">{item.label}</span>
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.to === "/"}
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
