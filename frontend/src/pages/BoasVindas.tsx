import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye } from "lucide-react";
import Brand from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { PASSOS_ATIVACAO } from "@/lib/ativacao";

/**
 * Camada 1 do onboarding — a PORTA, logo depois de criar a conta.
 *
 * Padrão emprestado do Churnkey: quando o produto não faz nada sem conexão,
 * jogar o usuário num dashboard vazio é pior que ser honesto. Então a primeira
 * tela logada diz o que falta, por quê, e promete o que importa: nada vai ao ar
 * sem ele ver antes.
 *
 * Rota em tela cheia (fora do Shell) — ver App.tsx.
 */
export default function BoasVindas() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const primeiroNome = (user?.displayName ?? "").split(" ")[0];

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-10">
      <div className="flex w-full max-w-[472px] flex-col">
        <Brand size="lg" variante="completa" className="mb-7" />

        <h1 className="font-brand text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-foreground">
          Bem-vindo{primeiroNome ? `, ${primeiroNome}` : ""}.
        </h1>
        <p className="mb-6 mt-2.5 max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
          A conta da <strong className="font-bold text-foreground">sua clínica</strong> está criada. Faltam quatro
          conexões para o Kaua começar a cobrar, conferir pagamento e emitir nota sozinho.
        </p>

        <ol className="flex flex-col gap-0.5">
          {PASSOS_ATIVACAO.filter((p) => p.to !== null).map((passo, i) => (
            <li key={passo.id} className="flex items-center gap-3 rounded-[11px] border border-border bg-card px-3.5 py-3">
              <span className="w-3.5 shrink-0 font-mono text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
              <span className="grid h-[31px] w-[31px] shrink-0 place-items-center rounded-[9px] bg-background text-secondary-foreground">
                <passo.icon size={16} strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-foreground">{passo.nome}</span>
                <span className="mt-px block text-[11.5px] text-muted-foreground">{passo.curto}</span>
              </span>
            </li>
          ))}
        </ol>

        {/* A promessa que sustenta todo o resto do onboarding */}
        <div className="my-5 flex items-start gap-3 rounded-[11px] border border-areia bg-terra-soft p-3.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-terra/20 text-terra-ink">
            <Eye size={15} />
          </span>
          <p className="text-[12.5px] leading-relaxed text-terra-ink">
            Nada vai ao ar sem você ver antes. No fim da configuração você assiste a uma conversa de teste e decide se o
            Kaua está pronto.
          </p>
        </div>

        <Button size="lg" className="w-full" onClick={() => navigate("/", { replace: true })}>
          Começar a configurar <ArrowRight size={15} />
        </Button>
        <button
          type="button"
          onClick={() => navigate("/", { replace: true })}
          className="mt-3 self-center p-1.5 text-[12.5px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-secondary-foreground"
        >
          Prefiro explorar sozinho
        </button>
      </div>
    </div>
  );
}
