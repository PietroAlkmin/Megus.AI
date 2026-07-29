import { cn } from "@/lib/utils";

/**
 * Primitivos da linguagem visual Megus — "livro-razão clínico".
 *
 * O produto é o registro do que o agente fez com dinheiro e documento.
 * Livro-razão tem: papel, fios finos, numerais tabulares em coluna, micro-caps
 * como cabeçalho de coluna, marcas na margem. NÃO tem cartão com iconezinho
 * colorido dentro de quadrado arredondado — esse é o tique visual que faz
 * qualquer painel parecer template genérico.
 *
 * As cinco regras:
 *   1. PAPEL é o padrão (`bg-background`). `bg-card` só em objeto que se pega
 *      (card do kanban, bolha, modal). Seção se separa por FIO e espaço.
 *   2. MICRO-CAPS (<Rotulo>) no lugar do quadradinho de ícone. O rótulo é que
 *      identifica a informação.
 *   3. O NÚMERO é o gráfico — display, grande, tabular, sem caixa em volta.
 *   4. STATUS é <Marco> (marca quadrada + texto), não pílula. Círculo fica
 *      reservado para avatar.
 *   5. Um botão primário por seção. Secundário é fio; terciário é texto.
 *
 * Use junto do shadcn: estes primitivos NÃO substituem Button/Input/Select,
 * complementam com o vocabulário da marca.
 */

/* ── Rótulo micro-caps ────────────────────────────────────
   Substitui o quadradinho de ícone como identificador. É o cabeçalho de
   coluna do livro-razão: pequeno, espaçado, discreto. */
export function Rotulo({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("block font-mono text-[9.5px] font-medium uppercase leading-none tracking-[0.15em] text-muted-foreground", className)}>
      {children}
    </span>
  );
}

/* ── Número tabular ──────────────────────────────────────
   TODO numeral em posição de dado usa mono tabular. É o que alinha a coluna e
   o que tira a cara de "texto com número no meio". */
export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}

/** Avatar — a ÚNICA forma redonda do sistema.
 *
 *  Todo o resto (status, marcas, contadores) é quadrado, justamente para que o
 *  círculo signifique uma coisa só: uma pessoa. */
