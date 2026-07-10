import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import * as agenteService from "@/services/agente";

import { SEGMENTOS } from "@/lib/segmentos";

// Conteúdo portado de `Megus Wireframe/src/whatsapp/AtendenteVirtualModal.jsx`
// (seções 1/identidade, 2/personalidade, 3/instruções, 5/exemplos — as seções
// 4/ações e o restante de 5/treinamento por arquivo ficam fora do escopo desta
// rota: `GET/PUT /api/agente` só cobre os campos de persona).

const TONS: { id: agenteService.AgenteTone; titulo: string; desc: string }[] = [
  { id: "formal", titulo: "Formal", desc: 'Tratamento por "senhor(a)"' },
  { id: "equilibrado", titulo: "Equilibrado", desc: "Cordial e claro (recomendado)" },
  { id: "descontraido", titulo: "Descontraído", desc: "Próximo e leve" },
];

const LANGS: { id: agenteService.AgenteLang; label: string }[] = [
  { id: "pt", label: "Português (BR)" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

const SUGESTOES = ["Tira-dúvidas sobre a nota fiscal", "Confirmação de agendamentos", "Cobrança amigável de pendências"];

const agenteSchema = z.object({
  name: z.string().min(1, "Informe o nome do agente."),
  segment: z.string(),
  tone: z.enum(["formal", "equilibrado", "descontraido"]),
  emojis: z.boolean(),
  lang: z.enum(["pt", "en", "es"]),
  instructions: z.string(),
  fewShotDialogs: z.array(z.object({ q: z.string(), a: z.string() })),
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
};

export interface AgenteFormProps {
  /** Disparado após salvar a persona com sucesso — usado pelo wizard de onboarding. */
  onSaved?: () => void;
}

/** Form da persona do agente (nome, segmento, tom, emojis, idioma, instruções, few-shot). */
export default function AgenteForm({ onSaved }: AgenteFormProps) {
  const queryClient = useQueryClient();
  const agenteQuery = useQuery({ queryKey: ["agente"], queryFn: agenteService.getAgente });

  const form = useForm<AgenteValues>({
    resolver: zodResolver(agenteSchema),
    defaultValues: AGENTE_DEFAULTS,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "fewShotDialogs" });

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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenteQuery.data]);

  const saveMutation = useMutation({
    mutationFn: agenteService.saveAgente,
    onSuccess: (data) => {
      queryClient.setQueryData(["agente"], data);
      toast.success("Persona do agente salva.");
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
    return <p className="py-16 text-center text-sm text-destructive">Não foi possível carregar a persona do agente.</p>;
  }

  const instructions = form.watch("instructions");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Tabs defaultValue="identidade" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="identidade">Identidade</TabsTrigger>
            <TabsTrigger value="personalidade">Personalidade</TabsTrigger>
            <TabsTrigger value="instrucoes">Instruções</TabsTrigger>
            <TabsTrigger value="exemplos">Exemplos ({fields.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="identidade" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do agente</FormLabel>
                  <p className="text-xs text-muted-foreground">Aparece no início da conversa e na assinatura das mensagens.</p>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="segment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Segmento de negócio</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Direciona o estilo das respostas e sugere o tipo de nota fiscal.
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {SEGMENTOS.map((seg) => (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => field.onChange(seg.id)}
                        className={cn(
                          "flex flex-col gap-0.5 rounded-md border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/60",
                          field.value === seg.id && "border-primary bg-primary/5 ring-1 ring-primary",
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground">{seg.titulo}</span>
                        <span className="text-xs text-muted-foreground">{seg.desc}</span>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent value="personalidade" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
            <FormField
              control={form.control}
              name="tone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tom de voz</FormLabel>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {TONS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => field.onChange(t.id)}
                        className={cn(
                          "flex flex-col gap-0.5 rounded-md border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/60",
                          field.value === t.id && "border-primary bg-primary/5 ring-1 ring-primary",
                        )}
                      >
                        <span className="text-sm font-semibold text-foreground">{t.titulo}</span>
                        <span className="text-xs text-muted-foreground">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="emojis"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border border-border bg-secondary/60 px-4 py-3">
                    <div>
                      <FormLabel>Usar emojis</FormLabel>
                      <p className="text-xs text-muted-foreground">Deixa a conversa mais leve</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lang"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between gap-3 rounded-md border border-border bg-secondary/60 px-4 py-3">
                    <div>
                      <FormLabel>Idioma</FormLabel>
                      <p className="text-xs text-muted-foreground">Idioma das respostas</p>
                    </div>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LANGS.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>

          <TabsContent value="instrucoes" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instruções iniciais</FormLabel>
                  <p className="text-xs text-muted-foreground">O briefing — o que fazer, evitar e quando chamar um humano.</p>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="Descreva como o agente deve se comportar: o que fazer, o que evitar e quando transferir para um humano."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Sugestões:</span>
              {SUGESTOES.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() =>
                    form.setValue("instructions", instructions ? `${instructions}\n\n${sug}.` : `${sug}.`, {
                      shouldDirty: true,
                    })
                  }
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-accent hover:bg-secondary/60"
                >
                  + {sug}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="exemplos" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Exemplos de conversa</div>
                <p className="text-xs text-muted-foreground">Pares de pergunta e resposta ideais (few-shot).</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ q: "", a: "" })}>
                <Plus className="h-3.5 w-3.5" /> Adicionar exemplo
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="rounded-md border border-dashed border-border bg-secondary/60 px-4 py-3 text-center text-sm text-muted-foreground">
                Nenhum exemplo cadastrado.
              </p>
            )}

            {fields.map((fieldItem, index) => (
              <div key={fieldItem.id} className="rounded-md border border-border p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Exemplo {index + 1}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2.5">
                  <FormField
                    control={form.control}
                    name={`fewShotDialogs.${index}.q`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1.5 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            CLIENTE
                          </span>
                          <FormControl>
                            <Textarea rows={2} placeholder="Mensagem do cliente…" {...field} />
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`fewShotDialogs.${index}.a`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start gap-2.5">
                          <span className="mt-1.5 shrink-0 rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                            AGENTE
                          </span>
                          <FormControl>
                            <Textarea rows={2} placeholder="Resposta ideal do agente…" {...field} />
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-end gap-3">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando…" : "Salvar persona"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
