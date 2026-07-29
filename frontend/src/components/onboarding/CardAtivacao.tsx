import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PassoId } from "@/lib/ativacao";
import { cn } from "@/lib/utils";
import type { AtivacaoStatus } from "@/hooks/useAtivacao";

interface CardAtivacaoProps {
  status: AtivacaoStatus;
  /** Abre a simulação do Kaua (passo final, que não é uma rota). */
  onSimular: () => void;
}

/**
 * Camada 2 do onboarding — cartão de ativação, vive na tela Hoje.
 *
 * Layout de DUAS COLUNAS, emprestado do Better Stack: lista à esquerda, e ao
 * selecionar um passo o lado direito explica **por que aquilo importa** antes de
 * oferecer o botão. A diferença em relação a uma checklist comum é essa: não é
 * uma lista de afazeres, é uma lista que ensina o produto enquanto configura.
 *
 * Ao completar, o cartão não desaparece sozinho — vira "Tudo pronto" com os cinco
 * itens riscados e um "Dispensar". Sumir de repente rouba a sensação de conclusão.
 */
export default function CardAtivacao({ status, onSimular }: CardAtivacaoProps) {
  const navigate = useNavigate();
  const [selecionado, setSelecionado] = useState<PassoId>(status.proximo);
  const { feito, passos, concluidos, total, completo } = status;
  // A lista vem do status, não da constante: clínica sem fiscal tem 4 passos.
  const passo = passos.find((p) => p.id === selecionado) ?? passos[0];

  return (
    <section className="overflow-hidden rounded-[10px] border border-menta-soft bg-gradient-to-b from-menta-soft/40 to-card shadow-sutil">
      <header className="flex items-start justify-between gap-5 border-b border-border px-5 pb-3.5 pt-4.5">
        <div>
          <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">
            {completo ? "Tudo pronto" : "Deixe o Kaua pronto para trabalhar"}
          </h2>
          <p className="mt-1 max-w-[56ch] text-[12.5px] text-muted-foreground">
            {completo
              ? "Todas as conexões estão feitas. O Kaua já pode assumir os atendimentos."
              : "Cada conexão desbloqueia uma parte do ciclo. Sem elas, o Kaua para no meio."}
          </p>
        </div>
        <div className="flex min-w-[132px] shrink-0 flex-col items-end gap-1.5">
          <div className="text-xs text-muted-foreground">
            <strong className="text-[17px] font-bold tracking-tight text-foreground">{concluidos}</strong>/{total}
          </div>
          <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-muted">
            <span
              className="block h-full rounded-[3px] bg-menta-dark transition-[width] duration-300"
              style={{ width: `${(concluidos / total) * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={status.ocultar}
            className="p-0.5 text-[11px] font-semibold text-muted-foreground underline underline-offset-2 transition-colors hover:text-secondary-foreground"
          >
            {completo ? "Dispensar" : "Ocultar"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[246px_1fr]">
        <ol className="flex flex-col gap-px border-b border-border p-2.5 lg:border-b-0 lg:border-r">
          {passos.map((p, i) => {
            const ok = feito[p.id];
            const ativo = selecionado === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelecionado(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-left transition-colors",
                    ativo ? "bg-card text-foreground shadow-sutil" : "text-secondary-foreground hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold",
                      ok ? "bg-menta-dark text-white" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {ok ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[12.5px] font-bold",
                      ok && "text-muted-foreground line-through decoration-border-strong",
                    )}
                  >
                    {p.nome}
                  </span>
                  {p.destaque && !ok && (
                    <span className="shrink-0 rounded-[5px] bg-terra-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-terra-ink">
                      chave
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col items-start px-5 pb-5 pt-5">
          <span
            className={cn(
              "mb-3 grid h-10 w-10 place-items-center rounded-[10px]",
              passo.destaque ? "bg-terra-soft text-terra-ink" : "bg-menta-soft text-menta-ink",
            )}
          >
            <passo.icon size={20} strokeWidth={1.9} />
          </span>
          <strong className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">{passo.nome}</strong>
          <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-secondary-foreground">{passo.porque}</p>
          <p className="mt-2 max-w-[56ch] text-xs leading-relaxed text-muted-foreground">{passo.detalhe}</p>

          <div className="mt-4">
            {feito[passo.id] ? (
              <span className="inline-flex items-center gap-1.5 rounded-[9px] bg-menta-soft px-3.5 py-2 text-[12.5px] font-bold text-menta-ink">
                <Check size={14} strokeWidth={2.6} /> Concluído
              </span>
            ) : (
              <Button onClick={() => (passo.to ? navigate(passo.to) : onSimular())}>
                {passo.cta} <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
