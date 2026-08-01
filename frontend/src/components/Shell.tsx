import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Building2,
  Check,
  ChevronsUpDown,
  CreditCard,
  Home,
  LogOut,
  MessagesSquare,
  PlugZap,
  Settings,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Brand from "@/components/Brand";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as authService from "@/services/auth";
import * as conversasService from "@/services/conversas";
import * as whatsappService from "@/services/whatsapp";

/**
 * Navegação em dois grupos — a divisão responde a "com que frequência eu abro isto?".
 *
 *   Operação    — o dia a dia, aberto toda hora (Hoje, Conversas, Financeiro)
 *   Configuração— o que se ajusta e esquece (Agentes, Clínica, Integrações)
 *
 * A tela "Atendimentos" saiu: era uma lista de agentes com métricas que Conversas
 * e Agentes já cobriam melhor, cada uma no seu recorte.
 */
/**
 * Entrada da navegação. O discriminante `tipo` é obrigatório: sem ele o TS não
 * consegue estreitar entre separador e item, e todo `item.to` vira erro.
 */
type NavEntry =
  | { tipo: "grupo"; grupo: string }
  | { tipo: "item"; id: string; label: string; icon: LucideIcon; to: string; bolha?: boolean };

const NAV: NavEntry[] = [
  { tipo: "grupo", grupo: "Operação" },
  { tipo: "item", id: "hoje", label: "Hoje", icon: Home, to: "/" },
  { tipo: "item", id: "conversas", label: "Conversas", icon: MessagesSquare, to: "/conversas", bolha: true },
  { tipo: "item", id: "financeiro", label: "Financeiro", icon: CreditCard, to: "/financeiro" },
  { tipo: "grupo", grupo: "Configuração" },
  { tipo: "item", id: "agentes", label: "Agentes", icon: Bot, to: "/agentes" },
  { tipo: "item", id: "clinica", label: "Clínica", icon: Building2, to: "/clinica" },
  { tipo: "item", id: "integracoes", label: "Integrações", icon: Zap, to: "/integracoes" },
];

type NavItem = Extract<NavEntry, { tipo: "item" }>;
const ITENS = NAV.filter((n): n is NavItem => n.tipo === "item");
const ABAS = ITENS.slice(0, 3);   // Operação → abas fixas
const EXTRAS = ITENS.slice(3);    // Configuração → folha "Mais"

