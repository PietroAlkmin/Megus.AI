import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileText, Headphones, Image as ImageIcon, User, X, Zap } from "lucide-react";
import { Marca } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { ROTEIROS, type PassoFala, type PassoRaciocinio } from "@/lib/simulacao";
import { cn } from "@/lib/utils";

interface SimulacaoKauaProps {
  onFechar: () => void;
  /** Usuário assistiu e aprovou — marca o passo e ativa o agente. */
  onConcluir: () => void;
}

/**
 * Camada 3 do onboarding — o Kaua atendendo, com o raciocínio à vista.
 *
 * Esta é a camada que importa. O onboarding do Megus não resolve "onde fica o
 * menu", resolve "eu deixo mesmo essa IA falar com meus pacientes?". A resposta
 * é ver o agente trabalhar num ambiente onde nada é enviado e nada é emitido.
 *
 * Duas escolhas de desenho carregam o peso:
 *
 *  1. A conversa AVANÇA SOZINHA. O usuário assiste, não clica em "próximo" —
 *     a sensação é de observar um atendimento, não de ler documentação.
 *
 *  2. A simulação PARA no ato fiscal. Antes de emitir, um bloco explica a regra
 *     dura: a IA propôs, mas quem valida e dispara é o código. O usuário precisa
 *     clicar em "deixar o código emitir" — o gesto ensina a arquitetura.
 *
 * Overlay em tela cheia; não é rota (pode abrir de qualquer lugar).
 */
