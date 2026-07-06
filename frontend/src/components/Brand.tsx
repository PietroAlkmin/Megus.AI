import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandProps {
  size?: "md" | "lg";
  className?: string;
}

/** Marca Megus AI — mesma anatomia do `MegusBrand` do wireframe (mark + wordmark). */
export default function Brand({ size = "md", className }: BrandProps) {
  const markPx = size === "lg" ? 40 : 32;

  return (
    <div className={cn("flex items-center gap-[11px]", className)}>
      <span
        className="flex shrink-0 items-center justify-center rounded-[10px] shadow-[0_4px_12px_rgba(27,35,48,0.22)]"
        style={{
          width: markPx,
          height: markPx,
          background: "linear-gradient(150deg, hsl(var(--primary-light)), hsl(var(--primary-darker)))",
        }}
      >
        <Bot size={markPx * 0.56} strokeWidth={1.9} className="text-white" />
      </span>
      <span
        className={cn(
          "font-brand inline-flex items-baseline gap-[5px] font-extrabold tracking-tight",
          size === "lg" ? "text-[22px]" : "text-[17px]",
        )}
      >
        <span className="text-foreground">Megus</span>
        <span className="text-accent">AI</span>
      </span>
    </div>
  );
}
