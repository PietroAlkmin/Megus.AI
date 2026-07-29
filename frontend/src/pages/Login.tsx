import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Brand from "@/components/Brand";
import PainelMarca, { ErroForm } from "@/components/auth/PainelMarca";
import { Campo } from "@/components/ui/megus";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

/**
 * Login.
 *
 * Reescrito na linguagem visual atual: sem cartão de vidro, sem backdrop de
 * formas, sem ícones dentro dos campos. O peso visual vai para a foto da
 * clínica — a promessa da marca — e o formulário fica quieto.
 *
 * O erro aparece como fio na margem (`ErroForm`), não como toast: erro de
 * credencial pertence ao formulário, não a um aviso que passa e some.
 */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!email.trim() || senha.length < 6) {
      setErro("Informe e-mail e uma senha de 6+ caracteres.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      await login({ email, password: senha });
      navigate("/", { replace: true });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-14">
        <div className="mx-auto w-full max-w-[380px]">
          <Brand size="lg" variante="completa" className="mb-9" />
          <h1 className="font-brand text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground">Entrar</h1>
          <p className="mb-7 mt-2 text-[13.5px] text-muted-foreground">
            Gestão de clínica, do agendamento à nota fiscal.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
            <Campo rot="E-mail" valor={email} onChange={setEmail} ph="voce@clinica.com.br" tipo="email" />
            <Campo rot="Senha" valor={senha} onChange={setSenha} ph="••••••••" tipo="password" />
            {erro && <ErroForm texto={erro} />}
            <Button type="submit" size="lg" className="mt-1 w-full" disabled={enviando}>
              {enviando ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
            Não tem conta?
            <Button asChild variant="quieto" size="sm">
              <Link to="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </div>
      </div>
      <PainelMarca />
    </div>
  );
}
