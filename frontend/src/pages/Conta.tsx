import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, LogOut } from "lucide-react";
import { Marca } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { useTema, type Tema } from "@/hooks/useTema";
import { cn } from "@/lib/utils";

/**
 * Minha conta — perfil, aparência, avisos e acesso.
 *
 * O seletor de tema vive aqui porque os dois temas são OFICIAIS DA MARCA (creme e
 * sálvia), não uma preferência de acessibilidade. Trocar muda só a cor do gesto
 * — nenhuma outra cor da paleta. Por isso o preview mostra a marca, não a tela.
 */
const TEMAS: { id: Tema; nome: string; desc: string; cor: string }[] = [
  { id: "creme", nome: "Creme", desc: "Gesto grafite. Sóbrio, para uso diário.", cor: "hsl(140 4% 15%)" },
  { id: "salvia", nome: "Sálvia", desc: "Gesto verde. Mais caloroso.", cor: "hsl(148 30% 32%)" },
];

const AVISOS = [
  ["pendencia", "Quando o agente precisa de mim", "Assim que ele bloqueia uma emissão ou pede um humano."],
  ["resumo", "Resumo do dia", "Um e-mail às 19h com o que foi cobrado, pago e emitido."],
  ["nota", "Cada nota emitida", "Um aviso por NFS-e. Costuma ser demais."],
] as const;

export default function Conta() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { tema, setTema } = useTema();
  const [avisos, setAvisos] = useState({ pendencia: true, resumo: true, nota: false });

  const nome = user?.displayName ?? "—";
  const email = user?.email ?? "";

  return (
    <div className="mx-auto max-w-[720px] p-4 md:p-6 lg:p-7 pb-16">
      <header className="mb-5">
        <h1 className="font-brand text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground">Minha conta</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Seus dados, aparência e acesso.</p>
      </header>

      <div className="flex flex-col gap-4">
        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <h2 className="mb-3.5 font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">Perfil</h2>
          <div className="flex items-center gap-3.5">
            <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-primary text-[20px] font-bold text-white">
              {nome.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-bold tracking-tight text-foreground">{nome}</div>
              <div className="text-[12px] text-muted-foreground">{email}</div>
            </div>
            <div className="flex-1" />
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10.5px] font-bold text-secondary-foreground">
              Administrador
            </span>
          </div>
        </section>

        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <header className="mb-3.5">
            <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">Aparência</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Os dois temas são oficiais da marca. Só a cor do gesto muda.
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMAS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTema(t.id)}
                className={cn(
                  "flex items-start gap-3 rounded-[10px] border bg-card p-3.5 text-left transition-all hover:shadow-media",
                  tema === t.id ? "border-menta ring-1 ring-menta" : "border-border hover:border-border-strong",
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-background">
                  <Marca size={26} fundo="claro" variante="media" cor={t.cor} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <strong className="text-[13px] font-bold text-foreground">{t.nome}</strong>
                    {tema === t.id && <Check size={13} strokeWidth={3} className="text-menta-ink" />}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">{t.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <header className="mb-3.5">
            <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">Avisos</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">O que chega para você por e-mail.</p>
          </header>
          <div className="flex flex-col gap-2">
            {AVISOS.map(([id, t, d]) => (
              <div key={id} className="flex items-start gap-3 rounded-[10px] border border-border bg-background px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <strong className="text-[12.5px] font-bold text-foreground">{t}</strong>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{d}</p>
                </div>
                <Switch checked={avisos[id]} onCheckedChange={(v) => setAvisos((x) => ({ ...x, [id]: v }))} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <h2 className="mb-3.5 font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">Acesso</h2>
          <div className="flex items-center justify-between gap-4">
            <p className="text-[12.5px] text-muted-foreground">Você continua conectado neste navegador até sair.</p>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive-soft"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut size={14} /> Sair da conta
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
