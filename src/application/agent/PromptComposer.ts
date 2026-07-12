import type { AIMessage } from "../../domain/ports/IAIProvider";
import type { AgentContext, AgentPersona } from "../../domain/ports/IAgentBrain";

/**
 * PromptComposer — monta as mensagens enviadas ao LLM a partir de um
 * AgentContext (persona + negócio + estado + coletados + histórico).
 *
 * Função PURA: sem I/O, sem chamada ao provider. O AgentBrain (infra) chama
 * isto e repassa o resultado para IAIProvider.completeWithTool.
 */

/** Ferramenta anunciada ao modelo: nome + descrição orientada a propósito. */
export interface PromptToolInfo {
  name: string;
  description: string;
}

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

// Rótulo humano dos segmentos (mesmo catálogo do painel — frontend/src/lib/segmentos.ts).
// Ids desconhecidos passam como vieram: dado real, não placeholder.
const SEGMENTO_LABEL: Record<string, string> = {
  varejo: "Comércio / Varejo",
  restaurante: "Restaurante",
  servicos: "Serviços / Consultório",
  saude: "Saúde / Clínica",
  beleza: "Beleza / Estética",
  educacao: "Educação / Cursos",
};

function buildIdentityBlock(ctx: AgentContext): string {
  const emojiDirective = ctx.persona.emojis ? "Pode usar emojis com moderação." : "NÃO use emojis.";
  // Apresentação pelo nome FANTASIA quando existe ("Clínica Sorriso") — ninguém
  // se apresenta pela razão social ("... Ltda"); ela vai no bloco da empresa.
  const displayName = ctx.business.profile?.fantasyName ?? ctx.business.companyName;
  const segmento = SEGMENTO_LABEL[ctx.persona.segment] ?? ctx.persona.segment;
  return (
    `Você é o ${ctx.persona.name}, atendente da ${displayName}. ` +
    `${TONE_DIRECTIVE[ctx.persona.tone]} ${emojiDirective} ${LANG_DIRECTIVE[ctx.persona.lang]} ` +
    `Segmento: ${segmento}. ` +
    // Canal, não segmento: vale pra todo tenant. Markdown (**/##) vaza literal na tela.
    `Você conversa pelo WhatsApp: para destacar use *asterisco simples* ou _sublinhado_; nunca Markdown (** ou ##).`
  );
}

/** Bloco "Sobre a empresa" — só o que a empresa PREENCHEU no cadastro (aba Empresa). */
function buildEmpresaBlock(ctx: AgentContext): string | null {
  const p = ctx.business.profile;
  if (!p) return null;

  const linhas: string[] = [];
  if (ctx.business.companyName && ctx.business.companyName !== p.fantasyName)
    linhas.push(`- Razão social: ${ctx.business.companyName}`);
  if (p.address) linhas.push(`- Endereço: ${p.address}`);
  if (p.city) linhas.push(`- Cidade: ${p.city}${p.state ? `/${p.state}` : ""}`);
  else if (p.state) linhas.push(`- UF: ${p.state}`);
  if (p.phone) linhas.push(`- Telefone: ${p.phone}`);
  if (p.email) linhas.push(`- E-mail: ${p.email}`);
  if (p.pixKey) linhas.push(`- Pagamento: Pix${p.pixType ? ` (${p.pixType})` : ""}, chave ${p.pixKey}`);
  if (p.paymentInstructions) linhas.push(`- Instruções de pagamento: ${p.paymentInstructions}`);
  if (linhas.length === 0) return null;

  return (
    `Sobre a empresa (use estes dados quando o cliente perguntar sobre a empresa ou como pagar; ` +
    `não invente o que não está aqui):\n${linhas.join("\n")}`
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

/**
 * Bloco de ferramentas — AGNÓSTICO por princípio (Pietro, 11/07): gerado da
 * lista injetada (nome + descrição orientada a propósito), com um nudge
 * GENÉRICO de ponderação. NUNCA regra por cenário ("se perguntarem a hora,
 * use X") — o modelo raciocina sobre a lista; o composer não conhece tools.
 */
function buildToolsBlock(tools: PromptToolInfo[]): string | null {
  if (tools.length === 0) return null;
  const lines = tools.map((t) => `- ${t.name}: ${t.description}`);
  return (
    `Ferramentas disponíveis:\n${lines.join("\n")}\n` +
    `A cada mensagem, pondere se alguma destas ferramentas ajuda a responder com precisão — ` +
    `e use-a ANTES de responder. Nunca invente uma informação que uma ferramenta pode te dar.`
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

export function composePrompt(ctx: AgentContext, tools: PromptToolInfo[] = []): AIMessage[] {
  const blocks: string[] = [buildIdentityBlock(ctx)];

  if (ctx.persona.instructions.trim()) blocks.push(ctx.persona.instructions);

  const empresa = buildEmpresaBlock(ctx);
  if (empresa) blocks.push(empresa);

  const catalog = buildCatalogBlock(ctx);
  if (catalog) blocks.push(catalog);

  blocks.push(buildFiscalRuleBlock(ctx));

  const toolsBlock = buildToolsBlock(tools);
  if (toolsBlock) blocks.push(toolsBlock);

  const collected = buildCollectedBlock(ctx);
  if (collected) blocks.push(collected);

  // Avisos transientes do sistema (sinal de FLUXO deste turno, ex.: "cadastro
  // validado agora"). Genérico: renderiza o que vier injetado, nada hardcoded.
  if (ctx.notices && ctx.notices.length > 0) {
    blocks.push(`Avisos do sistema (válidos AGORA, aja de acordo):\n${ctx.notices.map((n) => `- ${n}`).join("\n")}`);
  }

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
