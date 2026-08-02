import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Campo, TituloPagina } from "@/components/ui/megus";
import { cn, formatarBRL } from "@/lib/utils";
import * as empresaService from "@/services/empresa";

/**
 * Clínica — dados, serviços e cobrança.
 *
 * As três seções não são categorias burocráticas: são as três coisas que o AGENTE
 * LÊ para trabalhar. Dados → o prestador que vai na nota. Serviços → o valor que
 * ele cobra. Cobrança → para onde o dinheiro vai e como ele pede.
 *
 * Era "Empresa". O rename acompanha o posicionamento: o produto é gestão para
 * clínicas, e o usuário pensa "minha clínica", não "minha empresa".
 *
 * ⚠️ Serviços NÃO são campo de `/api/empresa`: vivem em `/api/empresa/servicos`,
 * com CRUD próprio. Por isso eles salvam na hora (mutation dedicada), enquanto
 * os campos cadastrais acumulam num rascunho e salvam juntos no rodapé.
 */
export default function Clinica() {
  const queryClient = useQueryClient();
  const empresaQuery = useQuery({ queryKey: ["empresa"], queryFn: empresaService.getEmpresa });
  const servicosQuery = useQuery({ queryKey: ["servicos"], queryFn: empresaService.listServicos });

  const [aba, setAba] = useState<AbaId>("dados");
  const [rascunho, setRascunho] = useState<empresaService.EmpresaProfile | null>(null);
  const [form, setForm] = useState<ServicoForm | null>(null);
  const [regua, setRegua] = useState(REGUA_PADRAO);

  // Descarta o rascunho quando o servidor devolve dado novo (ex.: trocou de tenant).
  useEffect(() => {
    setRascunho(null);
  }, [empresaQuery.data]);

  const salvar = useMutation({
    mutationFn: (payload: empresaService.EmpresaPayload) => empresaService.saveEmpresa(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["empresa"] });
      toast.success("Dados da clínica salvos.");
    },
    onError: () => toast.error("Não foi possível salvar."),
  });

  const salvarServico = useMutation({
    mutationFn: (payload: empresaService.ServicoPayload) => empresaService.saveServico(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servicos"] });
      setForm(null);
      toast.success("Serviço salvo.");
    },
    onError: () => toast.error("Não foi possível salvar o serviço."),
  });

  const excluirServico = useMutation({
    mutationFn: (id: string) => empresaService.deleteServico(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["servicos"] });
      toast.success("Serviço excluído.");
    },
    onError: () => toast.error("Não foi possível excluir."),
  });

  const e = rascunho ?? empresaQuery.data;
  if (!e) return <div className="grid h-full place-items-center text-[13px] text-muted-foreground">Carregando…</div>;

  const servicos = servicosQuery.data ?? [];
  const set = (k: keyof empresaService.EmpresaProfile) => (v: string) =>
    setRascunho({ ...e, [k]: v } as empresaService.EmpresaProfile);

  function enviarServico() {
    if (!form || !form.description.trim()) return;
    salvarServico.mutate({
      id: form.id ?? undefined,
      code: form.code,
      description: form.description,
      issCode: form.issCode,
      price: parseFloat(form.price.replace(",", ".")) || 0,
    });
  }

  return (
    <div className="mx-auto max-w-[880px] p-4 pb-16 md:p-6 lg:p-7">
      <TituloPagina
        titulo="Clínica"
        sub="É daqui que o agente tira tudo: quem é a clínica, quanto cobrar e como receber."
      />

      {/* Abas com fio contínuo: a aba ativa interrompe o fio, como uma pasta. */}
      <div className="-mt-2 mb-5 flex gap-1 border-b border-border">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={cn(
              "relative -mb-px px-3 pb-2.5 pt-1 text-[13px] font-semibold transition-colors",
              aba === a.id ? "text-foreground" : "text-muted-foreground hover:text-secondary-foreground",
            )}
          >
            {a.label}
            {a.id === "servicos" && servicos.length > 0 && (
              <span className="ml-1.5 font-mono text-[10.5px] text-muted-foreground">{servicos.length}</span>
            )}
            {aba === a.id && <span className="absolute inset-x-0 bottom-[-1px] h-[2px] rounded-[1px] bg-foreground" />}
          </button>
        ))}
      </div>

      <p className="mb-5 max-w-[76ch] text-[12.5px] leading-relaxed text-muted-foreground">
        {ABAS.find((a) => a.id === aba)!.sub}
      </p>

      <div className="flex flex-col gap-4">
        {aba === "dados" && (
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Campo rot="Razão social" valor={e.fiscalName} onChange={set("fiscalName")} className="sm:col-span-2" />
            <Campo rot="Nome fantasia" valor={e.name} onChange={set("name")} />
            <Campo rot="CNPJ" valor={e.fiscalDoc} onChange={set("fiscalDoc")} mono />
            <Campo rot="Inscrição municipal" valor={e.municipalRegistration} onChange={set("municipalRegistration")} mono />
            <Campo rot="E-mail" valor={e.email} onChange={set("email")} tipo="email" />
            <Campo rot="Telefone" valor={e.phone} onChange={set("phone")} mono />
            <Campo rot="Cidade" valor={e.city} onChange={set("city")} />
            <Campo rot="UF" valor={e.state} onChange={set("state")} />
          </div>
        )}

        {aba === "servicos" && (
          <div className="flex flex-col gap-2">
            <div className="mb-1 flex justify-end">
              <Button
                size="sm"
                onClick={() => setForm({ id: null, code: "", description: "", issCode: "", price: "" })}
              >
                <Plus size={13} strokeWidth={2.4} /> Adicionar serviço
              </Button>
            </div>
            {servicos.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-[10px] border border-border bg-background px-3.5 py-2.5"
              >
                <span className="shrink-0 rounded-md bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {s.code || "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                  {s.description}
                </span>
                <span className="w-[92px] shrink-0 text-right font-mono text-[13px] font-bold text-foreground">
                  {formatarBRL(s.price)}
                </span>
                <button
                  type="button"
                  title="Editar"
                  onClick={() =>
                    setForm({
                      id: s.id,
                      code: s.code ?? "",
                      description: s.description,
                      issCode: s.issCode ?? "",
                      price: String(s.price ?? ""),
                    })
                  }
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  title="Excluir"
                  onClick={() => excluirServico.mutate(s.id)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {!servicos.length && !form && (
              <p className="py-2 text-[12.5px] text-muted-foreground">
                Nenhum serviço cadastrado. Sem isso o Kaua não sabe quanto cobrar.
              </p>
            )}

            {form && (
              <div className="rounded-[10px] border border-border bg-background p-3.5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Campo
                    rot="Código"
                    valor={form.code}
                    onChange={(v) => setForm({ ...form, code: v })}
                    ph="001"
                    mono
                  />
                  <Campo
                    rot="Nome"
                    valor={form.description}
                    onChange={(v) => setForm({ ...form, description: v })}
                    ph="Consulta clínica"
                    className="col-span-2"
                  />
                  <Campo
                    rot="ISS"
                    valor={form.issCode}
                    onChange={(v) => setForm({ ...form, issCode: v })}
                    ph="4.01"
                    mono
                  />
                  <Campo
                    rot="Valor"
                    valor={form.price}
                    onChange={(v) => setForm({ ...form, price: v })}
                    ph="250"
                    mono
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setForm(null)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={enviarServico} disabled={salvarServico.isPending}>
                    {form.id ? "Salvar" : "Adicionar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {aba === "cobranca" && (
          <div className="flex flex-col gap-6">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">
                Tipo de chave Pix
              </span>
              <Select value={e.pixType || "email"} onValueChange={set("pixType")}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {empresaService.PIX_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Campo rot="Chave Pix" valor={e.pixKey} onChange={set("pixKey")} mono />
            <Campo
              rot="Mensagem de cobrança"
              valor={e.paymentInstructions}
              onChange={set("paymentInstructions")}
              area
              className="sm:col-span-2"
              dica="{valor} e {pix} são trocados automaticamente. O Kaua adapta ao tom do agente."
            />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.04em] text-secondary-foreground">
              Régua de cobrança
            </div>
            <div className="flex flex-col gap-2">
              {regua.map((r, i) => (
                <div
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] border border-border bg-background px-3.5 py-2.5 transition-opacity",
                    !r.on && "opacity-50",
                  )}
                >
                  <span className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-[3px] bg-primary font-mono text-[10px] font-medium text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold text-foreground">{r.quando}</div>
                    <div className="mt-px text-[11.5px] text-muted-foreground">{r.txt}</div>
                  </div>
                  <Switch
                    checked={r.on}
                    onCheckedChange={(v) => setRegua((x) => x.map((y) => (y.id === r.id ? { ...y, on: v } : y)))}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              ⚠️ A régua ainda é local — depende de campos novos em <code>/api/empresa</code>.
            </p>
          </div>
          </div>
        )}

        {rascunho && (
          <div className="sticky bottom-0 flex items-center gap-3 bg-gradient-to-t from-background via-background pb-2 pt-4">
            <span className="text-[12.5px] text-muted-foreground">Alterações não salvas.</span>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setRascunho(null)}>
              Descartar
            </Button>
            <Button size="lg" onClick={() => salvar.mutate(rascunho)} disabled={salvar.isPending}>
              Salvar alterações
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type AbaId = "dados" | "servicos" | "cobranca";

/**
 * As três abas, na ordem em que o AGENTE lê.
 *
 * Empilhadas numa coluna só, dados fiscais, catálogo e régua de cobrança
 * competiam na mesma rolagem e nada tinha prioridade. Em abas, cada uma é uma
 * tarefa: você vem "mexer nos serviços" ou "ajustar a cobrança", raramente nos
 * três ao mesmo tempo.
 *
 * ⚠️ O rascunho é COMPARTILHADO entre as abas de propósito: trocar de aba não
 * perde o que foi digitado, e o rodapé "Salvar" salva tudo junto. Serviços são a
 * exceção — têm CRUD próprio e salvam na hora.
 */
const ABAS: { id: AbaId; label: string; sub: string }[] = [
  { id: "dados", label: "Dados", sub: "Aparecem como prestador na NFS-e." },
  { id: "servicos", label: "Serviços", sub: "O valor da cobrança vem daqui, e o código ISS vai para a nota." },
  { id: "cobranca", label: "Cobrança", sub: "A chave que recebe, a mensagem que o Kaua manda e quando ele insiste." },
];

/** Formulário de serviço — espelha `ServicoPayload`, com `price` como texto. */
type ServicoForm = {
  id: string | null;
  code: string;
  description: string;
  issCode: string;
  price: string;
};

/**
 * Régua de cobrança — quando o agente insiste.
 *
 * Existe porque cobrança automática sem limite visível vira spam, e o dono da
 * clínica é quem paga essa conta na reputação dela. Ver os degraus e poder
 * desligar o último é o que torna a automação aceitável.
 */
const REGUA_PADRAO = [
  { id: "r1", quando: "No dia da consulta, às 18h", txt: "Primeira cobrança com a chave Pix", on: true },
  { id: "r2", quando: "2 dias depois", txt: "Lembrete gentil", on: true },
  { id: "r3", quando: "5 dias depois", txt: "Último lembrete e aviso ao consultório", on: true },
  { id: "r4", quando: "10 dias depois", txt: "Marcar como inadimplente", on: false },
];
