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

/**
 * Ops de CONEXÃO (rotas `/agenda/conectar` e `/agenda/status`, Task 3) — deliberadamente
 * separadas do `ComposioSessionFactory` (que é sobre TOOLS pro loop do cérebro). Mesmo
 * shape serve dois papéis: (a) o contrato público que as rotas dependem (testável com
 * fake, sem nunca tocar `@composio/*`) e (b) o client injetado real dentro de `fromEnv`.
 */
export interface ComposioConnectOps {
  /** Inicia o OAuth da empresa (userId) pro authConfigId; devolve a url de redirect (ou null se o provedor não conseguiu gerar uma) + o id da connection request. */
  initiate(userId: string, authConfigId: string): Promise<{ redirectUrl: string | null; id: string }>;
  /** Nº de contas ATIVAS da empresa (userId) no toolkit informado — usado pelo GET /status. */
  listActive(userId: string, toolkitSlug: string): Promise<number>;
}

/**
 * Slug do TOOLKIT no Composio — CONFIRMADO no dashboard (print do Pietro, ver Task 2
 * report), minúsculo. Não confundir com o PREFIXO das tools (`GOOGLECALENDAR_...`,
 * maiúsculo) — são strings diferentes na API do Composio. Constante única, reusada no
 * filtro do `create()` (abaixo) e no `listActive()` das rotas, pra nunca haver drift de
 * maiúscula/minúscula entre os dois (um erro de case aqui faria o filtro do catálogo ou
 * a contagem de conexões ativas devolver silenciosamente vazio/zero).
 */
export const GOOGLECALENDAR_TOOLKIT_SLUG = "googlecalendar";

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
export class ComposioAgentToolsProvider implements IAgentToolsProvider, ComposioConnectOps {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly sessions: ComposioSessionFactory,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    // Ops de conexão (Task 3) — opcional só pra não quebrar quem já construía esta
    // classe com 1-2 args (testes da Task 2); em produção `fromEnv` sempre injeta.
    private readonly connect?: ComposioConnectOps,
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
   * Inicia o OAuth da empresa (rota POST /agenda/conectar) — delega pro client de
   * conexão injetado (real só via `fromEnv`; testável com fake nas rotas). Lança se
   * construída sem `connect`: não deveria acontecer em produção (a rota SEMPRE checa
   * a ausência de connectOps ANTES de chamar isto — ver ferramentas.routes.ts), então
   * este throw é defesa contra uso indevido da classe, não um caminho esperado.
   */
  async initiate(userId: string, authConfigId: string): Promise<{ redirectUrl: string | null; id: string }> {
    if (!this.connect) throw new Error("ComposioAgentToolsProvider: sem client de conexão (construído fora do fromEnv)");
    return this.connect.initiate(userId, authConfigId);
  }

  /** Nº de contas ativas (rota GET /agenda/status) — mesma ressalva do `initiate` acima. */
  async listActive(userId: string, toolkitSlug: string): Promise<number> {
    if (!this.connect) throw new Error("ComposioAgentToolsProvider: sem client de conexão (construído fora do fromEnv)");
    return this.connect.listActive(userId, toolkitSlug);
  }

  /**
   * ÚNICO ponto que instancia o SDK real. `userId` do Composio = `companyId`
   * (scoping por tenant). `toolkits: [GOOGLECALENDAR_TOOLKIT_SLUG]` no `create()` é
   * filtro NATIVO (confirmado no .d.mts: `ToolRouterCreateSessionConfig.toolkits`) —
   * best effort. Quem GARANTE o catálogo curado é `keepCalendarTools` (pura, testada):
   * mesmo se o slug de toolkit estiver errado (ou a conta tiver outros toolkits
   * conectados no futuro), nunca vaza tool fora do catálogo.
   */
  static fromEnv(apiKey: string, ttlMs?: number): ComposioAgentToolsProvider {
    const composio = new Composio({ apiKey, provider: new VercelProvider() });
    const sessions: ComposioSessionFactory = async (userId: string) => {
      const session = await composio.create(userId, { toolkits: [GOOGLECALENDAR_TOOLKIT_SLUG] });
      return { tools: async () => keepCalendarTools(await session.tools()) };
    };
    // Ops de conexão (Task 3) — MESMO client Composio já criado acima (nenhuma
    // instância nova), ainda 100% confinado a este arquivo.
    //
    // `.link()` no lugar do `.initiate()`: o .d.mts instalado (@composio/core@0.13.1,
    // node_modules/@composio/core/dist/composio-BHSQwOUz.d.mts) documenta
    // `connectedAccounts.initiate()` como DEPRECATED pra OAuth Composio-managed
    // (OAuth1/OAuth2/DCR_OAUTH) a partir do cutover 2026-07-03 (todas as orgs) — depois
    // disso, `.initiate()` LANÇA `ComposioLegacyConnectedAccountsEndpointRetiredError`
    // pra essa combinação. `.link()` cobre o MESMO caso (auth config managed OU custom)
    // com o MESMO formato de retorno (`ConnectionRequest`: `.id`/`.redirectUrl`) — sem
    // custo, então usamos `.link()` aqui em vez do `.initiate()` do plano original.
    const connect: ComposioConnectOps = {
      initiate: async (userId, authConfigId) => {
        const req = await composio.connectedAccounts.link(userId, authConfigId);
        return { id: req.id, redirectUrl: req.redirectUrl ?? null };
      },
      listActive: async (userId, toolkitSlug) => {
        const { items } = await composio.connectedAccounts.list({
          userIds: [userId],
          toolkitSlugs: [toolkitSlug],
          statuses: ["ACTIVE"],
        });
        // Filtro client-side redundante com o `statuses` do pedido acima — defensivo,
        // caso a API algum dia ignore esse filtro server-side.
        return items.filter((item) => item.status === "ACTIVE").length;
      },
    };
    return new ComposioAgentToolsProvider(sessions, ttlMs, connect);
  }
}

/**
 * Curadoria do catálogo (garantia anti-vazamento): só tools do Google Calendar
 * (prefixo de TOOL `GOOGLECALENDAR_`, confirmado: FIND_FREE_SLOTS/EVENTS_LIST/
 * CREATE_EVENT) passam pro motor e pro prompt. Pura → testável direto.
 */
export function keepCalendarTools(all: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(all).filter(([name]) => name.startsWith("GOOGLECALENDAR_")));
}

function toInfos(toolset: Record<string, unknown>): AgentToolInfo[] {
  return Object.entries(toolset).map(([name, t]) => ({
    name,
    description: String((t as { description?: unknown } | null | undefined)?.description ?? name),
  }));
}
