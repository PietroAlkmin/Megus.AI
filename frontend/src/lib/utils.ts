import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Moeda em pt-BR. Único formatador de dinheiro do app — não duplicar por tela. */
export function formatarBRL(valor: number | null | undefined): string {
  return `R$ ${Number(valor ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

/**
 * Quanto tempo um paciente está parado numa etapa, em dias.
 * Usado pelo "envelhecimento" dos cards no kanban do Financeiro.
 */
export function diasParado(desde: string | null | undefined): number {
  if (!desde) return 0;
  const ms = Date.now() - new Date(desde).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
