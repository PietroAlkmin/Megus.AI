import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Rotulo } from "@/components/ui/megus";
import { cn, formatarBRL } from "@/lib/utils";
import type { Cobranca } from "@/services/cobrancas";
import type { Servico } from "@/services/empresa";

/** Emissor Nacional de NFS-e. Só vale para municípios que adotaram o padrão
 *  nacional — por isso é apenas o *default* do campo em Clínica. */
const EMISSOR_NACIONAL = "https://www.nfse.gov.br/EmissorNacional/";

/**
 * Copia e confirma no próprio botão — sem toast, porque a confirmação precisa
 * estar onde o olho já está.
 */
function Copiavel({ rot, valor, ausente }: { rot: string; valor?: string | null; ausente?: string | null }) {
  const [copiado, setCopiado] = useState(false);

  if (ausente) {
    return (
      <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5">
        <Rotulo>{rot}</Rotulo>
        <span className="text-right text-[12px] text-muted-foreground">{ausente}</span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5">
      <Rotulo className="shrink-0">{rot}</Rotulo>
      <button
        type="button"
        title="Copiar"
        onClick={() => {
          void navigator.clipboard.writeText(String(valor));
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        }}
        className="group flex min-w-0 items-baseline gap-2 text-right"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold tabular-nums text-foreground">
          {valor}
        </span>
        <span
          className={cn(
            "shrink-0 transition-colors",
            copiado ? "text-menta-ink" : "text-muted-foreground group-hover:text-foreground",
          )}
        >
          {copiado ? <Check size={13} strokeWidth={2.6} /> : <Copy size={13} />}
        </span>
      </button>
    </div>
  );
}

/**
 * Os dados que a clínica vai DIGITAR no portal da prefeitura.
 *
 * A gaveta mostrava o estado interno da cobrança (etapa, cobrado, pago) — útil
 * para depurar, inútil para emitir. Quem abre um card em "Nota pedida" tem uma
 * tarefa só: passar esses campos para o emissor. Então eles vêm primeiro, em
 * mono, e cada um copia com um clique.
 *
 * **Copiar existe porque ela vai redigitar.** CPF redigitado à mão é a origem do
 * erro de cadastro que motivou o produto — e o único jeito de não redigitar é o
 * clique.
 *
 * ⚠️ **`cpf` não existe em `Cobranca` hoje.** O Kaua valida CPF↔nome durante a
 * conversa, então o backend TEM o dado — falta expor em `/api/cobrancas`. Até
 * vir, a linha aparece como "não informado": esconder faria a clínica descobrir a
 * falta só no portal, com a nota meio preenchida.
 */
export default function DadosDaNota({
  c,
  servico,
  portal,
}: {
  c: Cobranca & { cpf?: string | null };
  servico?: Servico;
  portal?: string | null;
}) {
  const [copiouTudo, setCopiouTudo] = useState(false);

  const dataServico = c.pagoEm ? new Date(c.pagoEm).toLocaleDateString("pt-BR") : null;
  const tudo = [c.nome, c.cpf, c.servico, servico?.issCode ? `ISS ${servico.issCode}` : null, formatarBRL(c.valor), dataServico]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="border-b border-border px-5 py-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <Rotulo>Dados para a nota</Rotulo>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(tudo);
            setCopiouTudo(true);
            setTimeout(() => setCopiouTudo(false), 1600);
          }}
          className={cn(
            "text-[11.5px] font-semibold underline underline-offset-2 transition-colors",
            copiouTudo ? "text-menta-ink" : "text-secondary-foreground hover:text-foreground",
          )}
        >
          {copiouTudo ? "Copiado" : "Copiar tudo"}
        </button>
      </div>

      <dl className="flex flex-col">
        <Copiavel rot="Tomador" valor={c.nome} />
        <Copiavel rot="CPF" valor={c.cpf} ausente={!c.cpf ? "não informado — peça na conversa" : null} />
        <Copiavel rot="Serviço" valor={c.servico} />
        {servico?.issCode && <Copiavel rot="Código ISS" valor={servico.issCode} />}
        <Copiavel rot="Valor" valor={formatarBRL(c.valor)} />
        <Copiavel rot="Data do serviço" valor={dataServico ?? "—"} />
      </dl>

      {/* Sem deep-link com preenchimento: NFS-e é municipal e nenhuma prefeitura
         publica esquema de URL para isso. O que dá é abrir o emissor certo — daí
         o endereço ser configurável em Clínica, não constante aqui. */}
      <a
        href={portal || EMISSOR_NACIONAL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3.5 flex items-center justify-center gap-2 rounded-[7px] border border-border bg-background px-3 py-2.5 text-[12.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-muted"
      >
        <Link2 size={13} /> Abrir o emissor de NFS-e
      </a>
    </div>
  );
}
