import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import AuthBackdrop from "@/components/AuthBackdrop";
import Brand from "@/components/Brand";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

// Só os campos que `/api/auth/register` de fato aceita (email, password,
// displayName) — o resto do onboarding da Megus (Pix, WhatsApp do bot) é
// dado de EMPRESA/AGENTE, coletado depois de logado (próxima etapa).
const cadastroSchema = z
  .object({
    displayName: z.string().min(2, "Informe seu nome."),
    email: z.string().email("E-mail inválido."),
    password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres."),
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type CadastroValues = z.infer<typeof cadastroSchema>;

export default function Cadastro() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<CadastroValues>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: { displayName: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: CadastroValues) {
    try {
      await register({ email: values.email, password: values.password, displayName: values.displayName });
      toast.success("Conta criada com sucesso! Faça login para continuar.");
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Erro inesperado. Tente novamente.");
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-card">
      <AuthBackdrop />

      <header className="relative z-10 px-8 py-6">
        <Brand />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-6 pt-2">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex w-full max-w-[452px] flex-col gap-4 rounded-xl border border-border bg-white/[0.82] p-9 shadow-lg backdrop-blur-xl"
          >
            <div className="text-center">
              <h1 className="font-brand text-[26px] font-extrabold tracking-tight text-foreground">Criar conta</h1>
              <p className="mt-[7px] text-[14.5px] text-muted-foreground">Configure os dados da sua clínica para começar.</p>
            </div>

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-bold uppercase tracking-wide text-foreground/80">Nome</FormLabel>
                  <FormControl>
                    <div className="relative flex items-center">
                      <User className="pointer-events-none absolute left-3.5 h-[17px] w-[17px] text-muted-foreground" />
                      <Input placeholder="Seu nome completo" className="h-[50px] pl-10" autoComplete="name" {...field} />
                    </div>
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
                  <FormLabel className="text-[11px] font-bold uppercase tracking-wide text-foreground/80">E-mail</FormLabel>
                  <FormControl>
                    <div className="relative flex items-center">
                      <Mail className="pointer-events-none absolute left-3.5 h-[17px] w-[17px] text-muted-foreground" />
                      <Input type="email" placeholder="voce@clinica.com.br" className="h-[50px] pl-10" autoComplete="email" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-bold uppercase tracking-wide text-foreground/80">Senha</FormLabel>
                  <FormControl>
                    <div className="relative flex items-center">
                      <Lock className="pointer-events-none absolute left-3.5 h-[17px] w-[17px] text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Mínimo 6 caracteres"
                        className="h-[50px] pl-10 pr-10"
                        autoComplete="new-password"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                        title={showPassword ? "Ocultar" : "Mostrar"}
                      >
                        {showPassword ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-bold uppercase tracking-wide text-foreground/80">Confirmar senha</FormLabel>
                  <FormControl>
                    <div className="relative flex items-center">
                      <Lock className="pointer-events-none absolute left-3.5 h-[17px] w-[17px] text-muted-foreground" />
                      <Input type={showPassword ? "text" : "password"} placeholder="Repita a senha" className="h-[50px] pl-10" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={form.formState.isSubmitting} className="mt-1 h-[50px] rounded-md text-[15px] font-bold">
              {form.formState.isSubmitting ? "Criando conta…" : "Criar conta"}
              {!form.formState.isSubmitting && <ArrowRight className="h-[17px] w-[17px]" />}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="font-bold text-accent">
                Entrar
              </Link>
            </p>
          </form>
        </Form>
      </main>

      <footer className="relative z-10 mx-auto max-w-[460px] px-5 pb-7 text-center text-[12.5px] leading-relaxed text-muted-foreground/80">
        Ao continuar você aceita os <span className="underline underline-offset-2">Termos de uso</span> e a{" "}
        <span className="underline underline-offset-2">Política de privacidade</span> da Megus AI.
      </footer>
    </div>
  );
}
