import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Eye, FileText, Headphones, Image as ImageIcon, Search, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import DicaContextual from "@/components/onboarding/DicaContextual";
import { cn } from "@/lib/utils";
import * as conversasService from "@/services/conversas";
import type { Conversa, Mensagem } from "@/services/conversas";
import * as raciocinioService from "@/services/raciocinio";

/**
 * Conversas — inbox de atendimento.
 *
 * Três colunas, e a da direita é o diferencial: além de ler a conversa, o usuário
 * vê O QUE O AGENTE ENTENDEU em cada passo. É a mesma transparência da simulação
 * do onboarding, agora sobre conversas reais — e é o que permite confiar sem
 * reler tudo.
 *
 * O filtro padrão é "Precisa de você", não "Todas": a fila humana é o que traz o
 * usuário a esta tela. Abrir em "Todas" o obrigaria a filtrar antes de trabalhar.
 */
const FILTROS = [
  { id: "precisa", label: "Precisa de você", status: "AGUARDANDO" as const },
  { id: "kaua", label: "Kaua conduzindo", status: "BOT" as const },
  { id: "humano", label: "Com humano", status: "HUMANO" as const },
  { id: "todas", label: "Todas", status: null },
] as const;

const TAG_STATUS: Record<string, { t: string; cls: string }> = {
  AGUARDANDO: { t: "Precisa de você", cls: "bg-terra-soft text-terra-ink" },
  BOT: { t: "Kaua", cls: "bg-menta-soft text-menta-ink" },
  HUMANO: { t: "Humano", cls: "bg-info-soft text-info" },
  // O agente perguntando "vai precisar de nota?" — está conduzindo, não travado.
  AGUARDANDO_NOTA: { t: "Perguntando da nota", cls: "bg-menta-soft text-menta-ink" },
};

/**
 * O backend evolui `ConversationState` (ganhou `awaiting_nota_answer`), então um
 * status desconhecido é questão de quando, não de se. Sem fallback,
 * `TAG_STATUS[x].cls` derruba a tela inteira por causa de um rótulo.
 */
const tagDe = (status: string) => TAG_STATUS[status] ?? { t: "Em andamento", cls: "bg-muted text-secondary-foreground" };

