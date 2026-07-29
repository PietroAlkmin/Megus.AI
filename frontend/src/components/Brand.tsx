import { cn } from "@/lib/utils";

/**
 * Marca Megus — gesto manuscrito de três arcos ("m" cursivo) + ponto + base terracota.
 *
 * REGRA TIPOGRÁFICA (não quebrar): "m" cursivo tem TRÊS arcos. Dois arcos leem
 * como "n". A redução para tamanhos pequenos muda espessura e largura dos arcos,
 * nunca a quantidade. Ver o Manual de Identidade v2, seção "Redução".
 *
 * Variantes por tamanho de uso:
 *   completa — gesto + ponto + base terracota (assinatura, login, cabeçalho)
 *   media    — gesto + ponto, sem base (uso corrente: sidebar, topo)
 *   minima   — só o gesto, arcos largos, sem ponto (favicon, avatar, ≤24px)
 *
 * A cor do gesto vem dos tokens `--gesto` (fundo claro) e `--gesto-inv`
 * (fundo escuro), que o tema (creme/salvia) troca.
 */

// gesto ascendente — três arcos que sobem, usado nas variantes completa e média
const GESTO_ASC =
  "M13 79 C13 62 17 50 25 50 C33 50 33 62 33 76 C33 58 38 44 47 44 C55 44 55 58 55 72 C55 54 61 38 71 38 C79 38 79 52 79 66";
// gesto uniforme — três arcos de mesma altura, mais largos: sobrevive a 16px
const GESTO_UNI =
  "M9 74 C9 57 15 45 25 45 C35 45 35 59 35 74 C35 57 41 45 51 45 C61 45 61 59 61 74 C61 57 67 45 77 45 C87 45 87 59 87 74";

export type MarcaVariante = "completa" | "media" | "minima";
export type MarcaFundo = "escuro" | "claro";

interface MarcaProps {
  size?: number;
  /** Fundo em que a marca está apoiada — decide o tom do gesto e da base terracota. */
  fundo?: MarcaFundo;
  variante?: MarcaVariante;
  /** Sobrepõe a cor do gesto (padrão: token do tema, conforme o fundo). */
  cor?: string;
  className?: string;
}

/** Só o símbolo. Para símbolo + palavra, use `<Brand />`. */
export function Marca({ size = 28, fundo = "escuro", variante = "media", cor, className }: MarcaProps) {
  // O gesto inverte por fundo: grafite (ou sálvia) no claro, creme (ou menta
  // clara) no escuro. Sem isso a marca desaparece na sidebar grafite.
  const gesto = cor ?? (fundo === "escuro" ? "hsl(var(--gesto-inv))" : "hsl(var(--gesto))");
  // sobre fundo escuro a base clareia para não sumir
  const base = fundo === "escuro" ? "hsl(var(--terra))" : "hsl(var(--terra-dark))";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      role="img"
      aria-label="Megus"
    >
      {variante === "minima" ? (
        <path d={GESTO_UNI} stroke={gesto} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path
            d={GESTO_ASC}
            stroke={gesto}
            strokeWidth={variante === "completa" ? 8 : 9.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="89" cy="31" r={variante === "completa" ? 5.5 : 6} fill={gesto} />
        </>
      )}
      {variante === "completa" && (
        <>
          {/* base: trilho inteiro esmaecido + preenchimento terracota a 55% */}
          <path d="M8 92 L94 92" stroke={gesto} strokeWidth={5} strokeLinecap="round" opacity={0.26} />
          <path d="M8 92 L56 92" stroke={base} strokeWidth={5} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

interface BrandProps {
  size?: "sm" | "md" | "lg";
  fundo?: MarcaFundo;
  variante?: MarcaVariante;
  /** Esconde a palavra — só o símbolo (sidebar recolhida, mobile). */
  semPalavra?: boolean;
  className?: string;
}

/**
 * Marca completa: símbolo + palavra "Megus".
 *
 * O ".AI" saiu do wordmark. A empresa se posiciona como gestão para clínicas —
 * não como bot de WhatsApp — e o sufixo prendia a marca ao produto errado.
 */
export default function Brand({ size = "md", fundo = "claro", variante = "media", semPalavra, className }: BrandProps) {
  const px = size === "lg" ? 40 : size === "sm" ? 24 : 30;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Marca size={px} fundo={fundo} variante={variante} />
      {!semPalavra && (
        <span
          className={cn(
            "font-brand font-bold tracking-[-0.02em]",
            fundo === "escuro" ? "text-white" : "text-foreground",
            size === "lg" ? "text-[23px]" : size === "sm" ? "text-[15px]" : "text-[18px]",
          )}
        >
          Megus
        </span>
      )}
    </div>
  );
}
