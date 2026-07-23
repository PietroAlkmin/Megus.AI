import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Hand, Loader2, MessageSquare, Send, TriangleAlert, User, UserCog } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import * as atendimentosService from "@/services/atendimentos";
import * as conversasService from "@/services/conversas";
import type { Conversa } from "@/services/conversas";

const STATUS_BADGE: Record<Conversa["status"], { label: string; cls: string }> = {
  BOT: { label: "Kaua", cls: "bg-success/10 text-success" },
  AGUARDANDO: { label: "Aguardando", cls: "bg-warning/10 text-warning" },
  HUMANO: { label: "Atendente", cls: "bg-secondary text-foreground" },
};

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ConversasView() {
  const [searchParams] = useSearchParams();
  const agenteParam = searchParams.get("agente");
  const [agenteId, setAgenteId] = useState<string | null>(agenteParam);
  const [convId, setConvId] = useState<string | null>(null);

  const agentesQuery = useQuery({ queryKey: ["agentes"], queryFn: atendimentosService.listAgentes });

  // seleciona o primeiro agente automaticamente quando a lista chega
  const agentes = agentesQuery.data ?? [];
  const agenteAtivo = agenteId ?? agentes[0]?.id ?? null;

  const conversasQuery = useQuery({
    queryKey: ["conversas", agenteAtivo],
    queryFn: () => conversasService.listConversas(agenteAtivo as string),
    enabled: Boolean(agenteAtivo),
  });

  const mensagensQuery = useQuery({
    queryKey: ["mensagens", convId],
    queryFn: () => conversasService.listMensagens(convId as string),
    enabled: Boolean(convId),
  });

  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");

  function invalidarConversa() {
    queryClient.invalidateQueries({ queryKey: ["conversas", agenteAtivo] });
    queryClient.invalidateQueries({ queryKey: ["mensagens", convId] });
  }

  const assumirMutation = useMutation({
    mutationFn: () => conversasService.assumir(convId as string),
    onSuccess: () => { toast.success("Você assumiu a conversa. O bot está pausado."); invalidarConversa(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível assumir."),
  });

  const retomarMutation = useMutation({
    mutationFn: () => conversasService.retomar(convId as string),
    onSuccess: () => { toast.success("O bot retomou a conversa."); invalidarConversa(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível retomar."),
  });

  const enviarMutation = useMutation({
    mutationFn: () => conversasService.enviar(convId as string, texto.trim()),
    onSuccess: () => { setTexto(""); invalidarConversa(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível enviar."),
  });

  if (agentesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Carregando…
      </div>
    );
  }

  const conversas = conversasQuery.data ?? [];
  const conversaAtiva = conversas.find((c) => c.id === convId) ?? null;
  const assumida = conversaAtiva?.status === "HUMANO" || conversaAtiva?.humanHandoff === true;
  const mensagens = mensagensQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* Seletor de agente */}
      {agentes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {agentes.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setAgenteId(a.id); setConvId(null); }}
              className={`rounded-full border px-3 py-1 text-sm ${
                a.id === agenteAtivo ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground"
              }`}
            >
              {a.nome ? `${a.nome} · ${a.papel}` : a.papel}
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[300px_1fr]">
          {/* Lista de conversas */}
          <div className="border-r">
            <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversas
            </div>
            {conversasQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : conversas.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-muted-foreground">
                Nenhuma conversa ainda. Elas aparecem aqui quando os pacientes escreverem.
              </div>
            ) : (
              <ul className="max-h-[520px] overflow-y-auto">
                {conversas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setConvId(c.id)}
                      className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/40 ${
                        c.id === convId ? "bg-muted/60" : ""
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        <User className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{c.nome}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.ultima || c.telefone}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[c.status]?.cls ?? ""}`}>
                        {STATUS_BADGE[c.status]?.label ?? c.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Painel de mensagens */}
          <div className="flex flex-col">
            {!convId ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageSquare className="size-8 opacity-40" />
                <span className="text-sm">Selecione uma conversa para ver as mensagens.</span>
              </div>
            ) : (
              <>
                {/* Cabeçalho: quem é + assumir/retomar */}
                <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{conversaAtiva?.nome ?? "Conversa"}</div>
                    <div className="text-xs text-muted-foreground">
                      {assumida ? "Você assumiu · bot pausado" : "Bot respondendo"}
                    </div>
                  </div>
                  {assumida ? (
                    <Button type="button" variant="outline" size="sm" disabled={retomarMutation.isPending}
                      onClick={() => retomarMutation.mutate()}>
                      {retomarMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />}
                      Devolver ao bot
                    </Button>
                  ) : (
                    <Button type="button" size="sm" disabled={assumirMutation.isPending}
                      onClick={() => assumirMutation.mutate()}>
                      {assumirMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Hand className="size-3.5" />}
                      Assumir conversa
                    </Button>
                  )}
                </div>

                {/* Mensagens */}
                {mensagensQuery.isLoading ? (
                  <div className="flex flex-1 items-center justify-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                ) : (
                  <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                    {mensagens.length === 0 ? (
                      <div className="py-16 text-center text-sm text-muted-foreground">Sem mensagens nesta conversa.</div>
                    ) : (
                      mensagens.map((m) => {
                        const daEmpresa = m.autor === "bot" || m.autor === "humano";
                        // Kaua (bot) = verde da marca; atendente humano = tinta
                        // (dá pra ver que alguém assumiu); paciente = papel/branco.
                        const bolha =
                          m.autor === "bot"
                            ? "bg-success text-success-foreground"
                            : m.autor === "humano"
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-foreground shadow-sm";
                        return (
                          <div key={m.id} className={`flex ${daEmpresa ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${bolha}`}>
                              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] opacity-70">
                                {m.autor === "bot" ? <Bot className="size-3" /> : m.autor === "humano" ? <UserCog className="size-3" /> : <User className="size-3" />}
                                {m.autor === "bot" ? "Kaua" : m.autor === "humano" ? "Atendente" : "Paciente"}
                                <span>· {horaCurta(m.hora)}</span>
                              </div>
                              {m.texto || (m.attach ? `📎 ${m.attach.name}` : "")}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Rodapé: campo de envio (só quando assumida) */}
                <div className="border-t p-3">
                  {assumida ? (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Escreva sua mensagem…"
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && texto.trim() && !enviarMutation.isPending) enviarMutation.mutate(); }}
                      />
                      <Button type="button" size="icon" disabled={!texto.trim() || enviarMutation.isPending}
                        onClick={() => enviarMutation.mutate()}>
                        {enviarMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      Assuma a conversa para enviar mensagens pela interface.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {agentesQuery.isError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4" /> Não foi possível carregar os agentes.
        </div>
      )}
    </div>
  );
}