export default function Conversas() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("precisa");
  const [selId, setSelId] = useState<string | null>(null);
  // Celular: mestre-detalhe. `aberto` diz se o chat cobre a lista.
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [rascunho, setRascunho] = useState("");
  const rolagem = useRef<HTMLDivElement>(null);

  // "todos" = todas as integrações da empresa (o backend resolve por tenant).
  const conversasQuery = useQuery({
    queryKey: ["conversas"],
    queryFn: () => conversasService.listConversas("todos"),
    refetchInterval: 30_000,
  });
  const conversas = conversasQuery.data ?? [];

  const lista = useMemo(() => {
    const f = FILTROS.find((x) => x.id === filtro)!;
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      const passaF = !f.status || c.status === f.status;
      const passaB = !q || [c.nome, c.telefone].some((x) => (x ?? "").toLowerCase().includes(q));
      return passaF && passaB;
    });
  }, [conversas, filtro, busca]);

  // Mantém uma conversa válida aberta quando o filtro ou a busca muda.
  useEffect(() => {
    if (!lista.length) {
      setSelId(null);
      return;
    }
    if (!lista.some((c) => c.id === selId)) setSelId(lista[0].id);
  }, [lista, selId]);

  const mensagensQuery = useQuery({
    queryKey: ["conversas", selId, "mensagens"],
    queryFn: () => conversasService.listMensagens(selId!),
    enabled: Boolean(selId),
  });
  const racQuery = useQuery({
    queryKey: ["conversas", selId, "raciocinio"],
    queryFn: () => raciocinioService.getRaciocinio(selId!),
    enabled: Boolean(selId),
  });

  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollTop = rolagem.current.scrollHeight;
  }, [mensagensQuery.data]);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["conversas"] });
  };

  const assumir = useMutation({
    mutationFn: () => conversasService.assumir(selId!),
    onSuccess: () => {
      invalidar();
      toast.success("Você assumiu a conversa. O Kaua está pausado aqui.");
    },
    onError: () => toast.error("Não foi possível assumir a conversa."),
  });

  const retomar = useMutation({
    mutationFn: () => conversasService.retomar(selId!),
    onSuccess: () => {
      invalidar();
      toast.success("Conversa devolvida ao Kaua.");
    },
    onError: () => toast.error("Não foi possível devolver a conversa."),
  });

  const enviar = useMutation({
    mutationFn: (texto: string) => conversasService.enviar(selId!, texto),
    onSuccess: () => {
      setRascunho("");
      void queryClient.invalidateQueries({ queryKey: ["conversas", selId, "mensagens"] });
      invalidar();
    },
    onError: () => toast.error("Não foi possível enviar a mensagem."),
  });

  const sel = conversas.find((c) => c.id === selId);
  const conta = (status: string | null) => conversas.filter((c) => !status || c.status === status).length;
  const rac = racQuery.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={cn("shrink-0 border-b border-border bg-card px-4 py-4 md:block md:px-7 md:py-5", aberto ? "hidden md:block" : "block")}>
        <h1 className="font-brand text-[24px] font-bold leading-none tracking-[-0.03em] text-foreground md:text-[30px]">Conversas</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          O que o Kaua está conversando agora — e o que ele entendeu de cada mensagem.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[290px_1fr] xl:grid-cols-[290px_1fr_296px]">
        {/* lista */}
        <div className={cn("min-h-0 flex-col border-border bg-card md:flex md:border-r", aberto ? "hidden md:flex" : "flex")}>
          <div className="flex flex-col gap-2.5 border-b border-border px-3.5 py-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar paciente…"
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-[12.5px] outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors",
                    filtro === f.id
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-card text-muted-foreground hover:text-secondary-foreground",
                  )}
                >
                  {f.label}
                  <span className={cn("rounded-[3px] px-1.5 font-mono text-[9.5px]", filtro === f.id ? "bg-white/20" : "bg-muted")}>
                    {conta(f.status)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {lista.map((c) => (
              <ItemConversa key={c.id} c={c} ativo={c.id === selId} onClick={() => { setSelId(c.id); setAberto(true); }} />
            ))}
            {!lista.length && (
              <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">Nenhuma conversa neste filtro.</p>
            )}
          </div>
        </div>

        {/* chat */}
        <div className={cn("min-h-0 flex-col bg-background md:flex", aberto ? "flex" : "hidden md:flex")}>
          {!sel ? (
            <div className="grid flex-1 place-items-center px-8 text-center text-[13px] text-muted-foreground">
              Selecione uma conversa à esquerda.
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card px-3 py-3 md:px-4">
                {/* Celular: caminho de volta para a lista */}
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  title="Voltar à lista"
                  className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
                >
                  <ArrowLeft size={16} strokeWidth={1.9} />
                </button>
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">
                  {sel.nome.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[13.5px] text-foreground">{sel.nome}</strong>
                  <span className="font-mono text-[11px] text-muted-foreground">{sel.telefone}</span>
                </div>
                <span className={cn("shrink-0 rounded-[4px] px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em]", tagDe(sel.status).cls)}>
                  {tagDe(sel.status).t}
                </span>
              </div>

              <div ref={rolagem} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto px-5 py-5">
                {mensagensQuery.isLoading && (
                  <p className="text-center text-[12px] text-muted-foreground">Carregando…</p>
                )}
                {(mensagensQuery.data ?? []).map((m) => (
                  <Bolha key={m.id} m={m} />
                ))}
              </div>

              <div className="shrink-0 border-t border-border bg-card px-4 py-3">
                {sel.status === "HUMANO" ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (rascunho.trim()) enviar.mutate(rascunho.trim());
                        }
                      }}
                      rows={1}
                      placeholder="Escreva como a recepção…"
                      className="max-h-28 min-h-[40px] flex-1 resize-y rounded-md border border-border bg-background px-3 py-2.5 text-[12.5px] leading-relaxed outline-none focus:ring-2 focus:ring-ring"
                    />
                    <Button onClick={() => enviar.mutate(rascunho.trim())} disabled={!rascunho.trim() || enviar.isPending}>
                      <Send size={14} /> Enviar
                    </Button>
                    <Button variant="outline" onClick={() => retomar.mutate()}>
                      Devolver ao Kaua
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      <Eye size={14} /> Modo monitoramento — o Kaua está conduzindo
                    </span>
                    <Button onClick={() => assumir.mutate()} disabled={assumir.isPending}>
                      <Headphones size={14} /> Assumir conversa
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* raciocínio — a transparência que gera confiança */}
        <aside className="hidden min-h-0 flex-col border-l border-border bg-card xl:flex">
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3.5 text-secondary-foreground">
            <Zap size={14} /> <strong className="text-[12.5px] text-foreground">O que o Kaua entendeu</strong>
          </header>
          <ul className="min-h-0 flex-1 overflow-auto">
            {rac.map((r, n) => (
              <li key={n} className="flex items-start gap-2.5 border-b border-border px-4 py-3">
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
            {!rac.length && (
              <li className="px-4 py-4 text-[11.5px] italic text-muted-foreground">Sem raciocínio registrado.</li>
            )}
          </ul>
          {sel?.status === "AGUARDANDO" && (
            <footer className="shrink-0 border-t border-areia bg-terra-soft px-4 py-3.5 text-terra-ink">
              <strong className="block text-[12.5px]">O Kaua parou aqui</strong>
              <p className="mt-1 text-[11.5px] leading-relaxed opacity-85">
                Ele não insiste nem adivinha quando um dado não confere. Assuma a conversa para resolver.
              </p>
            </footer>
          )}
        </aside>
      </div>

      {/* a dica descreve o painel da direita — some junto com ele */}
      <DicaContextual
        id="conversas"
        posicao="flutuante-dir"
        className="hidden xl:grid"
        titulo="Você vê o que o Kaua entendeu"
        texto="A coluna da direita mostra o raciocínio dele em cada conversa — intenção, CPF, comprovante. Se algo não bater, aparece em vermelho e ele para sozinho."
      />
    </div>
  );
}

function ItemConversa({ c, ativo, onClick }: { c: Conversa; ativo: boolean; onClick: () => void }) {
  const tag = tagDe(c.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 border-b border-border px-3.5 py-3 text-left transition-colors",
        ativo ? "bg-background shadow-[inset_2.5px_0_0_hsl(var(--gesto))]" : "hover:bg-background",
      )}
    >
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-white">
        {c.nome.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[12.5px] font-bold text-foreground">{c.nome}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{c.hora}</span>
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{c.ultima}</span>
        <span className={cn("mt-1.5 inline-flex rounded-[4px] px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em]", tag.cls)}>{tag.t}</span>
      </span>
    </button>
  );
}

function Bolha({ m }: { m: Mensagem }) {
  // Mensagem de sistema não é fala: é o registro da decisão do agente. Fica
  // centralizada e em terracota para não se confundir com o diálogo.
  if (m.autor === "cliente" && !m.texto && !m.attach) return null;

  const humano = m.autor === "humano";
  const meu = humano || m.autor === "bot";

  return (
    <div className={cn("flex", meu && "justify-end")}>
      <div
        className={cn(
          "max-w-[74%] rounded-[14px] px-3 py-2.5 text-[12.5px] leading-relaxed shadow-sutil",
          humano
            ? "rounded-br-[4px] bg-info-soft text-foreground"
            : meu
              ? "rounded-br-[4px] bg-menta-soft text-foreground"
              : "rounded-bl-[4px] border border-border bg-card text-foreground",
        )}
      >
        {humano && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-info">Recepção</div>}
        {m.attach && (
          <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-border bg-white/70 px-2.5 py-2">
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                m.attach.type === "pdf" ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground",
              )}
            >
              {m.attach.type === "pdf" ? <FileText size={14} /> : <ImageIcon size={14} />}
            </span>
            <span className="truncate text-[11.5px] font-semibold">{m.attach.name}</span>
          </div>
        )}
        {m.texto}
        <div className="mt-1 text-right text-[9.5px] opacity-55">{m.hora}</div>
      </div>
    </div>
  );
}
