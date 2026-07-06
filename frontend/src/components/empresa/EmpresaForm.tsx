import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CreditCard, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import * as empresaService from "@/services/empresa";
import type { Servico } from "@/services/empresa";

// Só validamos formato (strings) — o backend aceita todos os campos opcionais/vazios
// (empresa recém-criada chega com tudo em branco). react-hook-form exige defaultValues
// tipados, por isso os campos aqui são string (não string | undefined).
const empresaSchema = z.object({
  name: z.string(),
  fiscalName: z.string(),
  fiscalDoc: z.string(),
  municipalRegistration: z.string(),
  email: z.string(),
  phone: z.string(),
  zip: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pixType: z.string(),
  pixKey: z.string(),
  paymentInstructions: z.string(),
});
type EmpresaValues = z.infer<typeof empresaSchema>;

const EMPRESA_DEFAULTS: EmpresaValues = {
  name: "",
  fiscalName: "",
  fiscalDoc: "",
  municipalRegistration: "",
  email: "",
  phone: "",
  zip: "",
  address: "",
  city: "",
  state: "",
  pixType: "cnpj",
  pixKey: "",
  paymentInstructions: "",
};

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

export interface EmpresaFormProps {
  /** Disparado após salvar os dados cadastrais com sucesso — usado pelo wizard de onboarding. */
  onSaved?: () => void;
}

/**
 * Dados cadastrais + formas de cobrança + catálogo de serviços da empresa.
 * Conteúdo portado de `Megus Wireframe/src/empresa/EmpresaPage.jsx`.
 * Reusado em `pages/Empresa.tsx` (edição) e `pages/Onboarding.tsx` (passo 1).
 */
export default function EmpresaForm({ onSaved }: EmpresaFormProps) {
  const queryClient = useQueryClient();
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });
  const servicosQuery = useQuery({ queryKey: ["empresa", "servicos"], queryFn: empresaService.listServicos });
  const [servicoForm, setServicoForm] = useState<ServicoFormState | null>(null);

  const form = useForm<EmpresaValues>({
    resolver: zodResolver(empresaSchema),
    defaultValues: EMPRESA_DEFAULTS,
  });

  useEffect(() => {
    const data = empresaQuery.data;
    if (!data) return;
    form.reset({
      name: data.name ?? "",
      fiscalName: data.fiscalName ?? "",
      fiscalDoc: data.fiscalDoc ?? "",
      municipalRegistration: data.municipalRegistration ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      zip: data.zip ?? "",
      address: data.address ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      pixType: data.pixType || "cnpj",
      pixKey: data.pixKey ?? "",
      paymentInstructions: data.paymentInstructions ?? "",
    });
    // form.reset é estável (react-hook-form) — só precisamos re-rodar quando os dados chegam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaQuery.data]);

  const saveMutation = useMutation({
    mutationFn: empresaService.saveEmpresa,
    onSuccess: (data) => {
      queryClient.setQueryData(["empresa"], data);
      toast.success("Dados da empresa salvos.");
      onSaved?.();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar. Tente novamente.");
    },
  });

  const servicoMutation = useMutation({
    mutationFn: empresaService.saveServico,
    onSuccess: (servico) => {
      queryClient.setQueryData<Servico[]>(["empresa", "servicos"], (prev) => {
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
      queryClient.setQueryData<Servico[]>(["empresa", "servicos"], (prev) => prev?.filter((s) => s.id !== result.id));
      toast.success("Serviço excluído.");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível excluir o serviço.");
    },
  });

  function onSubmit(values: EmpresaValues) {
    saveMutation.mutate(values);
  }

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

  if (empresaQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (empresaQuery.isError) {
    return <p className="py-16 text-center text-sm text-destructive">Não foi possível carregar os dados da empresa.</p>;
  }

  const servicos = servicosQuery.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                <Building2 className="h-[18px] w-[18px] text-primary" />
              </span>
              <div>
                <CardTitle className="font-brand text-base">Dados da empresa</CardTitle>
                <CardDescription>Aparecem como prestador na NFS-e.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="fiscalName"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Razão social</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome fantasia</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fiscalDoc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <Input className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="municipalRegistration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscrição municipal</FormLabel>
                    <FormControl>
                      <Input className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CEP</FormLabel>
                    <FormControl>
                      <Input className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>UF</FormLabel>
                    <FormControl>
                      <Input maxLength={2} className="uppercase" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                <CreditCard className="h-[18px] w-[18px] text-primary" />
              </span>
              <div>
                <CardTitle className="font-brand text-base">Formas de cobrança</CardTitle>
                <CardDescription>Chave que recebe os pagamentos e a mensagem que o Kaua envia ao cobrar.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="pixType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de chave Pix</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {empresaService.PIX_TYPES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pixKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chave Pix</FormLabel>
                    <FormControl>
                      <Input className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentInstructions"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Mensagem de cobrança</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      O Kaua envia esta mensagem (com o valor) ao cobrar um cliente que ainda não pagou.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </Form>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
              <Layers className="h-[18px] w-[18px] text-primary" />
            </span>
            <div>
              <CardTitle className="font-brand text-base">Serviços</CardTitle>
              <CardDescription>Catálogo usado na emissão das NFS-e.</CardDescription>
            </div>
          </div>
          <Button type="button" size="sm" onClick={() => setServicoForm(SERVICO_VAZIO)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar serviço
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {servicosQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando serviços…</p>}
          {!servicosQuery.isLoading && servicos.length === 0 && !servicoForm && (
            <p className="rounded-md border border-dashed border-border bg-secondary/60 px-4 py-3 text-center text-sm text-muted-foreground">
              Nenhum serviço cadastrado.
            </p>
          )}
          {servicos.map((servico) => (
            <div key={servico.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
              <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] font-bold text-muted-foreground">
                {servico.code || "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{servico.description}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">ISS {servico.issCode || "—"}</span>
              <span className="w-24 shrink-0 text-right font-mono text-sm font-bold text-foreground">{formatBRL(servico.price)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Editar"
                onClick={() =>
                  setServicoForm({
                    id: servico.id,
                    code: servico.code,
                    description: servico.description,
                    issCode: servico.issCode,
                    price: String(servico.price),
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Excluir"
                disabled={deleteServicoMutation.isPending}
                onClick={() => deleteServicoMutation.mutate(servico.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {servicoForm && (
            <div className="rounded-md border border-border bg-secondary/60 p-3.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Código"
                  value={servicoForm.code}
                  onChange={(e) => setServicoForm({ ...servicoForm, code: e.target.value })}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="Nome do serviço"
                  value={servicoForm.description}
                  onChange={(e) => setServicoForm({ ...servicoForm, description: e.target.value })}
                />
                <Input
                  placeholder="ISS (ex: 4.01)"
                  value={servicoForm.issCode}
                  onChange={(e) => setServicoForm({ ...servicoForm, issCode: e.target.value })}
                />
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Valor (ex: 250)"
                  value={servicoForm.price}
                  onChange={(e) => setServicoForm({ ...servicoForm, price: e.target.value })}
                />
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setServicoForm(null)}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" disabled={servicoMutation.isPending} onClick={handleSalvarServico}>
                  {servicoForm.id ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
