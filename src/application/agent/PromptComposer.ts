import type { AIMessage } from "../../domain/ports/IAIProvider";
import type { AgentContext, AgentPersona } from "../../domain/ports/IAgentBrain";

/**
 * PromptComposer — monta as mensagens enviadas ao LLM a partir de um
 * AgentContext (persona + negócio + estado + coletados + histórico).
 *
 * Função PURA: sem I/O, sem chamada ao provider. O AgentBrain (infra) chama
 * isto e repassa o resultado para IAIProvider.completeWithTool.
 */

const TONE_DIRECTIVE: Record<AgentPersona["tone"], string> = {
  formal: "Trate por senhor/senhora, sem gírias.",
  equilibrado: "Seja cordial e direto.",
  descontraido: "Tom leve e informal.",
};

const LANG_DIRECTIVE: Record<AgentPersona["lang"], string> = {
  pt: "Responda em português.",
  en: "Respond in English.",
  es: "Responde en español.",
};

function buildIdentityBlock(ctx: AgentContext): string {
  const emojiDirective = ctx.persona.emojis ? "Pode usar emojis com moderação." : "NÃO use emojis.";
  return (
    `Você é o ${ctx.persona.name}, atendente da ${ctx.business.companyName}. ` +
    `${TONE_DIRECTIVE[ctx.persona.tone]} ${emojiDirective} ${LANG_DIRECTIVE[ctx.persona.lang]} ` +
    `Segmento: ${ctx.persona.segment}.`
  );
}

function buildCatalogBlock(ctx: AgentContext): string | null {
  if (ctx.business.services.length === 0) return null;
  const lines = ctx.business.services.map(
    (s) => `- ${s.description}: R$ ${s.price}${s.emissivel ? " (emite nota)" : ""}`,
  );
  return `Catálogo de serviços:\n${lines.join("\n")}\nSó cote preços desta lista; não invente valores.`;
}

function buildFiscalRuleBlock(ctx: AgentContext): string {
  return (
    `Estado atual: ${ctx.state}. Quando o cliente quiser emitir a nota, use a action intent_emit e peça nome completo + CPF. ` +
    `Ao receber nome e CPF, devolva-os em extracted com action provide_identity. NUNCA diga que emitiu a nota — quem emite é o sistema.`
  );
}

function buildCollectedBlock(ctx: AgentContext): string | null {
  const { collected } = ctx;
  if (!collected.cpfNameVerified && !collected.emissionStatus) return null;
  const parts = [`cliente ${collected.cpfNameVerified ? "verificado" : "não verificado"}`];
  if (collected.fullNameMasked) parts.push(`nome ${collected.fullNameMasked}`);
  if (collected.cpfMasked) parts.push(`CPF ${collected.cpfMasked}`);
  if (collected.emissionStatus) parts.push(`emissão ${collected.emissionStatus}`);
  return `Já sabemos: ${parts.join(", ")}.`;
}

export function composePrompt(ctx: AgentContext): AIMessage[] {
  const blocks: string[] = [buildIdentityBlock(ctx)];

  if (ctx.persona.instructions.trim()) blocks.push(ctx.persona.instructions);

  const catalog = buildCatalogBlock(ctx);
  if (catalog) blocks.push(catalog);

  blocks.push(buildFiscalRuleBlock(ctx));

  const collected = buildCollectedBlock(ctx);
  if (collected) blocks.push(collected);

  blocks.push(`Hoje é ${ctx.today}.`);

  const system: AIMessage = { role: "system", content: blocks.join("\n\n") };

  const fewShot: AIMessage[] = ctx.persona.fewShotDialogs.flatMap((d) => [
    { role: "user" as const, content: d.q },
    { role: "assistant" as const, content: d.a },
  ]);

  const history: AIMessage[] = ctx.history.map((m) => ({
    role: (m.author === "contact" ? "user" : "assistant") as AIMessage["role"],
    content: m.body,
  }));

  return [system, ...fewShot, ...history];
}
