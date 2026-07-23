import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Brand from "@/components/Brand";

/**
 * Layout das telas de auth (Login/Cadastro) — proposta v2, "split".
 * Esquerda: painel de marca (verde) com a promessa central e um grafismo
 * circular sutil (o "ciclo que fecha sozinho"). Direita: o formulário.
 * O painel some abaixo de `lg` — no mobile fica só o formulário, centrado.
 */
export default function AuthSplit({
  children,
  legal = true,
}: {
  children: ReactNode;
  legal?: boolean;
}) {
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-card">
      {/* ── painel de marca (esquerda) ── */}
      <aside className="relative hidden w-[42%] max-w-[560px] overflow-hidden bg-success lg:flex lg:flex-col">
        {/* brilho quente sutil */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 460px at 26% 22%, hsl(0 0% 100% / 0.12), transparent 60%)",
          }}
        />
        {/* grafismo: círculos concêntricos = o ciclo automático */}
        <svg
          aria-hidden
          className="absolute -bottom-20 -left-16 w-[420px] opacity-[0.12]"
          viewBox="0 0 100 100"
          fill="none"
        >
          <circle cx="50" cy="50" r="48" stroke="white" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="36" stroke="white" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="24" stroke="white" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="12" stroke="white" strokeWidth="0.6" />
        </svg>

        {/* topo: marca (versão clara sobre o verde) */}
        <div className="relative z-10 flex items-center gap-[11px] px-10 pt-9">
          <span className="grid size-8 place-items-center rounded-[9px] bg-white/15">
            <svg width="18" height="18" viewBox="0 0 42 42" fill="none">
              <path d="M12 27.5L17.5 22L21.5 25.5L30 16.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="30" cy="16.5" r="3.4" fill="white" stroke="white" strokeWidth="1.8" />
            </svg>
          </span>
          <span className="font-brand text-lg font-semibold tracking-tight text-white">Megus</span>
        </div>

        {/* promessa central */}
        <div className="relative z-10 mt-auto px-10 pb-14">
          <p className="font-brand text-[40px] font-semibold leading-[1.08] tracking-tight text-white">
            O dinheiro entra sozinho.
          </p>
          <p className="mt-5 max-w-[40ch] text-[15px] leading-relaxed text-white/75">
            O Kaua conversa, cobra, confere o comprovante e emite a nota. Você acompanha —
            sem operar nada.
          </p>
        </div>
      </aside>

      {/* ── formulário (direita) ── */}
      <div className="flex flex-1 flex-col">
        {/* marca no topo só aparece no mobile (no desktop ela vive no painel) */}
        <header className="px-8 py-6 lg:hidden">
          <Brand />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-6 pt-2">
          <div
            key={location.pathname}
            className="flex w-full justify-center animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out"
          >
            {children}
          </div>
        </main>

        {legal && (
          <footer className="mx-auto max-w-[460px] px-5 pb-7 text-center text-[12.5px] leading-relaxed text-muted-foreground/80">
            Ao continuar você aceita os <span className="underline underline-offset-2">Termos de uso</span> e a{" "}
            <span className="underline underline-offset-2">Política de privacidade</span> da Megus.
          </footer>
        )}
      </div>
    </div>
  );
}