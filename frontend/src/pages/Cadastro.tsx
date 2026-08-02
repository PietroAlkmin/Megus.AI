import { Fragment, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Brand from "@/components/Brand";
import PainelMarca, { ErroForm } from "@/components/auth/PainelMarca";
import { Campo } from "@/components/ui/megus";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Cadastro em dois passos: acesso, depois clínica.
 *
 * Dois passos porque pedir seis campos de uma vez numa tela de cadastro derruba
 * conversão — e porque a segunda metade (clínica, CNPJ) pode ser completada
 * depois, em Clínica. O CNPJ é opcional de propósito.
 *
 * Ao final, autentica e cai direto no produto. O backend não autentica no
 * register, então fazemos login com as mesmas credenciais em seguida.
 *
 * Marcadores de passo são quadrados em mono, iguais aos dos agentes — não
 * círculos preenchidos.
 */
export default function Cadastro() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [f, setF] = useState({ nome: "", email: "", senha: "", clinica: "", cnpj: "" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  function avancar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f.nome.trim() || !f.email.trim() || f.senha.length < 6) {
      setErro("Preencha nome, e-mail e senha de 6+ caracteres.");
      return;
    }
    setErro("");
    setPasso(2);
  }

  async function finalizar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!f.clinica.trim()) {
      setErro("Informe o nome da clínica.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      await register({ email: f.email, password: f.senha, displayName: f.nome });
      await login({ email: f.email, password: f.senha });
      navigate("/", { replace: true });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar a conta. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-14">
        <div className="mx-auto w-full max-w-[380px]">
          <Brand size="lg" variante="completa" className="mb-9" />
          <h1 className="font-brand text-[30px] font-bold leading-none tracking-[-0.03em] text-foreground">
            Criar conta
          </h1>
          <p className="mb-6 mt-2 text-[13.5px] text-muted-foreground">
            {passo === 1 ? "Primeiro seus dados de acesso." : "Agora a clínica que você vai gerenciar."}
          </p>

          <div className="mb-6 flex items-center gap-2">
            {([1, 2] as const).map((n) => (
              <Fragment key={n}>
                <span
                  className={cn(
                    "grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[3px] font-mono text-[10px] font-medium",
                    passo > n
                      ? "bg-menta-dark text-white"
                      : passo === n
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {passo > n ? <Check size={10} strokeWidth={3} /> : n}
                </span>
                {n === 1 && <span className="h-px flex-1 bg-border" />}
              </Fragment>
            ))}
          </div>

          {passo === 1 ? (
            <form onSubmit={avancar} className="flex flex-col gap-3.5">
              <Campo rot="Seu nome" valor={f.nome} onChange={set("nome")} ph="Pietro Almeida" />
              <Campo rot="E-mail" valor={f.email} onChange={set("email")} ph="voce@clinica.com.br" tipo="email" />
              <Campo rot="Senha" valor={f.senha} onChange={set("senha")} ph="mínimo 6 caracteres" tipo="password" />
              {erro && <ErroForm texto={erro} />}
              <Button type="submit" size="lg" className="mt-1 w-full">
                Continuar <ArrowRight size={15} />
              </Button>
            </form>
          ) : (
            <form onSubmit={finalizar} className="flex flex-col gap-3.5">
              <Campo rot="Nome da clínica" valor={f.clinica} onChange={set("clinica")} ph="Clínica Sorriso" />
              <Campo
                rot="CNPJ (opcional)"
                valor={f.cnpj}
                onChange={set("cnpj")}
                ph="00.000.000/0001-00"
                mono
                dica="Você pode completar os dados fiscais depois, em Clínica."
              />
              {erro && <ErroForm texto={erro} />}
              <div className="mt-1 flex gap-2.5">
                <Button type="button" variant="outline" onClick={() => setPasso(1)}>
                  Voltar
                </Button>
                <Button type="submit" size="lg" className="flex-1" disabled={enviando}>
                  {enviando ? "Criando…" : "Criar conta"}
                </Button>
              </div>
            </form>
          )}

          <div className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
            Já tem conta?
            <Button asChild variant="quieto" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </div>
      <PainelMarca />
    </div>
  );
}
