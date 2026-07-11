import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import type { AgentToolInfo, AgentToolset, IAgentToolsProvider } from "../../../domain/ports/IAgentToolsProvider";

/**
 * Fatia MÍNIMA do cliente Composio que usamos (injetável → testável sem rede).
 *
 * Confirmado contra node_modules/@composio/core/dist/composio-BHSQwOUz.d.mts e
 * node_modules/@composio/vercel/dist/index.d.mts (jul/2026, @composio/core@0.13.1
 * + @composio/vercel@0.11.0): `composio.create(userId, config?)` é alias de
 * `composio.sessions.create(...)` e devolve uma sessão cujo `.tools(modifiers?)`
 * resolve `Promise<ReturnType<VercelProvider['wrapTools']>>` — o `VercelToolCollection`
 * (= `ToolSet` do pacote `ai`), um `Record<string, Tool>` com `description` e
 * `execute` já embutidos. Esta factory é só esse recorte (userId → { tools() }).
 */
export type ComposioSessionFactory = (userId: string) => Promise<{ tools(): Promise<Record<string, unknown>> }>;

const EMPTY_TOOLSET: AgentToolset = { nativeTools: {}, infos: [] };

/** TTL default do cache por empresa (ms) — espelha o default do env COMPOSIO_TOOLS_TTL_S (300s). */
const DEFAULT_TTL_MS = 300_000;

interface CacheEntry {
  at: number;
  toolset: AgentToolset;
}

/**
 * Adapter Composio da porta `IAgentToolsProvider` — o ÚNICO arquivo do backend
 * acoplado a `@composio/*` (confinamento via `fromEnv`; o resto da classe só
 * conhece o `ComposioSessionFactory` injetado, testável sem rede).
 *
 * Responsabilidades:
 * - Cache por empresa (TTL em ms) — evita bater na API do Composio a cada
 *   mensagem da conversa.
 * - Scoping estrito: `companyId` é o `userId` do Composio; nunca mistura
 *   toolset de uma empresa com o de outra.
 * - Fail-safe: qualquer erro (factory ou `.tools()`) vira toolset VAZIO + um
 *   `console.warn` — a conversa do Kaua NUNCA quebra por causa do Composio
 *   estar fora do ar ou a empresa não ter conectado nada ainda.
 */
export class ComposioAgentToolsProvider implements IAgentToolsProvider {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly sessions: ComposioSessionFactory,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  async forCompany(companyId: string): Promise<AgentToolset> {
    // Sentinela vazio: contrato DURO do port (ver IAgentToolsProvider) — nunca
    // vira lookup real, nem entra no cache.
    if (companyId === "") return EMPTY_TOOLSET;

    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.toolset;

    try {
      const session = await this.sessions(companyId);
      const raw = await session.tools();
      const toolset: AgentToolset = { nativeTools: raw, infos: toInfos(raw) };
      this.cache.set(companyId, { at: Date.now(), toolset });
      return toolset;
    } catch (err) {
      console.warn(`[composio] tools indisponiveis p/ empresa ${companyId}:`, err instanceof Error ? err.message : err);
      return EMPTY_TOOLSET;
    }
  }

  /**
   * ÚNICO ponto que instancia o SDK real. `userId` do Composio = `companyId`
   * (scoping por tenant). `toolkits: ["googlecalendar"]` no `create()` é filtro
   * NATIVO (confirmado no .d.mts: `ToolRouterCreateSessionConfig.toolkits`) —
   * best effort, já que o slug de TOOLKIT não é verificável localmente (catálogo
   * remoto do Composio). Quem GARANTE o catálogo curado (só Google Calendar por
   * ora — Kapty.Docs plano Fase B) é o filtro por PREFIXO de tool abaixo:
   * `GOOGLECALENDAR_` é o slug de TOOL, esse sim confirmado (mesmas strings do
   * plano: GOOGLECALENDAR_FIND_FREE_SLOTS/EVENTS_LIST/CREATE_EVENT). Cinto e
   * suspensório: mesmo se o slug de toolkit acima estiver errado (ou a conta
   * tiver outros toolkits conectados no futuro), nunca vaza tool fora do catálogo.
   */
  static fromEnv(apiKey: string, ttlMs?: number): ComposioAgentToolsProvider {
    const composio = new Composio({ apiKey, provider: new VercelProvider() });
    const sessions: ComposioSessionFactory = async (userId: string) => {
      const session = await composio.create(userId, { toolkits: ["googlecalendar"] });
      return {
        tools: async () => {
          const all = await session.tools();
          return Object.fromEntries(Object.entries(all).filter(([name]) => name.startsWith("GOOGLECALENDAR_")));
        },
      };
    };
    return new ComposioAgentToolsProvider(sessions, ttlMs);
  }
}

function toInfos(toolset: Record<string, unknown>): AgentToolInfo[] {
  return Object.entries(toolset).map(([name, t]) => ({
    name,
    description: String((t as { description?: unknown } | null | undefined)?.description ?? name),
  }));
}