export default function Shell() {
  const [maisAberto, setMaisAberto] = useState(false);
  const { user, switchCompany, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const empresasQuery = useQuery({ queryKey: ["auth", "empresas"], queryFn: authService.empresas });
  const empresas = empresasQuery.data ?? [];
  const empresaAtual = empresas.find((e) => e.id === user?.companyId);

  // Bolha de Conversas = quantas esperam decisão humana. É o número que faz o
  // usuário abrir o painel, então vive na navegação e não só dentro da tela.
  const conversasQuery = useQuery({
    queryKey: ["conversas", "aguardando"],
    queryFn: () => conversasService.listConversas("todos"),
    select: (lista) => lista.filter((c) => c.status === "AGUARDANDO").length,
    refetchInterval: 60_000,
  });
  const aguardando = conversasQuery.data ?? 0;

  /**
   * Aviso de queda do WhatsApp — em TODAS as telas, não só em Integrações.
   *
   * A clínica ficou 3 dias com o número desconectado sem ninguém perceber: o
   * cartão de ativação some quando a ativação termina, e nada mais falava do
   * assunto. `number` preenchido com `connected: false` é a assinatura exata de
   * "estava pareado e caiu" — clínica que nunca pareou não vê aviso nenhum,
   * senão o alerta viraria paisagem no primeiro dia.
   */
  const whatsappQuery = useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: whatsappService.status,
    refetchInterval: 60_000,
  });
  const caiu = whatsappQuery.data?.connected === false && Boolean(whatsappQuery.data.number);

  useEffect(() => {
    if (!menuAberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [menuAberto]);

  async function handleTrocarEmpresa(companyId: string) {
    if (companyId === user?.companyId) return;
    try {
      await switchCompany(companyId);
      queryClient.clear(); // token novo = tenant novo: nada de cache antigo
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível trocar de empresa.");
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const inicial = (user?.displayName ?? user?.email ?? "?").charAt(0).toUpperCase();

  // Numa tela de Configuração, a aba acesa no celular é "Mais".
  const naFolha =
    EXTRAS.some((n) => n.to === location.pathname) || location.pathname.startsWith("/conta");

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar grafite. Três modos, porque parte da clínica usa iPad e celular:
            ≥1024  barra completa (rótulos)
            768+   trilho de ícones de 68px — o iPad em retrato não paga 216px de menu
            <768   some; a navegação vira barra superior + abas embaixo */}
      <aside className="hidden shrink-0 flex-col bg-primary p-2 pt-3 md:flex md:w-[68px] md:items-center lg:w-[216px] lg:items-stretch lg:p-3 lg:pt-4">
        {/* A marca é o caminho de volta para Hoje — atalho que todo produto tem */}
        <NavLink
          to="/"
          className="mb-3 flex items-center justify-center gap-2.5 rounded-[10px] p-2 transition-colors hover:bg-white/[0.07] lg:mb-3.5 lg:justify-start lg:px-2 lg:py-1.5"
          title="Ir para Hoje"
        >
          <Brand fundo="escuro" size="md" semPalavra className="lg:hidden" />
          <span className="hidden lg:block">
            <Brand fundo="escuro" size="md" />
          </span>
        </NavLink>

        {/* Empresa ativa — separada da navegação: é contexto, não destino */}
        {empresas.length > 1 ? (
          <Select value={user?.companyId ?? ""} onValueChange={handleTrocarEmpresa}>
            <SelectTrigger className="mb-3 h-11 gap-2 rounded-[10px] border-white/10 bg-white/[0.06] px-2 text-left text-[12.5px] font-semibold text-white shadow-none hover:bg-white/10 focus:ring-0 focus:ring-offset-0 lg:px-2.5 [&>span:last-of-type]:hidden [&>svg]:hidden lg:[&>span:last-of-type]:block lg:[&>svg]:block lg:[&>svg]:h-3.5 lg:[&>svg]:w-3.5 lg:[&>svg]:opacity-50">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold">
                {(empresaAtual?.name ?? "?").charAt(0)}
              </span>
              <SelectValue placeholder="Escolher clínica" />
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
          <div className="mb-3 flex items-center gap-2.5 rounded-[10px] bg-white/[0.06] p-2 lg:px-2.5 lg:py-2.5" title={empresaAtual.name}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-bold text-white">
              {empresaAtual.name.charAt(0)}
            </span>
            <span className="hidden truncate text-[12.5px] font-semibold text-white lg:block">{empresaAtual.name}</span>
          </div>
        ) : null}

        <nav className="flex w-full flex-col gap-0.5">
          {NAV.map((item, i) =>
            item.tipo === "grupo" ? (
              <span key={item.grupo} className="contents">
                {/* No trilho o grupo não cabe como texto: vira um fio separador. */}
                <span className={cn("mx-auto block h-px w-6 bg-white/10 lg:hidden", i === 0 ? "my-2" : "my-3")} />
                <span
                  className={cn(
                    "hidden px-[11px] pb-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.15em] text-white/40 lg:block",
                    i === 0 ? "pt-2" : "pt-4",
                  )}
                >
                  {item.grupo}
                </span>
              </span>
            ) : (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "relative flex h-[42px] items-center justify-center rounded-[9px] text-[13.5px] font-semibold transition-colors lg:h-[38px] lg:justify-start lg:gap-[11px] lg:px-[11px]",
                    isActive ? "bg-white/[0.09] text-white" : "text-white/60 hover:bg-white/5 hover:text-white/85",
                  )
                }
                title={item.label}
              >
                <item.icon size={18} strokeWidth={1.9} className="lg:hidden" />
                <item.icon size={17} strokeWidth={1.9} className="hidden lg:block" />
                <span className="hidden lg:inline">{item.label}</span>
                {"bolha" in item && item.bolha && aguardando > 0 && (
                  <>
                    <span className="absolute right-[9px] top-[9px] h-[5px] w-[5px] rounded-[1px] bg-terra lg:hidden" />
                    <span className="ml-auto hidden font-mono text-[11px] font-medium tabular-nums text-terra lg:block">
                      {aguardando}
                    </span>
                  </>
                )}
              </NavLink>
            ),
          )}
        </nav>

        {/* Conta — menu no rodapé da sidebar */}
        <div className="relative mt-auto w-full" ref={menuRef}>
          {menuAberto && (
            <div className="absolute bottom-[calc(100%+6px)] left-0 w-[196px] overflow-hidden rounded-[10px] border border-border bg-card p-1.5 shadow-alta lg:right-0 lg:w-auto">
              <NavLink
                to="/conta"
                onClick={() => setMenuAberto(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-secondary-foreground transition-colors hover:bg-accent"
              >
                <Settings size={15} className="text-muted-foreground" /> Minha conta
              </NavLink>
              <span className="my-1 block h-px bg-border" />
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-terra-ink transition-colors hover:bg-terra-soft"
              >
                <LogOut size={15} /> Sair
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            className="flex w-full items-center justify-center gap-2.5 rounded-[10px] p-2 text-left transition-colors hover:bg-white/[0.07] lg:justify-start"
            title={user?.displayName ?? undefined}
          >
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[6px] bg-primary-light text-[12px] font-bold text-white/85">
              {inicial}
            </span>
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-[12.5px] font-semibold leading-tight text-white/90">
                {user?.displayName ?? "—"}
              </span>
              <span className="block truncate text-[10px] text-white/45">{user?.email}</span>
            </span>
            <ChevronsUpDown size={13} className="hidden shrink-0 text-white/40 lg:block" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular: barra superior — a marca e a conta que moram na sidebar */}
        <header className="flex h-[54px] shrink-0 items-center gap-3 bg-primary px-3 md:hidden">
          <NavLink to="/" title="Ir para Hoje" className="shrink-0">
            <Brand fundo="escuro" size="md" semPalavra />
          </NavLink>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
            {empresaAtual?.name ?? "—"}
          </span>
          <NavLink
            to="/conta"
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[6px] bg-primary-light text-[12px] font-bold text-white/85"
          >
            {inicial}
          </NavLink>
        </header>

        {caiu && (
          <button
            type="button"
            onClick={() => navigate("/integracoes")}
            className="flex shrink-0 items-center gap-2.5 border-b border-destructive/25 bg-destructive-soft px-4 py-2.5 text-left transition-colors hover:bg-destructive-soft/70 md:px-7"
          >
            <PlugZap size={15} className="shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-foreground">
              <strong className="font-semibold">O WhatsApp caiu.</strong> O número{" "}
              <span className="font-mono">{whatsappQuery.data?.number}</span> não está mais conectado — nenhuma mensagem
              chega ao Kaua até religar.
            </span>
            <span className="shrink-0 text-[11.5px] font-semibold text-destructive underline underline-offset-2">
              Religar
            </span>
          </button>
        )}

        <main className="min-w-0 flex-1 overflow-auto pb-[64px] md:pb-0">
          <div key={location.pathname} className="entra-pagina">
            <Outlet />
          </div>
        </main>

        {/* Celular: abas no alcance do polegar. Operação fica fixa; Configuração
            vive na folha "Mais" — é o que se ajusta e esquece. */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-[64px] items-stretch border-t border-border bg-card md:hidden">
          {ABAS.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2 bg-foreground" />}
                  <item.icon size={20} strokeWidth={1.9} />
                  <span className="text-[10.5px] font-semibold">{item.label}</span>
                  {"bolha" in item && item.bolha && aguardando > 0 && (
                    <span className="absolute right-[calc(50%-18px)] top-[13px] h-[5px] w-[5px] rounded-[1px] bg-terra" />
                  )}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
              naFolha ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {naFolha && <span className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2 bg-foreground" />}
            <Settings size={20} strokeWidth={1.9} />
            <span className="text-[10.5px] font-semibold">Mais</span>
          </button>
        </nav>
      </div>

      {/* Celular: folha "Mais" — Configuração + conta */}
      {maisAberto && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div className="absolute inset-0 bg-primary/45" onClick={() => setMaisAberto(false)} />
          <div className="animate-in slide-in-from-bottom-2 absolute bottom-0 left-0 right-0 rounded-t-[14px] border-t border-border bg-card p-3 pb-7">
            <span className="mx-auto mb-3 block h-[3px] w-9 rounded-[2px] bg-border-strong" />
            <span className="block px-2.5 pb-2 font-mono text-[9.5px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              Configuração
            </span>
            {EXTRAS.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                onClick={() => setMaisAberto(false)}
                className={({ isActive }) =>
                  cn(
                    "flex w-full items-center gap-3 rounded-[8px] px-2.5 py-3 text-left text-[14px] font-semibold transition-colors",
                    isActive ? "bg-accent text-foreground" : "text-secondary-foreground hover:bg-accent",
                  )
                }
              >
                <item.icon size={18} strokeWidth={1.9} className="text-muted-foreground" /> {item.label}
              </NavLink>
            ))}
            <span className="my-2 block h-px bg-border" />
            <NavLink
              to="/conta"
              onClick={() => setMaisAberto(false)}
              className="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-3 text-left text-[14px] font-semibold text-secondary-foreground transition-colors hover:bg-accent"
            >
              <Settings size={18} strokeWidth={1.9} className="text-muted-foreground" /> Minha conta
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-3 text-left text-[14px] font-semibold text-terra-ink transition-colors hover:bg-terra-soft"
            >
              <LogOut size={18} strokeWidth={1.9} /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Chip de status usado no cabeçalho de várias telas. Exportado aqui por proximidade. */
export function ChipAgente({ nome, noAr, desde }: { nome: string; noAr: boolean; desde?: string | null }) {
  return (
    <div className="flex shrink-0 items-center gap-[11px] rounded-[10px] bg-primary py-2.5 pl-3.5 pr-3">
      <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-white/10">
        {noAr ? <Check size={14} className="text-menta" strokeWidth={3} /> : <Bot size={14} className="text-white/60" />}
      </span>
      <div>
        <div className="text-[12.5px] font-bold text-white">{nome}</div>
        <div className="mt-px flex items-center gap-1.5 text-[10.5px] text-white/55">
          {noAr ? (
            <>
              <span className="h-[6px] w-[6px] shrink-0 rounded-[1.5px] bg-menta animate-pulso" />
              No ar{desde ? ` há ${desde}` : ""}
            </>
          ) : (
            "Aguardando configuração"
          )}
        </div>
      </div>
    </div>
  );
}
