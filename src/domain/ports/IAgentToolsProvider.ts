/**
 * Porta de TOOLS DINÂMICAS por empresa (Fase B — Composio/Calendar e afins).
 *
 * Cada empresa pode ter conexões próprias (ex.: Google Calendar via Composio);
 * esta porta resolve, por `companyId`, as tools JÁ no formato nativo do SDK do
 * motor (`nativeTools`, consumidas por `IAgentEngine.run` via passthrough) mais
 * as infos declarativas (nome+descrição) que entram no prompt (bloco "Ferramentas
 * disponíveis" do PromptComposer). Implementação = adapter Composio; hoje só a
 * porta existe (nada ainda a implementa/consome).
 */
export interface AgentToolInfo { name: string; description: string }
/** Toolset dinâmico por empresa: nativas do SDK do motor + infos pro prompt. */
export interface AgentToolset { nativeTools: Record<string, unknown>; infos: AgentToolInfo[] }
export interface IAgentToolsProvider {
  /**
   * Tools disponíveis pra EMPRESA (conexões ativas dela; vazio se nenhuma).
   *
   * CONTRATO DURO do sentinela vazio: `companyId === ""` (integração sem dono no
   * assembler) devolve toolset VAZIO imediatamente — NUNCA vira lookup real no
   * provedor. Histórico: leniência com companyId vazio já abriu acesso
   * cross-tenant aqui (ver pertenceAoTenant/resolveUserCompanyId); não repetir.
   */
  forCompany(companyId: string): Promise<AgentToolset>;
}
