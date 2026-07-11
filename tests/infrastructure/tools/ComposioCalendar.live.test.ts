import { describe, expect, it } from "vitest";
import { ComposioAgentToolsProvider } from "../../../src/infrastructure/tools/composio/ComposioAgentToolsProvider";

/**
 * Smoke ao vivo (gated por chave) — bate na API REAL do Composio, sem mock. Só roda
 * com COMPOSIO_API_KEY setada (nunca no sandbox comum; ver docs/backend.md seção 9.2).
 *
 * Escopo DELIBERADAMENTE restrito a `forCompany` (leitura): não exercita `initiate`/
 * `listActive` aqui porque são operações com efeito colateral real (`initiate` dispara
 * um fluxo de OAuth de verdade) — a validação dessas duas é o smoke HUMANO pós-deploy
 * (POST .../conectar → consentir → GET .../status), não um teste automatizado.
 */
const run = process.env.COMPOSIO_API_KEY ? describe : describe.skip;

run("ComposioAgentToolsProvider (ao vivo)", () => {
  it("forCompany não lança mesmo sem conta conectada (fail-safe real); se conectada, traz o catálogo curado", async () => {
    const provider = ComposioAgentToolsProvider.fromEnv(process.env.COMPOSIO_API_KEY!);

    const toolset = await provider.forCompany("co-piloto");

    if (process.env.COMPOSIO_GCAL_AUTH_CONFIG_ID && toolset.infos.length > 0) {
      // Conta já conectada neste ambiente: confirma o catálogo curado de verdade
      // (só tools GOOGLECALENDAR_* chegam — ver keepCalendarTools).
      expect(toolset.infos.map((i) => i.name)).toContain("GOOGLECALENDAR_FIND_FREE_SLOTS");
    } else {
      // Estado esperado hoje (nenhuma empresa conectou a agenda ainda): toolset
      // vazio, sem throw — é exatamente o fail-safe que sustenta a conversa do
      // Kaua mesmo com a Fase B ligada, mas ainda sem OAuth concluído.
      expect(toolset).toEqual({ nativeTools: {}, infos: [] });
    }
  }, 30_000);
});
