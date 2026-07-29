import { Button } from "@/components/ui/button";
import { Rotulo } from "@/components/ui/megus";
import { useDicas, type DicaId } from "@/hooks/useDicas";
import { cn } from "@/lib/utils";

interface DicaContextualProps {
  id: DicaId;
  titulo: string;
  texto: string;
  /**
   * `inline` entra no fluxo da página (não cobre nada) — preferível quando a
   * tela tem colunas, como o kanban do Financeiro.
   * `flutuante` fica ancorada num canto — para telas onde não há espaço no fluxo.
   */
  posicao?: "inline" | "flutuante-esq" | "flutuante-dir";
  /** Esconde a dica junto com o elemento que ela descreve (ex.: painel lateral). */
  className?: string;
}

/**
 * Camada 4 do onboarding — dica contextual na primeira visita à tela.
 *
 * Não é um tour: ninguém é arrastado por 8 balões no primeiro login. A dica
 * espera o usuário chegar na tela onde ela faz sentido e explica só aquilo.
 * Dispensou, não volta (localStorage via `useDicas`).
 *
 * Regra de ancoragem: a dica precisa estar PERTO do que descreve. Uma dica sobre
 * o painel da direita ancorada na esquerda confunde mais do que ajuda.
 *
 * Sem pílula "⚡ DICA": um fio terracota na margem e micro-caps. A dica pertence
 * à página, não é um pôpupe de produto.
 */
export default function DicaContextual({ id, titulo, texto, posicao = "inline", className }: DicaContextualProps) {
  const { jaViu, marcar } = useDicas();
  if (jaViu(id)) return null;

  const flutuante = posicao !== "inline";

  return (
    <div
      className={cn(
        "border-l-2 border-terra bg-card",
        flutuante
          ? // No celular a dica ancora nas margens e sobe ACIMA da barra de abas
            // (h-16). `fixed` se posiciona pelo viewport, então o padding do
            // <main> não protege — o afastamento tem que ser aqui. z-50 para não
            // empatar com a barra de abas (z-40) e depender da ordem do DOM.
            "fixed inset-x-4 bottom-20 z-50 w-auto animate-in fade-in slide-in-from-bottom-2 rounded-r-[8px] py-3.5 pl-4 pr-4 shadow-alta md:inset-x-auto md:bottom-6 md:w-[296px]"
          : "mb-4 grid grid-cols-[1fr_auto] items-center gap-5 rounded-r-[8px] border-y border-r border-border py-3 pl-4 pr-4",
        // Os desvios laterais valem só onde há painel/sidebar para desviar.
        flutuante && posicao === "flutuante-esq" && "md:left-6 xl:left-[232px]",
        flutuante && posicao === "flutuante-dir" && "md:right-6 xl:right-[326px]",
        className,
      )}
    >
      <div className="min-w-0">
        <Rotulo className="text-terra-ink">Dica</Rotulo>
        <strong className="mt-1.5 block text-[13.5px] font-semibold tracking-[-0.01em] text-foreground">{titulo}</strong>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{texto}</p>
      </div>
      <div className={cn("flex justify-end", flutuante && "mt-3")}>
        <Button size="sm" variant="outline" onClick={() => marcar(id)}>
          Entendi
        </Button>
      </div>
    </div>
  );
}
