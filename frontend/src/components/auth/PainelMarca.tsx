import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Tempo de leitura de cada frase antes de virar. */
const INTERVALO_MS = 6000;

/**
 * Painel de marca das telas de autenticação.
 *
 * Referência: Midday e Kit. Split em duas colunas — formulário à esquerda,
 * promessa da marca à direita sobre uma foto de clínica real. A foto importa:
 * é o que diz "isto é para consultório", não para startup.
 *
 * As fotos vivem em `public/img/`. Dois scrims sobrepostos: o vertical dá
 * contraste ao texto no rodapé, o horizontal evita cobrir o rosto da pessoa.
 */
const SLIDES = [
  {
    img: "/img/recepcao.jpg",
    quem: "Recepção · Clínica Sorriso",
    frase: "A secretária deixou de perseguir comprovante no WhatsApp. O Kaua cobra, confere e emite.",
  },
  {
    img: "/img/consultorio.jpg",
    quem: "Consultório · Dra. Helena",
    frase: "Nota fiscal sai sozinha depois que o pagamento entra. Sem erro de digitação.",
  },
  {
    img: "/img/equipe.jpg",
    quem: "Equipe · Clínica Sorriso",
    frase: "Atendimento 24/7 sem contratar ninguém. E tudo que o agente faz fica registrado.",
  },
];

export default function PainelMarca() {
  const [i, setI] = useState(0);
  const s = SLIDES[i]!;
  // Guardado em ref porque o clique nos marcadores REINICIA a contagem: sem
  // isso, clicar 1s antes da virada trocava o slide de novo em seguida.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Quem pediu menos movimento no sistema fica no slide escolhido — a troca
    // automática é decoração, não conteúdo (os marcadores seguem clicáveis).
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    timer.current = setInterval(() => setI((n) => (n + 1) % SLIDES.length), INTERVALO_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [i]); // re-agenda a cada troca (inclusive as manuais)

  return (
    <div className="relative hidden overflow-hidden bg-primary lg:block">
      {/* Todas as fotos ficam montadas e sobrepostas: dá crossfade em vez de
          troca seca, e o navegador já baixou a próxima quando ela entra. */}
      {SLIDES.map((slide, n) => (
        <img
          key={slide.img}
          src={slide.img}
          alt=""
          aria-hidden={n !== i}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-[900ms] ease-out",
            n === i ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/45 to-primary/15" />
      <div className="absolute inset-0 bg-gradient-to-r from-primary/70 to-transparent" />

      <div className="relative flex h-full flex-col justify-end p-9">
        {/* `key` no índice remonta o bloco a cada troca, disparando o fade —
            sem isso o texto trocava seco por cima da foto em transição. */}
        <div key={i} className="max-w-[30ch] animate-in fade-in duration-700">
          <p className="font-brand text-[25px] font-bold leading-[1.22] tracking-[-0.025em] text-white">{s.frase}</p>
          <p className="mt-3.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.15em] text-white/75">{s.quem}</p>
        </div>
        {/* Marcadores retos: círculo fica reservado para avatar. */}
        <div className="mt-7 flex gap-1.5">
          {SLIDES.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setI(n)}
              aria-label={`Slide ${n + 1}`}
              className={cn(
                "h-[3px] rounded-[1px] transition-all",
                n === i ? "w-8 bg-white" : "w-4 bg-white/[0.28] hover:bg-white/50",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Erro de formulário: fio vermelho na margem + rótulo micro-caps.
 *
 * Sem caixa tintada e sem iconezinho — é o mesmo padrão de alerta do resto do
 * app (pendências da Hoje, gargalo do Financeiro).
 */
export function ErroForm({ texto }: { texto: string }) {
  return (
    <div className="relative pl-3.5">
      <span className="absolute left-0 top-[3px] h-[calc(100%-6px)] w-[2px] rounded-[1px] bg-destructive" />
      <span className="block font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.15em] text-destructive">
        Erro
      </span>
      <p className="mt-1.5 text-[12.5px] leading-snug text-secondary-foreground">{texto}</p>
    </div>
  );
}
