import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CreditCard, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import * as empresaService from "@/services/empresa";

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
  const { user } = useAuth();
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });

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
      // sem e-mail salvo ainda? usa o do login como ponto de partida (editável).
      email: data.email || user?.email || "",
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

  const [cepStatus, setCepStatus] = useState<"idle" | "buscando" | "nao-encontrado">("idle");

  // Busca rua/cidade/UF pelo CEP (ViaCEP, pública e gratuita). Preenche os campos
  // mas deixa tudo editável — o número da casa a ViaCEP não traz. Silenciosa em
  // erro de rede (a pessoa pode digitar à mão).
  async function buscarCep(cepBruto: string) {
    const cep = cepBruto.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepStatus("buscando");
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await resp.json();
      if (data.erro) {
        setCepStatus("nao-encontrado");
        return;
      }
      setCepStatus("idle");
      // logradouro pode vir vazio em CEPs de cidade inteira — só sobrescreve se veio algo.
      if (data.logradouro) form.setValue("address", data.logradouro, { shouldDirty: true });
      if (data.localidade) form.setValue("city", data.localidade, { shouldDirty: true });
      if (data.uf) form.setValue("state", data.uf, { shouldDirty: true });
    } catch {
      // rede indisponível — deixa a pessoa preencher manualmente, sem alarme.
      setCepStatus("idle");
    }
  }

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

  function onSubmit(values: EmpresaValues) {
    saveMutation.mutate(values);
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
                    <FormDescription>O nome oficial da empresa na Receita Federal.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da clínica</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>Como sua clínica é conhecida pelos pacientes.</FormDescription>
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
                    <FormDescription>Documento da clínica. Aparece como prestador na nota fiscal.</FormDescription>
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
                    <FormDescription>Número da prefeitura, usado para emitir a nota de serviço.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail de contato da clínica</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormDescription>Onde a clínica recebe avisos. Já preenchemos com o seu — troque se quiser outro.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone da clínica</FormLabel>
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
                      <Input
                        className="font-mono"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          const cep = e.target.value.replace(/\D/g, "");
                          if (cep.length === 8) buscarCep(cep);
                        }}
                        onBlur={(e) => {
                          field.onBlur();
                          buscarCep(e.target.value);
                        }}
                      />
                    </FormControl>
                    {cepStatus === "buscando" ? (
                      <FormDescription className="flex items-center gap-1.5">
                        <Loader2 className="size-3 animate-spin" /> Buscando endereço…
                      </FormDescription>
                    ) : cepStatus === "nao-encontrado" ? (
                      <FormDescription className="text-warning">CEP não encontrado — preencha o endereço à mão.</FormDescription>
                    ) : (
                      <FormDescription>Preenche o endereço automaticamente.</FormDescription>
                    )}
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
                    <FormDescription>Confira e complete o número.</FormDescription>
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
                    <FormLabel>Como você recebe o Pix</FormLabel>
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
                    <FormDescription>O tipo da sua chave Pix — é onde o dinheiro dos pacientes cai.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pixKey"
                render={({ field }) => {
                  // Se a chave é do tipo CNPJ/CPF, oferece usar o documento já
                  // cadastrado — sem redigitar. Só aparece se ainda não é igual.
                  const pixType = form.watch("pixType");
                  const doc = form.watch("fiscalDoc");
                  const podeUsarDoc = (pixType === "cnpj" || pixType === "cpf") && doc && field.value !== doc;
                  return (
                    <FormItem>
                      <FormLabel>Sua chave Pix</FormLabel>
                      <FormControl>
                        <Input className="font-mono" {...field} />
                      </FormControl>
                      {podeUsarDoc ? (
                        <FormDescription>
                          <button
                            type="button"
                            className="font-medium text-success underline-offset-2 hover:underline"
                            onClick={() => form.setValue("pixKey", doc, { shouldDirty: true })}
                          >
                            Usar o {pixType.toUpperCase()} da clínica ({doc})
                          </button>
                        </FormDescription>
                      ) : (
                        <FormDescription>A chave que os pacientes usam para te pagar.</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="paymentInstructions"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Mensagem que o paciente recebe ao ser cobrado</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormDescription>
                      O Kaua envia esta mensagem (com o valor) ao cobrar um paciente que ainda não pagou.
                    </FormDescription>
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
    </div>
  );
}