export function Avatar({ nome, s = 34, className }: { nome?: string | null; s?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-primary font-semibold text-white", className)}
      style={{ width: s, height: s, fontSize: s * 0.36 }}
    >
      {(nome || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/* ── Marco de status ─────────────────────────────────────
   Marca quadrada + texto na cor semântica. Quadrado lê como marca de
   registro; pílula arredondada lê como badge de template. */
export type MarcoTom = "neutro" | "ok" | "quente" | "alerta" | "info";

const TOM_TEXTO: Record<MarcoTom, string> = {
  neutro: "text-muted-foreground",
  ok: "text-menta-ink",
  quente: "text-terra-ink",
  alerta: "text-destructive",
  info: "text-info",
};
const TOM_MARCA: Record<MarcoTom, string> = {
  neutro: "bg-border-strong",
  ok: "bg-menta-dark",
  quente: "bg-terra",
  alerta: "bg-destructive",
  info: "bg-info",
};

export function Marco({ t, tom = "neutro", pulsa, className }: {
  t: string; tom?: MarcoTom; pulsa?: boolean; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[7px] whitespace-nowrap text-[11.5px] font-semibold", TOM_TEXTO[tom], className)}>
      <span className={cn("h-[6px] w-[6px] shrink-0 rounded-[1.5px]", TOM_MARCA[tom], pulsa && "animate-pulso")} />
      {t}
    </span>
  );
}

/* ── KPI editorial ───────────────────────────────────────
   Sem caixa, sem ícone: rótulo micro-caps, número grande em display tabular,
   nota embaixo. Vários KPIs entram em <Kpis>, divididos por fio vertical — a
   régua do livro-razão (referência: Fey, Ghost). */
export function Kpi({ rot, valor, nota, tom, className }: {
  rot: string; valor: React.ReactNode; nota?: string; tom?: MarcoTom; className?: string;
}) {
  const cor = tom === "ok" ? "text-menta-ink"
    : tom === "alerta" ? "text-destructive"
    : tom === "quente" ? "text-terra-ink"
    : "text-foreground";
  return (
    <div className={cn("min-w-0 px-4 first:pl-0 last:pr-0", className)}>
      <Rotulo>{rot}</Rotulo>
      <div className={cn("mt-2 font-brand text-[27px] font-bold leading-none tracking-[-0.03em] tabular-nums", cor)}>{valor}</div>
      {nota && <div className="mt-1.5 truncate text-[11.5px] text-muted-foreground">{nota}</div>}
    </div>
  );
}

export function Kpis({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex divide-x divide-border", className)}>{children}</div>;
}

/* ── Seção ───────────────────────────────────────────────
   Padrão: SEM cartão. Cabeçalho com fio embaixo, conteúdo respirando no papel.
   `caixa` só quando a seção é um objeto destacado de verdade. */
export function Secao({ titulo, sub, acao, rot, caixa, children, className }: {
  titulo: string; sub?: string; acao?: React.ReactNode; rot?: string;
  caixa?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn(caixa && "rounded-[10px] border border-border bg-card p-4", className)}>
      <header className={cn("flex items-start justify-between gap-4 border-b border-border pb-2.5", sub ? "mb-3.5" : "mb-3")}>
        <div className="min-w-0">
          {rot && <Rotulo className="mb-1.5">{rot}</Rotulo>}
          <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">{titulo}</h2>
          {sub && <p className="mt-1 max-w-[76ch] text-[12.5px] leading-relaxed text-muted-foreground">{sub}</p>}
        </div>
        {acao && <div className="flex shrink-0 items-center gap-2">{acao}</div>}
      </header>
      {children}
    </section>
  );
}

/* ── Cabeçalho de página ─────────────────────────────────
   Título grande em display + fio forte embaixo. O fio é a assinatura: abre a
   página como a linha de um livro-razão. */
export function TituloPagina({ titulo, sub, rot, children }: {
  titulo: string; sub?: string; rot?: string; children?: React.ReactNode;
}) {
  return (
    <header className="mb-6 border-b border-border-strong pb-4">
      <div className="flex items-end justify-between gap-5">
        <div className="min-w-0">
          {rot && <Rotulo className="mb-2">{rot}</Rotulo>}
          <h1 className="font-brand text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground">{titulo}</h1>
          {sub && <p className="mt-2.5 max-w-[72ch] text-[13px] leading-relaxed text-muted-foreground">{sub}</p>}
        </div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </header>
  );
}

/* ── Estado vazio ────────────────────────────────────────
   Sem ícone em quadrado: um fio curto e uma linha de texto. O silêncio é o
   próprio estado. */
export function Vazio({ titulo, texto, className }: { titulo: string; texto: string; className?: string }) {
  return (
    <div className={cn("py-5 pl-4", className)}>
      <div className="relative">
        <span className="absolute -left-4 top-[7px] h-[18px] w-[2px] rounded-[1px] bg-border-strong" />
        <strong className="text-[13.5px] font-semibold text-foreground">{titulo}</strong>
        <p className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

/* ── Campo de formulário ─────────────────────────────────
   Rótulo em cima, campo embaixo, dica opcional. Sem ícone dentro do input: o
   rótulo já diz o que é. `mono` para dado (CNPJ, chave Pix, valor), `area` para
   texto longo, `tipo` para email/senha (autofill e teclado certo no celular). */
export function Campo({
  rot,
  valor,
  onChange,
  ph,
  tipo,
  mono,
  dica,
  area,
  className,
}: {
  rot: string;
  valor: string | null | undefined;
  onChange: (v: string) => void;
  ph?: string;
  tipo?: "text" | "email" | "password" | "tel";
  mono?: boolean;
  dica?: string;
  area?: boolean;
  className?: string;
}) {
  const Tag = area ? "textarea" : "input";
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">{rot}</span>
      <Tag
        value={valor ?? ""}
        onChange={(ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(ev.target.value)}
        placeholder={ph}
        type={area ? undefined : (tipo ?? "text")}
        autoComplete={tipo === "email" ? "email" : tipo === "password" ? "current-password" : undefined}
        rows={area ? 3 : undefined}
        className={cn(
          "rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring",
          area ? "resize-y py-2.5 leading-relaxed" : "h-10",
          mono && "font-mono",
        )}
      />
      {dica && <span className="text-[11.5px] leading-snug text-muted-foreground">{dica}</span>}
    </label>
  );
}
