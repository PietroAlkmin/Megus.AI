import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import AuthBackdrop from "@/components/AuthBackdrop";
import Brand from "@/components/Brand";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    try {
      await login(values);
      toast.success("Login efetuado! Redirecionando…");
      navigate("/", { replace: true });
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
            className="flex w-full max-w-[432px] flex-col gap-[18px] rounded-xl border border-border bg-white/[0.82] p-9 shadow-lg backdrop-blur-xl"
          >
            <div className="text-center">
              <h1 className="font-brand text-[27px] font-extrabold tracking-tight text-foreground">Bem-vindo de volta</h1>
              <p className="mt-[7px] text-[14.5px] text-muted-foreground">Acesse o painel do seu atendente virtual.</p>
            </div>

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
                        placeholder="••••••••"
                        className="h-[50px] pl-10 pr-10"
                        autoComplete="current-password"
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

            <Button type="submit" disabled={form.formState.isSubmitting} className="mt-0.5 h-[50px] rounded-md text-[15px] font-bold">
              {form.formState.isSubmitting ? "Entrando…" : "Entrar"}
              {!form.formState.isSubmitting && <ArrowRight className="h-[17px] w-[17px]" />}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Ainda não tem conta?{" "}
              <Link to="/cadastro" className="font-bold text-accent">
                Criar conta
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
