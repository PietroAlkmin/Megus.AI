import { apiFetch } from "@/lib/api";
import { getEmpresa, listServicos } from "@/services/empresa";
import { status as whatsappStatus } from "@/services/whatsapp";

/* ── Agenda (Composio → Google Calendar) ──────────────────
   Mantido como estava: o OAuth da agenda tem endpoints próprios. */

export interface AgendaStatus {
  conectado: boolean;
}

export interface AgendaConexao {
  /** URL de consentimento (Composio → Google) — abrir em nova aba. */
  url: string;
}

/** GET /api/agente/ferramentas/agenda/status — a empresa logada tem agenda conectada? */
export async function agendaStatus(): Promise<AgendaStatus> {
  return apiFetch<AgendaStatus>("GET", "/api/agente/ferramentas/agenda/status");
}

/** POST /api/agente/ferramentas/agenda/conectar — inicia o OAuth e devolve a URL de consentimento. */
export async function agendaConectar(): Promise<AgendaConexao> {
  return apiFetch<AgendaConexao>("POST", "/api/agente/ferramentas/agenda/conectar");
}

/** DELETE /api/agente/ferramentas/agenda/conexao — remove a conta Google da empresa logada. */
export async function agendaDesconectar(): Promise<{ desconectado: boolean; removidas: number }> {
  return apiFetch<{ desconectado: boolean; removidas: number }>("DELETE", "/api/agente/ferramentas/agenda/conexao");
}

/* ── Visão unificada das conexões ─────────────────────────
   Novo: a tela de Integrações e o cartão de ativação da Hoje precisam do estado
   das QUATRO conexões numa lista só. O `id` casa com os passos de ativação
   (`lib/ativacao.ts`) de propósito — é a mesma verdade, não dois estados
   paralelos. Enquanto o endpoint não existir, o backend pode compor a lista a
   partir dos status que já tem (agenda, whatsapp, empresa, provedor fiscal). */

export type FerramentaId = "whatsapp" | "agenda" | "servicos" | "fiscal";

export interface Ferramenta {
  id: FerramentaId;
  nome: string;
  desc: string;
  /** Linha de detalhe (número, conta, provedor) — mono na UI. */
  detalhe: string;
  connected: boolean;
}

/** GET /api/integracoes — estado das conexões da empresa ativa.
 *
 * ⚠️ Rota ainda inexistente. Use `listFerramentasFallback()` enquanto isso: a
 * tela de Integrações e o cartão de ativação dependem desta lista, então um 404
 * aqui derruba as duas. */
export async function listFerramentas(): Promise<Ferramenta[]> {
  return apiFetch<Ferramenta[]>("GET", "/api/integracoes");
}

/**
 * Mesma lista, composta dos status que **já existem** — sem rota nova.
 *
 * Quando `GET /api/integracoes` subir, troque as chamadas de
 * `listFerramentasFallback` por `listFerramentas` e apague esta função. O tipo
 * de retorno é o mesmo de propósito.
 *
 * `fiscal` fica sempre pendente: não há status de provedor fiscal no backend
 * ainda — e afirmar "conectado" sem saber seria pior do que pedir a conexão.
 */
export async function listFerramentasFallback(): Promise<Ferramenta[]> {
  const [agenda, whats, empresa, servicos] = await Promise.all([
    agendaStatus().catch(() => ({ conectado: false })),
    whatsappStatus().catch(() => ({ connected: false, number: null as string | null })),
    getEmpresa().catch(() => null),
    listServicos().catch(() => [] as { id: string }[]),
  ]);

  const temServicos = Boolean(servicos.length && empresa?.pixKey?.trim());

  return [
    {
      id: "whatsapp",
      nome: "WhatsApp",
      desc: "O número que o agente usa para atender os pacientes.",
      detalhe: whats.number ?? "nenhum número pareado",
      connected: whats.connected,
    },
    {
      id: "agenda",
      nome: "Agenda",
      desc: "De onde vêm as consultas do dia.",
      detalhe: agenda.conectado ? "Google Calendar" : "nenhuma agenda conectada",
      connected: agenda.conectado,
    },
    {
      id: "servicos",
      nome: "Serviços e chave Pix",
      desc: "O que cobrar e para onde o dinheiro vai.",
      detalhe: temServicos ? `${servicos.length} serviço(s) · Pix cadastrado` : "incompleto",
      connected: temServicos,
    },
    {
      id: "fiscal",
      nome: "Provedor fiscal",
      desc: "Quem emite a NFS-e de verdade.",
      detalhe: "aguardando configuração",
      connected: false,
    },
  ];
}

/* ⚠️ NÃO existe `POST /api/integracoes/:id/conectar`.
   Havia um `conectar(id)` aqui apontando para essa rota — removido, porque
   chamá-la dava 404 no botão principal da tela. Cada conexão tem fluxo próprio:
   WhatsApp → `whatsapp.connect()` + QR · agenda → `agendaConectar()` (OAuth) ·
   serviços → navegar para /clinica. Quem roteia é `pages/Integracoes.tsx`. */
