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
    `Você conversa pelo WhatsApp: para destacar use *asterisco simples* ou _sublinhado_; nunca Markdown (** ou ##). ` +
    // Verdades do canal + higiene de coleta (bateria de teste 12/07: pediu "telefone
    // para contato" no próprio WhatsApp e nome antecipado sem necessidade).
    `Você JÁ está falando com o cliente pelo WhatsApp dele — NUNCA peça telefone ou "contato". ` +
    `Peça ao cliente apenas o dado necessário para a próxima ação; não colete dados por antecipação.`
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
  if (p.pixKey) {
    const desc = p.pixDescricao ? ` — ${p.pixDescricao}` : "";
    // Duas contas: a clínica recebe em lugares diferentes conforme o paciente
    // peça ou não nota fiscal. Mandar a chave errada põe dinheiro na conta
    // errada — problema de contador, não de software. Quando só existe uma
    // chave, o prompt nem menciona a distinção (a clínica com uma conta só não
    // pode ver o agente perguntando sobre nota para escolher chave).
    if (p.pixKeyNota) {
      linhas.push(
        `- Pagamento SEM nota fiscal: Pix${p.pixType ? ` (${p.pixType})` : ""}, chave ${p.pixKey}${desc}`,
      );
      linhas.push(
        `- Pagamento COM nota fiscal: Pix${p.pixTypeNota ? ` (${p.pixTypeNota})` : ""}, chave ${p.pixKeyNota}` +
          (p.pixDescricaoNota ? ` — ${p.pixDescricaoNota}` : ""),
      );
      linhas.push(
        `- A conta MUDA conforme a nota: descubra se o cliente vai precisar de nota fiscal ANTES de enviar a chave, ` +
          `e envie apenas a chave correspondente. Nunca mande as duas nem escolha por conta própria.`,
      );
    } else {
      linhas.push(`- Pagamento: Pix${p.pixType ? ` (${p.pixType})` : ""}, chave ${p.pixKey}${desc}`);
    }
  }
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

/**
 * Bloco das cobranças em aberto DO CLIENTE da conversa.
 *
 * Motivo real (prod, 02/08): o paciente escreveu *"gostaria de pagar uma consulta
 * que está em aberto"* e o agente respondeu *"vou pedir para a equipe confirmar o
 * valor certinho"* — com a cobrança de R$ 2,00 daquele contato no banco. O
 * contexto não trazia cobrança nenhuma, então ele não tinha o que dizer.
 *
 * Não é regra de cenário (o prompt segue agnóstico): é DADO, igual ao catálogo
 * de serviços. A diferença é que o catálogo é da empresa e isto é deste cliente.
 *
 * A última linha é o limite: informar o valor é leitura de registro, confirmar
 * pagamento é ato do gate B sobre o comprovante. Sem ela, "já paguei" tende a
 * virar "ok, obrigado!" e a cobrança fica aberta sem ninguém saber.
 */
function buildCobrancasBlock(ctx: AgentContext): string | null {
  if (ctx.openCharges.length === 0) return null;
  const linhas = ctx.openCharges.map(
    (c) => `- ${c.description}: R$ ${c.amount.toFixed(2).replace(".", ",")}${c.enviada ? " (cobrança já enviada)" : ""}`,
  );
  return (
    `Cobranças em ABERTO deste cliente (dados reais do sistema — informe o valor quando ele perguntar ` +
    `o que deve, em vez de encaminhar para a equipe):\n${linhas.join("\n")}\n` +
    `NUNCA dê o pagamento por confirmado por conta própria, mesmo que o cliente diga que pagou: ` +
    `peça o comprovante (foto ou PDF): quem confere e baixa é o sistema.`
  );
}

/**
 * O cadastro que a clínica quer coletar — o TOGGLE virando instrução.
 *
 * Antes isso vivia no texto livre da persona: a clínica escrevia "peça nome,
 * CPF, endereço…" à mão. Duas dependências para o mesmo efeito (lembrar de
 * escrever E de ligar), e a esquecida mandava no resultado. Agora a lista
 * marcada no painel gera este bloco sozinha.
 *
 * Só o que FALTA entra (o assembler já subtrai o que o paciente respondeu):
 * repetir pergunta respondida é o jeito mais rápido de ele desistir.
 *
 * As duas últimas linhas são o limite: coletar cadastro não pode virar
 * interrogatório nem pedágio. Quem procura a clínica quer resolver algo — o
 * cadastro acompanha o atendimento, não o bloqueia.
 */
function buildCadastroBlock(ctx: AgentContext): string | null {
  if (ctx.cadastroPendente.length === 0) return null;
  return (
    `Cadastro que esta clínica coleta (ainda faltam):\n${ctx.cadastroPendente.map((c) => `- ${c}`).join("\n")}\n` +
    `Peça no máximo DOIS por mensagem, na ordem acima, e nunca repita o que o cliente já informou. ` +
    `Se ele não quiser informar ou preferir depois, siga o atendimento normalmente — NUNCA condicione ` +
    `a resposta ou o atendimento à entrega desses dados.`
  );
}

/**
 * Cadastro é GENÉRICO (des-overfit, bateria 3 de 12/07): a regra de identidade
 * morava dentro da regra da nota e o modelo aprendeu "nome+CPF = emissão de
 * nota" — recebia cadastro de um agendamento e derivava pra "vou seguir com a
 * emissão da nota". Cadastro serve à ação EM CURSO, qualquer que seja.
 */
function buildCadastroRuleBlock(): string {
  return (
    "Cadastro do cliente (nome completo + CPF): algumas ações exigem cadastro validado. " +
    "Quando o cliente fornecer esses dados, devolva-os em extracted (action provide_identity) — o sistema valida e avisa. " +
    "O cadastro serve à AÇÃO EM CURSO na conversa, qualquer que seja; NÃO presuma que é para nota fiscal."
  );
}

function buildFiscalRuleBlock(ctx: AgentContext): string {
  return (
    `Estado atual: ${ctx.state}. Quando o cliente quiser emitir a nota fiscal, use a action intent_emit. ` +
    `NUNCA diga que emitiu a nota — quem emite é o sistema.`
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

  // Depois do catálogo de propósito: o preço de tabela é o geral, a cobrança em
  // aberto é o caso concreto deste cliente — e é ela que vale quando divergem
  // (cobrança vinda da agenda tem preço próprio do evento).
  const cobrancas = buildCobrancasBlock(ctx);
  if (cobrancas) blocks.push(cobrancas);

  const cadastro = buildCadastroBlock(ctx);
  if (cadastro) blocks.push(cadastro);

  blocks.push(buildCadastroRuleBlock());
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
