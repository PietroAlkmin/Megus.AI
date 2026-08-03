import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Shield } from "lucide-react";
import { Marca } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Marco, Rotulo } from "@/components/ui/megus";
import * as agenteService from "@/services/agente";
import type { AgentePersona, AgenteTone } from "@/services/agente";

/**
 * Agentes — lista + edição de persona e habilidades.
 *
 * A tela assume MÚLTIPLOS agentes (um por unidade ou especialidade), porque é
 * assim que a clínica cresce: primeiro a recepção, depois estética, depois odonto.
 * Um agente por número de WhatsApp.
 *
 * O `services/agente.ts` de hoje devolve UM agente (`GET /api/agente`, a persona
 * da integração da empresa). A lista abaixo já está montada para N — quando o
 * backend expor `GET /api/agentes`, é trocar a query e remover o array de um item.
 */
const TONS: { v: AgenteTone; t: string }[] = [
  { v: "formal", t: "Formal" },
  { v: "equilibrado", t: "Equilibrado" },
  { v: "descontraido", t: "Descontraído" },
];

/**
 * Habilidades com NÍVEL DE RISCO explícito.
 *
 * O risco não é decoração: "Emitir nota fiscal" não pode parecer equivalente a
 * "Tirar dúvidas" numa lista de switches iguais. Quem liga a primeira está dando
 * ao agente poder de gerar documento fiscal com o CNPJ da clínica.
 */
/**
 * Os campos que a clínica pode pedir no primeiro contato.
 *
 * `peso` é o ATRITO da pergunta: endereço custa duas ou três mensagens, sexo
 * custa uma palavra. Mostrar isso importa porque cada campo marcado é uma
 * pergunta a mais entre o paciente e o que ele veio buscar — e quem marca não
 * sente esse custo, quem responde sente.
 *
 * Espelha `CAMPOS_CADASTRO` do backend (domain/services/camposCadastro): as
 * chaves têm que bater, senão a clínica marca e o agente não pergunta.
 */
const CAMPOS_CADASTRO = [
  { k: "nome", rot: "Nome completo", peso: "leve", nota: "Ele já ia dizer de qualquer jeito." },
  { k: "cpf", rot: "CPF", peso: "leve", nota: "Necessário para a nota fiscal." },
  { k: "nascimento", rot: "Data de nascimento", peso: "leve", nota: "Rápido de responder." },
  { k: "sexo", rot: "Sexo", peso: "leve", nota: "Uma palavra." },
  { k: "email", rot: "E-mail", peso: "medio", nota: "Ele costuma ter que procurar." },
  { k: "endereco", rot: "Endereço completo com CEP", peso: "pesado", nota: "Duas ou três mensagens só para isto." },
  { k: "convenio", rot: "Convênio", peso: "medio", nota: "Gera dúvida: número da carteirinha, plano…" },
] as const;

const PESO_ROT = { leve: "rápido", medio: "demora", pesado: "pesado" } as const;
const PESO_TOM = { leve: "ok", medio: "quente", pesado: "alerta" } as const;

/**
 * O toggle É a instrução.
 *
 * Antes a clínica precisava escrever "peça nome, CPF, endereço…" no texto livre
 * da persona E lembrar de ligar algo — duas dependências para o mesmo efeito, e
 * a que ela esquece manda no resultado. Agora o que está marcado aqui vira o
 * bloco do prompt sozinho, e some quando o paciente já respondeu.
 */