export default function SimulacaoKaua({ onFechar, onConcluir }: SimulacaoKauaProps) {
  const [indiceRoteiro, setIndiceRoteiro] = useState(0);
  const [i, setI] = useState(0);
  const [tocando, setTocando] = useState(true);
  const rolagem = useRef<HTMLDivElement>(null);

  const roteiro = ROTEIROS[indiceRoteiro];
  const passos = roteiro.passos;
  const atual = passos[i];
  const pausa = atual?.tipo === "pausa" ? atual : null;
  const fim = atual?.tipo === "fim" ? atual : null;

  // Avanço automático: o raciocínio entra rápido (é reação), a fala demora mais
  // (é leitura). Pausa e fim travam até o usuário agir.
  useEffect(() => {
    if (!tocando || pausa || fim || i >= passos.length - 1) return;
    const proximo = passos[i + 1];
    const espera = proximo?.tipo === "raciocinio" ? 550 : 1250;
    const t = setTimeout(() => setI((v) => v + 1), espera);
    return () => clearTimeout(t);
  }, [i, tocando, pausa, fim, passos]);

  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollTop = rolagem.current.scrollHeight;
  }, [i]);

  const visiveis = passos.slice(0, i + 1);
  const falas = useMemo(() => visiveis.filter((p): p is PassoFala => p.tipo === "fala"), [visiveis]);
  const raciocinios = useMemo(
    () => visiveis.filter((p): p is PassoRaciocinio => p.tipo === "raciocinio"),
    [visiveis],
  );

  function trocarRoteiro(indice: number) {
    setIndiceRoteiro(indice);
    setI(0);
    setTocando(true);
  }

  return (
    <div className="fixed inset-0 z-[300] flex animate-in fade-in flex-col bg-background duration-200">
      <header className="flex shrink-0 items-center gap-3.5 bg-primary px-4.5 py-3.5">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-white/[0.09]">
          <Marca size={22} fundo="escuro" variante="minima" />
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm text-white">O Kaua atendendo</strong>
          <span className="text-[11.5px] text-white/55">
            Simulação — nenhuma mensagem é enviada, nenhuma nota é emitida.
          </span>
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-[9px] bg-white/[0.08] p-[3px]">
          {ROTEIROS.map((r, n) => (
            <button
              key={r.id}
              type="button"
              onClick={() => trocarRoteiro(n)}
              className={cn(
                "h-[29px] rounded-[7px] px-3 text-xs font-bold transition-colors",
                indiceRoteiro === n ? "bg-white/[0.15] text-white" : "text-white/60 hover:text-white/85",
              )}
            >
              {r.nome}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onFechar}
          title="Fechar"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={17} />
        </button>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1000px] flex-1 grid-cols-1 gap-4 p-4.5 lg:grid-cols-[1fr_300px]">
        {/* conversa */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-[#E9E4DC] shadow-media">
          <div className="flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary text-white/75">
              <User size={15} />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-foreground">{roteiro.paciente.nome}</div>
              <div className="font-mono text-[10.5px] text-muted-foreground">{roteiro.paciente.telefone}</div>
            </div>
          </div>

          <div ref={rolagem} className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3.5 py-4">
            {falas.map((f, n) => (
              <Bolha key={n} fala={f} />
            ))}
            {tocando && !pausa && !fim && (
              <div className="flex w-fit gap-1 rounded-[11px] rounded-bl-[3px] bg-white px-3.5 py-3">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 rounded-full bg-border-strong animate-pulso"
                    style={{ animationDelay: `${d * 0.18}s` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* raciocínio — a transparência que gera confiança */}
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-sutil lg:flex">
          <header className="flex items-center gap-2 border-b border-border px-3.5 py-3.5 text-secondary-foreground">
            <Zap size={14} /> <strong className="text-[12.5px] text-foreground">O que o Kaua entendeu</strong>
          </header>
          <ul className="flex flex-col overflow-auto">
            {raciocinios.map((r, n) => (
              <li
                key={n}
                className="flex animate-in fade-in slide-in-from-bottom-1 items-start gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0"
              >
                <span
                  className={cn(
                    "mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full",
                    r.ok ? "bg-menta-soft text-menta-ink" : "bg-destructive-soft text-destructive",
                  )}
                >
                  {r.ok ? <Check size={10} strokeWidth={3} /> : <AlertTriangle size={9} strokeWidth={2.6} />}
                </span>
                <div className="min-w-0">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {r.chave}
                  </span>
                  <span className={cn("block text-[12.5px] font-semibold", r.ok ? "text-foreground" : "text-destructive")}>
                    {r.valor}
                  </span>
                </div>
              </li>
            ))}
            {raciocinios.length === 0 && (
              <li className="px-3.5 py-3 text-[11.5px] italic text-muted-foreground">
                Aguardando a primeira mensagem…
              </li>
            )}
          </ul>
        </aside>
      </div>

      {/* rodapé: pausa didática, desfecho, ou controles */}
      <footer className="mx-auto w-full max-w-[1000px] shrink-0 px-4.5 pb-4.5">
        {pausa ? (
          <div className="flex items-center gap-3.5 rounded-[10px] bg-primary px-4 py-4 text-white shadow-media">
            <span className="mt-[3px] h-[26px] w-[2px] shrink-0 rounded-[1px] bg-terra" />
            <div className="min-w-0 flex-1">
              <strong className="block text-[13.5px]">{pausa.titulo}</strong>
              <p className="mt-0.5 max-w-[74ch] text-[12.5px] leading-relaxed text-white/70">{pausa.texto}</p>
            </div>
            <Button className="shrink-0 bg-white text-primary hover:bg-white/90" onClick={() => setI((v) => v + 1)}>
              {pausa.botao}
            </Button>
          </div>
        ) : fim ? (
          <div
            className={cn(
              "flex items-center gap-3.5 rounded-[10px] border px-4 py-4",
              fim.tom === "ok" ? "border-menta-soft bg-menta-soft" : "border-areia bg-terra-soft",
            )}
          >
            <span
              className={cn(
                "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-white",
                fim.tom === "ok" ? "text-menta-ink" : "text-terra-ink",
              )}
            >
              {fim.tom === "ok" ? <Check size={17} strokeWidth={2.4} /> : <Headphones size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[13.5px] text-foreground">{fim.titulo}</strong>
              <p className="mt-0.5 max-w-[70ch] text-[12.5px] leading-relaxed text-secondary-foreground">{fim.texto}</p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => trocarRoteiro(indiceRoteiro === 0 ? 1 : 0)}
            >
              {indiceRoteiro === 0 ? "Ver quando não bate" : "Rever o caminho feliz"}
            </Button>
            <Button className="shrink-0" onClick={onConcluir}>
              Entendi, ativar o Kaua
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-card px-4 py-3.5">
            <Button size="sm" variant="outline" onClick={() => setTocando((v) => !v)}>
              {tocando ? "Pausar" : "Continuar"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setI(passos.length - 1)}>
              Ir para o fim
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{roteiro.descricao}</span>
          </div>
        )}
      </footer>
    </div>
  );
}

function Bolha({ fala }: { fala: PassoFala }) {
  const meu = fala.lado === "agente";
  return (
    <div className={cn("flex animate-in fade-in slide-in-from-bottom-1", meu && "justify-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-[14px] px-3 py-2.5 text-[12.5px] leading-relaxed shadow-sutil",
          meu ? "rounded-br-[4px] bg-menta-soft text-foreground" : "rounded-bl-[4px] border border-border bg-white text-foreground",
        )}
      >
        {fala.anexo && (
          <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-white/70 px-2.5 py-2">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                fala.anexo.tipo === "pdf" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {fala.anexo.tipo === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />}
            </span>
            <span className="truncate text-[11.5px] font-semibold">{fala.anexo.nome}</span>
          </div>
        )}
        {fala.texto}
      </div>
    </div>
  );
}
