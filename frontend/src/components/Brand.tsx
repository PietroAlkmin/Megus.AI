import { cn } from "@/lib/utils";

interface BrandProps {
  size?: "md" | "lg";
  className?: string;
}

/**
 * Marca Megus — proposta v2.
 * Logo "a subida": a linha que sobe (receita) terminando num ponto que fecha
 * sozinho (o ciclo automático). Sem robô, sem "AI" no wordmark.
 */
export default function Brand({ size = "md", className }: BrandProps) {
  const markPx = size === "lg" ? 40 : 32;

  return (
    <div className={cn("flex items-center gap-[11px]", className)}>
      <span
        className="flex shrink-0 items-center justify-center rounded-[10px] bg-primary"
        style={{ width: markPx, height: markPx }}
      >
        <svg
          width={markPx * 0.62}
          height={markPx * 0.62}
          viewBox="0 0 42 42"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 27.5L17.5 22L21.5 25.5L30 16.5"
            stroke="hsl(var(--primary-foreground))"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="30"
            cy="16.5"
            r="3.4"
            fill="hsl(var(--success))"
            stroke="hsl(var(--primary-foreground))"
            strokeWidth="1.8"
          />
        </svg>
      </span>
      <span
        className={cn(
          "font-brand font-semibold tracking-tight text-foreground",
          size === "lg" ? "text-[22px]" : "text-[18px]",
        )}
      >
        Megus
      </span>
    </div>
  );
}