function CadastroPrimeira({
  valor,
  onChange,
}: {
  valor: { ligado: boolean; campos: string[] } | null;
  onChange: (v: { ligado: boolean; campos: string[] }) => void;
}) {
  const cfg = valor ?? { ligado: false, campos: [] };
  const marcados = CAMPOS_CADASTRO.filter((c) => cfg.campos.includes(c.k));
  const pesados = marcados.filter((c) => c.peso !== "leve").length;

  const alternar = (k: string) =>
    onChange({ ...cfg, campos: cfg.campos.includes(k) ? cfg.campos.filter((x) => x !== k) : [...cfg.campos, k] });

  return (
    <>
      <label className="flex cursor-pointer items-center gap-3 rounded-[8px] border border-border bg-background px-3.5 py-3">
        <Switch checked={cfg.ligado} onCheckedChange={(v) => onChange({ ...cfg, ligado: v })} />
        <span className="min-w-0 flex-1">
          <strong className="block text-[13px] font-semibold text-foreground">Perguntar na primeira conversa</strong>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
            Número que nunca falou com a clínica: o agente coleta os dados durante o atendimento.
          </span>
        </span>
      </label>

      {cfg.ligado && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <Rotulo>O que perguntar</Rotulo>
            {/* O número que faz pensar duas vezes antes de marcar o sétimo. */}
            <span className="text-[11.5px] text-muted-foreground">
              {marcados.length === 0
                ? "nenhum campo — o agente não vai perguntar nada"
                : `${marcados.length} ${marcados.length > 1 ? "perguntas" : "pergunta"} durante o atendimento`}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {CAMPOS_CADASTRO.map((campo) => {
              const on = cfg.campos.includes(campo.k);
              return (
                <button
                  key={campo.k}
                  type="button"
                  onClick={() => alternar(campo.k)}
                  className={cn(
                    "flex items-center gap-3 rounded-[7px] border px-3 py-2.5 text-left transition-colors",
                    on ? "border-menta bg-menta-soft/40" : "border-border bg-card hover:border-border-strong",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] border",
                      on ? "border-menta-dark bg-menta-dark text-white" : "border-border-strong",
                    )}
                  >
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold text-foreground">{campo.rot}</span>
                    <span className="block text-[11px] text-muted-foreground">{campo.nota}</span>
                  </span>
                  <Marco t={PESO_ROT[campo.peso]} tom={PESO_TOM[campo.peso]} className="shrink-0 text-[10px]" />
                </button>
              );
            })}
          </div>

          {/* Só aparece quando ela de fato passou do ponto — alerta que aparece
              sempre vira paisagem. */}
          {pesados >= 3 && (
            <p className="mt-2.5 text-[11.5px] leading-relaxed text-terra-ink">
              São {pesados} perguntas trabalhosas antes de o paciente conseguir o que veio buscar. Vale checar se todas
              precisam vir pelo WhatsApp.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Todas ligadas por padrão, todas desligáveis.
 *
 * Antes só `agenda` e `fiscal` existiam no backend: as outras três eram switch
 * de mentira, e "Confirmar pagamento" ainda estava amarrado ao `fiscal` — a
 * clínica que não emite nota via **desativado** enquanto o agente confirmava
 * pagamento. Agora cada uma desliga algo de verdade, e o que ela desliga vira
 * trabalho de humano (handoff), nunca silêncio.
 */
const HABILIDADES = [
  { id: "cobrar", nome: "Cobrar", desc: "Envia a cobrança com a chave Pix. Desligado, o disparo fica com você.", risco: "baixo" },
  { id: "confirmar", nome: "Confirmar pagamento", desc: "Lê o comprovante e confere recebedor, valor e chave Pix. Desligado, o comprovante vai para a fila humana.", risco: "médio" },
  { id: "emitir", nome: "Emitir nota fiscal", desc: "Só age após CPF conferido e pagamento confirmado.", risco: "alto" },
  { id: "agendar", nome: "Agendar e remarcar", desc: "Consulta a agenda e oferece horários livres.", risco: "médio" },
  { id: "duvidas", nome: "Tirar dúvidas gerais", desc: "Responde sobre endereço, horários e preços. Desligado, a dúvida vira handoff.", risco: "baixo" },
] as const;

const CLS_RISCO = {
  baixo: "bg-muted text-secondary-foreground",
  "médio": "bg-terra-soft text-terra-ink",
  alto: "bg-destructive-soft text-destructive",
} as const;

export default function Agentes() {
  const queryClient = useQueryClient();
  const agenteQuery = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });
  const [rascunho, setRascunho] = useState<AgentePersona | null>(null);

  const salvar = useMutation({
    mutationFn: (p: AgentePersona) => {
      const { integrationId: _i, knowledgeFiles: _k, ...payload } = p;
      return agenteService.saveAgente(payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agente"] });
      setRascunho(null);
      toast.success("Agente atualizado.");
    },
    onError: () => toast.error("Não foi possível salvar o agente."),
  });

  const agente = rascunho ?? agenteQuery.data;
  if (!agente) {
    return <div className="grid h-full place-items-center text-[13px] text-muted-foreground">Carregando…</div>;
  }

  const set = <K extends keyof AgentePersona>(k: K) => (v: AgentePersona[K]) =>
    setRascunho({ ...agente, [k]: v });

  const ligadas = capacidadesLigadas(agente);
  const alternar = (id: string) => setRascunho(comCapacidadeAlternada(agente, id));

  return (
    <div className="mx-auto max-w-[880px] p-4 md:p-6 lg:p-7 pb-12">
      <header className="mb-5 flex items-start justify-between gap-5">
        <div>
          <h1 className="font-brand text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground">Agentes</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Um agente por número de WhatsApp. Cada um com sua função, tom e habilidades.
          </p>
        </div>
        <Button onClick={() => toast.info("Criar um segundo agente depende de GET/POST /api/agentes.")}>
          <Plus size={15} strokeWidth={2.4} /> Criar agente
        </Button>
      </header>

      <div className="flex flex-col gap-4">
        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <header className="mb-4 flex items-center gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-primary">
              <Marca size={26} fundo="escuro" variante="minima" />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[16px] font-bold tracking-tight text-foreground">
                {agente.name || "Sem nome"}
              </strong>
              <span className="text-[12px] text-muted-foreground">{agente.segment || "Segmento não definido"}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-menta-soft px-2.5 py-1 text-[10.5px] font-bold text-menta-ink">
              <span className="h-[6px] w-[6px] rounded-full bg-menta-dark animate-pulso" /> No ar
            </span>
          </header>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">Nome</span>
              <input
                value={agente.name}
                onChange={(e) => set("name")(e.target.value)}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">Segmento</span>
              <input
                value={agente.segment}
                onChange={(e) => set("segment")(e.target.value)}
                className="h-10 rounded-md border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">Tom</span>
              <Select value={agente.tone} onValueChange={(v) => set("tone")(v as AgenteTone)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONS.map((t) => (
                    <SelectItem key={t.v} value={t.v}>
                      {t.t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5">
              <span className="text-[12.5px] font-semibold text-secondary-foreground">Usar emojis</span>
              <Switch checked={agente.emojis} onCheckedChange={set("emojis")} />
            </div>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">
                Instruções
              </span>
              <textarea
                value={agente.instructions}
                onChange={(e) => set("instructions")(e.target.value)}
                rows={4}
                className="resize-y rounded-md border border-border bg-card px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-[11.5px] text-muted-foreground">
                O que ele deve e não deve fazer, em linguagem natural. Vai para o system prompt.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <header className="mb-3.5">
            <strong className="text-[14px] font-bold text-foreground">Cadastro na primeira conversa</strong>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              O que o agente pergunta a quem nunca falou com a clínica. Aparece na ficha do paciente, em Conversas.
            </p>
          </header>
          <CadastroPrimeira
            valor={agente.capabilities.cadastro ?? null}
            onChange={(cadastro) => setRascunho({ ...agente, capabilities: { ...agente.capabilities, cadastro } })}
          />
        </section>

        <section className="rounded-[10px] border border-border bg-card p-5 shadow-sutil">
          <header className="mb-3.5">
            <h2 className="font-brand text-[15px] font-bold tracking-[-0.01em] text-foreground">Habilidades</h2>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              O que este agente pode fazer sozinho. Cada uma é uma permissão.
            </p>
          </header>

          <div className="flex flex-col gap-2">
            {HABILIDADES.map((h) => {
              const on = ligadas.includes(h.id);
              return (
                <div
                  key={h.id}
                  className={cn(
                    "flex items-start gap-3 rounded-[10px] border border-border bg-background px-4 py-3 transition-opacity",
                    !on && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-[13px] font-bold text-foreground">{h.nome}</strong>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", CLS_RISCO[h.risco])}>
                        risco {h.risco}
                      </span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{h.desc}</p>
                  </div>
                  <Switch checked={on} onCheckedChange={() => alternar(h.id)} />
                </div>
              );
            })}
          </div>

          {/* A regra dura, repetida onde a permissão é dada. É o que separa este
              produto de um chatbot. */}
          <div className="mt-4 flex gap-3.5 rounded-[10px] bg-primary p-4 text-white">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-terra/20 text-terra">
              <Shield size={16} />
            </span>
            <div>
              <strong className="text-[13px]">A IA propõe, o código decide</strong>
              <p className="mt-1 max-w-[68ch] text-[12px] leading-relaxed text-white/70">
                Mesmo com “Emitir nota fiscal” ligada, o agente nunca emite por conta própria. Ele monta o pedido; quem
                valida o CPF, confere o comprovante e dispara a NFS-e é o código, sempre da mesma forma.
              </p>
            </div>
          </div>
        </section>

        {rascunho && (
          <div className="sticky bottom-0 flex items-center gap-3 bg-gradient-to-t from-background via-background pb-2 pt-4">
            <span className="text-[12.5px] text-muted-foreground">Alterações não salvas.</span>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setRascunho(null)}>
              Descartar
            </Button>
            <Button onClick={() => salvar.mutate(rascunho)} disabled={salvar.isPending}>
              Salvar alterações
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Traduz `capabilities` do backend para a lista de ids de habilidade da UI.
 *
 * O backend modela capacidades como campos nomeados (`agenda`, `fiscal`, …); a UI
 * mostra uma lista de permissões. A tradução vive aqui, num lugar só, para a tela
 * não precisar conhecer o formato do payload.
 */
function capacidadesLigadas(a: AgentePersona): string[] {
  const c = a.capabilities;
  const ligadas: string[] = [];
  // `!== false` e não `=== true`: agente salvo antes destes campos existirem não
  // os traz no payload, e tratar ausente como desligado apagaria o que já roda.
  if (c.cobranca !== false) ligadas.push("cobrar");
  if (c.comprovante !== false) ligadas.push("confirmar");
  if (c.chat !== false) ligadas.push("duvidas");
  if (c.agenda) ligadas.push("agendar");
  if (c.fiscal) ligadas.push("emitir");
  return ligadas;
}

function comCapacidadeAlternada(a: AgentePersona, id: string): AgentePersona {
  const c = { ...a.capabilities };
  if (id === "cobrar") c.cobranca = c.cobranca === false;
  if (id === "confirmar") c.comprovante = c.comprovante === false;
  if (id === "duvidas") c.chat = c.chat === false;
  if (id === "agendar") c.agenda = !c.agenda;
  if (id === "emitir") c.fiscal = !c.fiscal;
  return { ...a, capabilities: c };
}
