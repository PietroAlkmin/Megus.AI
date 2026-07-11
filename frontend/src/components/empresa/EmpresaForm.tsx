import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CreditCard, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
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
    </div>
  );
}