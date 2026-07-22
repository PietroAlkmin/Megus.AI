import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Check, FileText, Languages, Layers, Loader2, MessageCircle,
  Pencil, Plus, Smile, Sparkles, Trash2, Upload, Zap,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as agenteService from "@/services/agente";
import * as empresaService from "@/services/empresa";
import { SEGMENTOS } from "@/lib/segmentos";

const TONS: { id: agenteService.AgenteTone; titulo: string; desc: string }[] = [
  { id: "formal", titulo: "Formal", desc: 'Tratamento por "senhor(a)", sem gírias' },
  { id: "equilibrado", titulo: "Equilibrado", desc: "Cordial e claro, padrão recomendado" },
  { id: "descontraido", titulo: "Descontraído", desc: "Próximo e leve, linguagem do dia a dia" },
];

const LANGS: { id: agenteService.AgenteLang; label: string }[] = [
  { id: "pt", label: "Português (BR)" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

const DOCS: { id: agenteService.FiscalDocType; titulo: string; desc: string; emBreve: boolean }[] = [
  { id: "nfe", titulo: "NF-e", desc: "Mercadorias", emBreve: true },
  { id: "nfce", titulo: "NFC-e", desc: "Consumidor final", emBreve: true },
  { id: "nfse", titulo: "NFS-e", desc: "Serviços", emBreve: false },
];

const SUGESTOES = [
  "Tira-dúvidas sobre NF-e e situação fiscal",
  "Cobrança amigável de boletos vencidos",
  "Agendamento e confirmação de horários",
];

const capabilitiesSchema = z.object({
  agenda: z.boolean(),
  agendaLink: z.string().nullable(),
  fiscal: z.boolean(),
  fiscalDocType: z.enum(["nfe", "nfce", "nfse"]).nullable(),
  linkedServiceIds: z.array(z.string()),
});

const agenteSchema = z.object({
  name: z.string().min(1, "Informe o nome do agente."),
  segment: z.string(),
  tone: z.enum(["formal", "equilibrado", "descontraido"]),
  emojis: z.boolean(),
  lang: z.enum(["pt", "en", "es"]),
  instructions: z.string(),
  fewShotDialogs: z.array(z.object({ q: z.string(), a: z.string() })),
  capabilities: capabilitiesSchema,
});
type AgenteValues = z.infer<typeof agenteSchema>;

const AGENTE_DEFAULTS: AgenteValues = {
  name: "Kaua",
  segment: "",
  tone: "equilibrado",
  emojis: true,
  lang: "pt",
  instructions: "",
  fewShotDialogs: [],
  capabilities: { agenda: false, agendaLink: null, fiscal: false, fiscalDocType: null, linkedServiceIds: [] },
};

export interface AgenteFormProps {
  onSaved?: () => void;
}

// Estado do formulário de serviço (gestão movida da tela de Empresa).
interface ServicoFormState {
  id: string | null;
  code: string;
  description: string;
  issCode: string;
  price: string;
}
const SERVICO_VAZIO: ServicoFormState = { id: null, code: "", description: "", issCode: "", price: "" };

function formatBRL(value: number): string {
  return "R$ " + value.toFixed(2).replace(".", ",");
}

// Cabeçalho do bloco: ícone colorido + número + título + subtítulo (estilo das imagens).
function BlocoHeader({ n, icon, titulo, desc }: { n: number; icon: ReactNode; titulo: string; desc: string }) {
  return (
    <div className="flex items-start gap-3.5 text-left">
      <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <div>
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-md bg-success/10 text-[11px] font-semibold text-success">{n}</span>
          <span className="font-brand text-lg font-semibold text-foreground">{titulo}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

// Rótulo de campo com ícone (o "◇ Nome do agente" das imagens).
function CampoLabel({ icon, children, hint }: { icon: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {icon} {children}
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AgenteForm({ onSaved }: AgenteFormProps) {
  const queryClient = useQueryClient();
  const agenteQuery = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });
  const servicosQuery = useQuery({ queryKey: ["empresa", "servicos"], queryFn: empresaService.listServicos });

  const form = useForm<AgenteValues>({ resolver: zodResolver(agenteSchema), defaultValues: AGENTE_DEFAULTS });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "fewShotDialogs" });
  const [openItem, setOpenItem] = useState<string>("identidade");

  // --- gestão de serviços (movida da tela de Empresa) ---
  const [servicoForm, setServicoForm] = useState<ServicoFormState | null>(null);

  const servicoMutation = useMutation({
    mutationFn: empresaService.saveServico,
    onSuccess: (servico) => {
      queryClient.setQueryData<empresaService.Servico[]>(["empresa", "servicos"], (prev) => {
        if (!prev) return [servico];
        const isEdit = prev.some((s) => s.id === servico.id);
        return isEdit ? prev.map((s) => (s.id === servico.id ? servico : s)) : [...prev, servico];
      });
      setServicoForm(null);
      toast.success("Serviço salvo.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar o serviço.");
    },
  });

  const deleteServicoMutation = useMutation({
    mutationFn: empresaService.deleteServico,
    onSuccess: (result) => {
      queryClient.setQueryData<empresaService.Servico[]>(["empresa", "servicos"], (prev) => prev?.filter((s) => s.id !== result.id));
      // se o serviço apagado estava vinculado, desvincula
      const atual = form.getValues("capabilities.linkedServiceIds");
      if (atual.includes(result.id)) {
        form.setValue("capabilities.linkedServiceIds", atual.filter((x) => x !== result.id), { shouldDirty: true });
      }
      toast.success("Serviço removido.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível remover o serviço.");
    },
  });

  function handleSalvarServico() {
    if (!servicoForm || !servicoForm.description.trim()) return;
    servicoMutation.mutate({
      id: servicoForm.id ?? undefined,
      code: servicoForm.code,
      description: servicoForm.description,
      issCode: servicoForm.issCode,
      price: parseFloat(servicoForm.price.replace(",", ".")) || 0,
    });
  }

  useEffect(() => {
    const data = agenteQuery.data;
    if (!data) return;
    form.reset({
      name: data.name || "Kaua",
      segment: data.segment ?? "",
      tone: data.tone || "equilibrado",
      emojis: data.emojis !== false,
      lang: data.lang || "pt",
      instructions: data.instructions ?? "",
      fewShotDialogs: data.fewShotDialogs ?? [],
      capabilities: data.capabilities ?? AGENTE_DEFAULTS.capabilities,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenteQuery.data]);

  const saveMutation = useMutation({
    mutationFn: agenteService.saveAgente,
    onSuccess: (data) => {
      queryClient.setQueryData(["agente"], data);
      toast.success("Agente salvo.");
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar. Tente novamente.");
    },
  });

  function onSubmit(values: AgenteValues) {
    saveMutation.mutate(values);
  }

  if (agenteQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (agenteQuery.isError) {
    return <p className="py-16 text-center text-sm text-destructive">Não foi possível carregar o agente.</p>;
  }

  const v = form.watch();
  const servicos = servicosQuery.data ?? [];

  // helper para os cards de seleção (segmento, tom, doc)
  const selCard = (active: boolean) =>
    cn(
      "flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-all",
      active ? "border-success ring-1 ring-success bg-success/5" : "border-border hover:border-muted-foreground/40",
    );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem} className="flex flex-col gap-3">

        {/* 1 — IDENTIDADE */}
        <AccordionItem value="identidade" className="rounded-2xl border border-border bg-card px-5 shadow-sm">
          <AccordionTrigger className="py-4 hover:no-underline">
            <BlocoHeader n={1} icon={<Bot className="size-5" />} titulo="Identidade e segmento" desc="Quem é o agente e em que área a sua empresa atua." />
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <CampoLabel icon={<Bot className="size-3.5" />} hint="Aparece no início da conversa e na assinatura das mensagens.">Nome do agente</CampoLabel>
            <Input value={v.name} onChange={(e) => form.setValue("name", e.target.value, { shouldDirty: true })} className="mb-5" />

            <CampoLabel icon={<Layers className="size-3.5" />} hint="Direciona o estilo das respostas e sugere o tipo de nota fiscal.">Segmento de negócio</CampoLabel>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SEGMENTOS.map((seg) => (
                <button key={seg.id} type="button" disabled={seg.emBreve}
                  onClick={() => !seg.emBreve && form.setValue("segment", seg.id, { shouldDirty: true })}
                  className={cn(selCard(v.segment === seg.id), seg.emBreve && "cursor-not-allowed opacity-55")}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", v.segment === seg.id ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                    <Layers className="size-4" />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{seg.titulo}</span>
                      {seg.emBreve && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">Em breve</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">{seg.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 2 — PERSONALIDADE */}
        <AccordionItem value="personalidade" className="rounded-2xl border border-border bg-card px-5 shadow-sm">
          <AccordionTrigger className="py-4 hover:no-underline">
            <BlocoHeader n={2} icon={<Smile className="size-5" />} titulo="Personalidade e tom" desc="Define o estilo da escrita. Você pode refinar nas instruções abaixo." />
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <CampoLabel icon={<MessageCircle className="size-3.5" />}>Tom de voz</CampoLabel>
            <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {TONS.map((t) => (
                <button key={t.id} type="button" onClick={() => form.setValue("tone", t.id, { shouldDirty: true })} className={cn(selCard(v.tone === t.id), "flex-col gap-1")}>
                  <span className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{t.titulo}</span>
                    {v.tone === t.id && <Check className="size-4 text-success" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{t.desc}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Smile className="size-3.5" /> Usar emojis</div>
                  <p className="text-xs text-muted-foreground">Deixa a conversa mais leve 👋</p>
                </div>
                <Switch checked={v.emojis} onCheckedChange={(c) => form.setValue("emojis", c, { shouldDirty: true })} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Languages className="size-3.5" /> Idioma</div>
                  <p className="text-xs text-muted-foreground">Idioma principal das respostas</p>
                </div>
                <select
                  value={v.lang}
                  onChange={(e) => form.setValue("lang", e.target.value as agenteService.AgenteLang, { shouldDirty: true })}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
                >
                  {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 3 — INSTRUÇÕES */}
        <AccordionItem value="instrucoes" className="rounded-2xl border border-border bg-card px-5 shadow-sm">
          <AccordionTrigger className="py-4 hover:no-underline">
            <BlocoHeader n={3} icon={<FileText className="size-5" />} titulo="Instruções iniciais" desc={'O "briefing" do agente — o que fazer, o que evitar e quando acionar um humano.'} />
          </AccordionTrigger>
          <AccordionContent className="pb-5">
            <Textarea
              rows={5}
              placeholder="Você é o atendente virtual da nossa empresa no WhatsApp. Responda dúvidas, ajude a agendar atendimentos e oriente sobre pagamentos com cordialidade. Quando não souber, ofereça transferir para um atendente humano."
              value={v.instructions}
              onChange={(e) => form.setValue("instructions", e.target.value, { shouldDirty: true })}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Sugestões:</span>
              {SUGESTOES.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => form.setValue("instructions", v.instructions ? `${v.instructions}\n\n${sug}.` : `${sug}.`, { shouldDirty: true })}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-success hover:bg-success/5"
                >
                  + {sug}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 4 — O QUE O AGENTE FAZ */}
        <AccordionItem value="acoes" className="rounded-2xl border border-border bg-card px-5 shadow-sm">
          <AccordionTrigger className="py-4 hover:no-underline">
            <BlocoHeader n={4} icon={<Zap className="size-5" />} titulo="O que o agente faz" desc="Ative as ações que o agente pode executar nas conversas." />
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-3 pb-5">
            {/* Conversar — sempre ativo */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
              <span className="grid size-9 place-items-center rounded-lg bg-success/10 text-success"><MessageCircle className="size-4" /></span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Conversar e tirar dúvidas</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Essencial</span>
                </div>
                <p className="text-xs text-muted-foreground">Responde com base nas instruções e nos materiais de treinamento.</p>
              </div>
              <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-[11px] font-bold uppercase text-success">Ativo</span>
            </div>

            {/* Emitir nota */}
            <div className="rounded-xl border border-border bg-card px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-4" /></span>
                <div className="flex-1">
                  <span className="text-sm font-semibold text-foreground">Emitir nota após o pagamento</span>
                  <p className="text-xs text-muted-foreground">Identifica a confirmação do pagamento e emite o documento fiscal.</p>
                </div>
                <Switch checked={v.capabilities.fiscal} onCheckedChange={(c) => form.setValue("capabilities.fiscal", c, { shouldDirty: true })} />
              </div>
              {v.capabilities.fiscal && (
                <div className="mt-3 border-t border-dashed pt-3">
                  <CampoLabel icon={<FileText className="size-3.5" />}>Tipo de documento</CampoLabel>
                  <div className="grid grid-cols-3 gap-2.5">
                    {DOCS.map((d) => (
                      <button key={d.id} type="button" disabled={d.emBreve}
                        onClick={() => !d.emBreve && form.setValue("capabilities.fiscalDocType", d.id, { shouldDirty: true })}
                        className={cn("relative rounded-xl border bg-card py-2.5 text-center transition-all",
                          d.emBreve ? "cursor-not-allowed opacity-55 border-border" :
                          v.capabilities.fiscalDocType === d.id ? "border-success ring-1 ring-success bg-success/5" : "border-border hover:border-muted-foreground/40")}>
                        {d.emBreve && <span className="absolute right-1.5 top-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">Em breve</span>}
                        <span className="block text-sm font-bold text-foreground">{d.titulo}</span>
                        <span className="block text-xs text-muted-foreground">{d.desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* Serviços vinculados — gestão completa (cadastrar/editar/apagar/marcar) */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <Layers className="size-3.5" /> Serviços vinculados ({v.capabilities.linkedServiceIds.length})
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setServicoForm(SERVICO_VAZIO)}>
                      <Plus className="size-3.5" /> Cadastrar serviço
                    </Button>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Marque quais o agente usa nas notas. Cadastrados aqui ficam salvos na empresa.
                  </p>

                  <div className="mt-2 flex flex-col gap-1.5">
                    {servicosQuery.isLoading && <p className="text-xs text-muted-foreground">Carregando serviços…</p>}
                    {!servicosQuery.isLoading && servicos.length === 0 && !servicoForm && (
                      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Nenhum serviço cadastrado ainda. Clique em "Cadastrar serviço".
                      </p>
                    )}
                    {servicos.map((s) => {
                      const marcado = v.capabilities.linkedServiceIds.includes(s.id);
                      return (
                        <div key={s.id} className={cn("flex items-center gap-2.5 rounded-lg border px-3 py-2", marcado ? "border-success/40 bg-success/5" : "border-border")}>
                          <button type="button"
                            onClick={() => {
                              const cur = v.capabilities.linkedServiceIds;
                              form.setValue("capabilities.linkedServiceIds", marcado ? cur.filter((x) => x !== s.id) : [...cur, s.id], { shouldDirty: true });
                            }}
                            className="flex flex-1 items-center gap-3 text-left">
                            <span className={cn("grid size-5 shrink-0 place-items-center rounded border", marcado ? "border-success bg-success text-white" : "border-muted-foreground/40")}>
                              {marcado && <Check className="size-3.5" />}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">{s.code || "—"}</span>
                            <span className="flex-1 text-sm font-medium text-foreground">{s.description}</span>
                            <span className="font-mono text-xs text-muted-foreground">ISS {s.issCode || "—"} · {formatBRL(s.price)}</span>
                          </button>
                          <Button type="button" variant="ghost" size="icon" className="size-7" title="Editar"
                            onClick={() => setServicoForm({ id: s.id, code: s.code, description: s.description, issCode: s.issCode, price: String(s.price) })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="size-7" title="Excluir"
                            disabled={deleteServicoMutation.isPending}
                            onClick={() => deleteServicoMutation.mutate(s.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      );
                    })}

                    {/* Formulário de cadastro/edição de serviço */}
                    {servicoForm && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                          <Input placeholder="Código" value={servicoForm.code}
                            onChange={(e) => setServicoForm({ ...servicoForm, code: e.target.value })} />
                          <Input className="sm:col-span-2" placeholder="Nome do serviço" value={servicoForm.description}
                            onChange={(e) => setServicoForm({ ...servicoForm, description: e.target.value })} />
                          <Input placeholder="ISS (ex: 4.01)" value={servicoForm.issCode}
                            onChange={(e) => setServicoForm({ ...servicoForm, issCode: e.target.value })} />
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                          <Input placeholder="Valor (ex: 250)" value={servicoForm.price}
                            onChange={(e) => setServicoForm({ ...servicoForm, price: e.target.value })} />
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setServicoForm(null)}>Cancelar</Button>
                          <Button type="button" size="sm" disabled={servicoMutation.isPending} onClick={handleSalvarServico}>
                            {servicoForm.id ? "Salvar" : "Adicionar"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* 5 — TREINAMENTO */}
        <AccordionItem value="treinamento" className="rounded-2xl border border-border bg-card px-5 shadow-sm">
          <AccordionTrigger className="py-4 hover:no-underline">
            <BlocoHeader n={5} icon={<Layers className="size-5" />} titulo="Treinamento (insumos de mensagem)" desc="Conteúdo que o agente usa como base. Quanto mais contexto, melhor." />
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-5 pb-5">
            {/* Upload — EM BREVE */}
            <div>
              <CampoLabel icon={<Upload className="size-3.5" />} hint="PDF, Word, planilhas ou TXT. O agente consulta esses documentos ao responder.">Arquivos de conhecimento</CampoLabel>
              <div className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 text-center opacity-70">
                <span className="absolute right-3 top-3 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Em breve</span>
                <Upload className="size-7 text-muted-foreground" />
                <div className="text-sm font-semibold text-muted-foreground">Arraste arquivos ou clique para enviar</div>
                <div className="text-xs text-muted-foreground">PDF · DOCX · XLSX · TXT — até 20 MB cada</div>
              </div>
            </div>

            {/* Exemplos de conversa — ATIVO */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <CampoLabel icon={<MessageCircle className="size-3.5" />} hint="Pares de pergunta e resposta ideais. O agente aprende o estilo das respostas.">Exemplos de conversa</CampoLabel>
                <Button type="button" variant="outline" size="sm" onClick={() => append({ q: "", a: "" })}>
                  <Plus className="size-3.5" /> Adicionar
                </Button>
              </div>

              {fields.length === 0 && (
                <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
                  Nenhum exemplo ainda. Adicione pares cliente/agente para ensinar o estilo.
                </p>
              )}

              <div className="flex flex-col gap-3">
                {fields.map((fieldItem, index) => (
                  <div key={fieldItem.id} className="rounded-xl border border-border bg-muted/20 p-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Exemplo {index + 1}</span>
                      <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => remove(index)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1.5 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">CLIENTE</span>
                        <Textarea rows={2} placeholder="Bom dia, queria marcar uma consulta." value={v.fewShotDialogs[index]?.q ?? ""}
                          onChange={(e) => form.setValue(`fewShotDialogs.${index}.q`, e.target.value, { shouldDirty: true })} />
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-1.5 shrink-0 rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">AGENTE</span>
                        <Textarea rows={2} placeholder="Bom dial 😊 Claro, posso te ajudar. Aqui está nossa agenda: {link}." value={v.fewShotDialogs[index]?.a ?? ""}
                          onChange={(e) => form.setValue(`fewShotDialogs.${index}.a`, e.target.value, { shouldDirty: true })} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Barra de salvar */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 px-5 py-3 shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5" /> Você poderá editar tudo isso depois.</span>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <><Loader2 className="size-4 animate-spin" /> Salvando…</> : "Salvar agente"}
        </Button>
      </div>
    </form>
  );
}