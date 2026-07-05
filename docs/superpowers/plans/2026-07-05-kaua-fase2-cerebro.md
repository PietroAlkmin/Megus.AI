# Kaua — Fase 2/3/4: Cérebro (contexto + persona + des-engessar + portões) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Transformar o Kaua de funil rígido em atendente natural: contexto de negócio (empresa, serviços+preços) + persona (tom/emojis/idioma/few-shot do AgentConfig) chegam ao LLM, e a máquina de estados deixa de funilar — conversa livre em todo estado de chat — SEM afrouxar o ato fiscal.

**Architecture:** Dois eixos. **Conversa (IA propõe):** amplia o enum da tool `propose_next` (só roteamento; nenhuma action emite) e o `AgentBrain` passa a montar o prompt via um `PromptComposer` determinístico a partir de um `AgentContext` rico (montado por `ContextAssembler`). **Fiscal (código decide):** `advance()` vira dispatcher-com-guarda (mata o default morto), mas `handleIdentity`/`handleComprovante` e os três portões (`:99-101`, `:165-166`, `:188`) ficam **byte-a-byte**. Não reescrever `IAIProvider` (seed-in-prompt, 1 shot).

**Tech Stack:** Node 20 + TS (ESM), Vitest, OpenAI atrás de `IAIProvider`.

## Global Constraints

- **Portões fiscais BYTE-A-BYTE.** NÃO alterar a lógica de `ConversationStateMachine.processIdentity` (`:86-146`, gate A: `Cpf.tryCreate` + `cpf.lookupName` + `nameMatch` + `cpfMaxAttempts→handoff`), `handleComprovante` (`:148-196`, gate B: exige mídia + AND triplo `amountOk && recipientMatches && confidence>=min`; gate C: `sanitizeFiscalText` + `fiscal.emitNfse` único caller em `:188`). O refactor só muda ROTEAMENTO de conversa, nunca o conteúdo desses métodos.
- **A IA nunca emite.** `AgentBrain`/`PromptComposer`/`ContextAssembler` NÃO recebem `ICpfProvider`/`IComprovanteAnalyzer`/`IFiscalProvider`. Nenhuma `action` nova autoriza ato fiscal. `intent_emit` só faz o MESMO que `request_identity` faz hoje (move para `CollectingIdentity` + pede nome/CPF).
- **Regra dura mídia→gate B:** em QUALQUER estado, se `inbound.media` presente E `state ∈ {AwaitingComprovante, VerifyingComprovante}` → `handleComprovante` ANTES de qualquer roteamento ao brain.
- **Multi-tenant:** contexto montado sempre escopado por `integration.id` (serviços via `services.listByIntegration(integration.id)`, já em `:156`). CPF/nome vão **mascarados** no prompt; o gate usa o dado cru do contato.
- **Não reescrever `IAIProvider`** (mantém `completeWithTool` single-tool; NÃO adicionar role "tool"/tool_call_id). Contexto entra via seed-in-prompt no system message.
- **Testável em in-memory** (sem banco, sem OpenAI real): brain com `IAIProvider` fake (vi.fn), SM com `InMemoryRepositories` + deps mockadas (padrão dos testes atuais). `npm run typecheck` + `npm test` verdes por task.
- **PIX/paymentInstructions FORA de escopo nesta fase** (a entidade `Integration` do domínio não carrega pix; entra numa fase futura estendendo Integration+repo). Não inventar.
- Commits **sem** trailer `Co-Authored-By`/atribuição a IA.

---

## File Structure

- Modify: `src/domain/ports/IAgentBrain.ts` — estende `AgentContext` (persona/business/collected/today), amplia `AgentProposedAction`.
- Create: `src/application/agent/ContextAssembler.ts` — monta o `AgentContext` a partir de (conversation, agentConfig, integration, services, contact).
- Create: `src/application/agent/PromptComposer.ts` — puro: `AgentContext → AIMessage[]` (system com persona+negócio+few-shot, depois history).
- Modify: `src/infrastructure/ai/AgentBrain.ts` — usa `PromptComposer`; amplia o enum da tool `propose_next`; remove o system hardcoded.
- Modify: `src/application/agent/ConversationStateMachine.ts` — `context()` monta o rico (via ContextAssembler); `advance()` vira dispatcher-com-guarda; `handleChatting` trata as actions novas. `processIdentity`/`handleComprovante` INTOCADOS.
- Modify (testes): `tests/infrastructure/ai/AgentBrain.test.ts` — novo shape de `AgentContext`.
- Create (testes): `tests/application/agent/PromptComposer.test.ts`, `tests/application/agent/ContextAssembler.test.ts`, `tests/application/ConversationStateMachine.chat.test.ts` (des-engessar + invariante fiscal).
- Reference (NÃO alterar lógica): `tests/application/ConversationStateMachine.identity.test.ts` e `.emission.test.ts` e `tests/acceptance/happyPath.test.ts` — rede de regressão; têm que continuar VERDES.

---

## Grupo A — Contrato (interfaces que tudo o resto usa)

### Task 1: Estender AgentContext e AgentProposedAction

**Files:** Modify `src/domain/ports/IAgentBrain.ts`.

**Interfaces (Produces) — use EXATAMENTE estes tipos:**
```ts
import type { Message } from "../entities/Message";

export interface AgentPersona {
  name: string;
  segment: string;
  tone: "formal" | "equilibrado" | "descontraido";
  emojis: boolean;
  lang: "pt" | "en" | "es";
  instructions: string;
  fewShotDialogs: { q: string; a: string }[];
}
export interface AgentBusinessService { description: string; price: number; emissivel: boolean; }
export interface AgentBusiness {
  companyName: string;                 // integration.fiscalName
  services: AgentBusinessService[];    // serviços da integração; emissivel = está em linkedServiceIds
}
export interface AgentCollected {
  cpfNameVerified: boolean;            // contato já validou CPF↔nome?
  fullNameMasked: string | null;      // ex.: "João S." (nunca o nome cru completo? mantém 1º nome + inicial)
  cpfMasked: string | null;           // ex.: "529.***.**7-25"
  emissionStatus: string | null;      // status do EmissionIntent corrente, se houver
}
export interface AgentContext {
  persona: AgentPersona;
  business: AgentBusiness;
  state: string;                      // ConversationState atual
  history: Message[];
  collected: AgentCollected;
  today: string;                      // data corrente PT-BR (ex.: "sábado, 5 de julho de 2026")
}

export type AgentProposedAction =
  | { type: "reply" }
  | { type: "answer_question" }       // respondeu dúvida de negócio
  | { type: "quote_price" }           // cotou preço de serviço
  | { type: "smalltalk" }             // conversa social
  | { type: "provide_identity" }      // cliente forneceu nome/CPF (extracted preenchido)
  | { type: "intent_emit" }           // cliente quer emitir → aciona coleta de identidade
  | { type: "request_comprovante" }
  | { type: "handoff"; reason: string };

export interface AgentDecision {
  reply: string[];
  action: AgentProposedAction;
  extracted?: { fullName?: string; cpf?: string; amount?: number };
}
export interface IAgentBrain { decide(context: AgentContext): Promise<AgentDecision>; }
```
Nota: o antigo `{ type: "request_identity" }` some do union — é substituído por `intent_emit` (mesmo efeito no código). O `systemInstructions` sai do `AgentContext` (vai via `persona.instructions`).

- [ ] **Step 1: Aplicar os tipos acima em `IAgentBrain.ts`** (substituir `AgentContext`, `AgentProposedAction`, manter `AgentDecision`/`IAgentBrain`).
- [ ] **Step 2: Typecheck** — Run `npm run typecheck` — Expected: ERROS esperados em `AgentBrain.ts`, `ConversationStateMachine.ts` e `AgentBrain.test.ts` (consomem o shape antigo). Isso é o guia do que as próximas tasks arrumam. NÃO commitar ainda se quebra o build isolado — esta task é o contrato; as tasks 2-6 fecham. **Commit desta task JUNTO com a Task 2** (o contrato sozinho não compila).

*(Task 1 e 2 formam uma unidade de commit — o contrato + o primeiro consumidor que o faz compilar.)*

---

## Grupo B — Fase 2: Contexto rico + Persona

### Task 2: PromptComposer (puro) + AgentBrain usando-o + enum ampliado da tool

**Files:**
- Create `src/application/agent/PromptComposer.ts`
- Create `tests/application/agent/PromptComposer.test.ts`
- Modify `src/infrastructure/ai/AgentBrain.ts`
- Modify `tests/infrastructure/ai/AgentBrain.test.ts`

**Interfaces:**
- Consumes: `AgentContext`, `AIMessage` (`IAIProvider`).
- Produces: `composePrompt(ctx: AgentContext): AIMessage[]`.

**Especificação do `composePrompt` (determinístico):** monta 1 mensagem `system` + as mensagens do histórico como user/assistant (igual ao AgentBrain atual `:34-40`). O `system` é montado por blocos, cada um só se houver dado:
1. Identidade+persona: `"Você é o {persona.name}, atendente da {business.companyName}."` + diretiva de tom (`formal`→"Trate por senhor/senhora, sem gírias."; `equilibrado`→"Seja cordial e direto."; `descontraido`→"Tom leve e informal.") + emojis (`true`→"Pode usar emojis com moderação."; `false`→"NÃO use emojis.") + idioma (`pt`→"Responda em português."; `en`→inglês; `es`→espanhol) + segmento.
2. Briefing livre do cliente: `persona.instructions` (se não-vazio).
3. Catálogo: para cada `business.services`, uma linha `"- {description}: R$ {price}"`, marcando os `emissivel` como "(emite nota)". Instrução: "Só cote preços desta lista; não invente valores."
4. Estado + regra fiscal: `"Estado atual: {state}. Quando o cliente quiser emitir a nota, use a action intent_emit e peça nome completo + CPF. Ao receber nome e CPF, devolva-os em extracted com action provide_identity. NUNCA diga que emitiu a nota — quem emite é o sistema."`
5. `collected` (se `cpfNameVerified` ou `emissionStatus`): "Já sabemos: cliente {verificado/não}, ..." (usa os campos MASCARADOS).
6. Data: `"Hoje é {today}."`
7. Few-shot: para cada `persona.fewShotDialogs`, um par `{role:"user",content:q}`,`{role:"assistant",content:a}` ANTES do histórico.

- [ ] **Step 1: Teste do PromptComposer (falha)** — arquivo `tests/application/agent/PromptComposer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { composePrompt } from "../../../src/application/agent/PromptComposer";
import type { AgentContext } from "../../../src/domain/ports/IAgentBrain";

function ctx(over: Partial<AgentContext> = {}): AgentContext {
  return {
    persona: { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "Seja gentil.", fewShotDialogs: [] },
    business: { companyName: "Clínica X", services: [{ description: "Massagem", price: 180, emissivel: true }, { description: "Consulta", price: 250, emissivel: false }] },
    state: "new", history: [], collected: { cpfNameVerified: false, fullNameMasked: null, cpfMasked: null, emissionStatus: null }, today: "sábado, 5 de julho de 2026",
    ...over,
  };
}
describe("composePrompt", () => {
  it("system carrega nome, empresa, catálogo com preços e a data", () => {
    const msgs = composePrompt(ctx());
    expect(msgs[0].role).toBe("system");
    const sys = msgs[0].content as string;
    expect(sys).toContain("Kaua");
    expect(sys).toContain("Clínica X");
    expect(sys).toContain("Massagem");
    expect(sys).toContain("180");
    expect(sys).toContain("2026");
  });
  it("tom/emojis/idioma mudam o system (snapshot por config)", () => {
    const formalNoEmoji = composePrompt(ctx({ persona: { ...ctx().persona, tone: "formal", emojis: false, lang: "en" } }))[0].content as string;
    expect(formalNoEmoji).toContain("senhor");
    expect(formalNoEmoji.toLowerCase()).toContain("não use emoji");
  });
  it("few-shot entra como pares user/assistant antes do histórico", () => {
    const msgs = composePrompt(ctx({ persona: { ...ctx().persona, fewShotDialogs: [{ q: "oi", a: "olá!" }] } }));
    expect(msgs[1].role).toBe("user");
    expect(msgs[1].content).toBe("oi");
    expect(msgs[2].role).toBe("assistant");
    expect(msgs[2].content).toBe("olá!");
  });
  it("regra fiscal está no system (nunca dizer que emitiu)", () => {
    const sys = composePrompt(ctx())[0].content as string;
    expect(sys).toMatch(/nunca diga que emitiu/i);
  });
});
```
- [ ] **Step 2: Rodar e ver falhar** — `npm test -- PromptComposer` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar `PromptComposer.ts`** conforme a especificação acima (função pura `composePrompt`, sem I/O). História mapeada como no AgentBrain atual (`author==="contact"?"user":"assistant"`).
- [ ] **Step 4: Ver passar** — `npm test -- PromptComposer` → PASS.
- [ ] **Step 5: Reescrever `AgentBrain.ts`** — `decide(ctx)` monta `messages = composePrompt(ctx)`, chama `this.ai.completeWithTool({ model, messages, tool: PROPOSE_NEXT })`, e devolve `{reply, action, extracted}` com os mesmos fallbacks seguros de hoje (`a.reply ?? []`, `a.action ?? {type:"reply"}`). Ampliar o `enum` de `action.type` na tool `PROPOSE_NEXT` para `["reply","answer_question","quote_price","smalltalk","provide_identity","intent_emit","request_comprovante","handoff"]`. Remover o system hardcoded (agora vem do composer).
- [ ] **Step 6: Atualizar `tests/infrastructure/ai/AgentBrain.test.ts`** para o novo `AgentContext` (trocar `EMPTY_CONTEXT` pelo shape novo: persona/business/collected/today em vez de systemInstructions). Manter as asserções de repasse de reply/action/extracted e de que `model`/`tool.name` são passados; ajustar o teste de "inclui histórico" (agora system + few-shot(0) + 2 history = 3 mensagens).
- [ ] **Step 7: Typecheck + testes** — `npm run typecheck` (AgentBrain compila; ConversationStateMachine.context() ainda vai estar quebrado — será a Task 3) — **se a SM não compilar isolada, faça a Task 3 antes do commit conjunto.** `npm test -- AgentBrain PromptComposer` verde.
- [ ] **Step 8: (após Task 3 compilar tudo) Commit** das Tasks 1+2+3 juntas (contrato + composer + brain + SM.context) — mensagem `feat(cerebro): contexto rico + persona via PromptComposer; AgentBrain monta prompt do AgentConfig`.

### Task 3: ContextAssembler + ConversationStateMachine.context() rico

**Files:**
- Create `src/application/agent/ContextAssembler.ts`
- Create `tests/application/agent/ContextAssembler.test.ts`
- Modify `src/application/agent/ConversationStateMachine.ts` (só o método `context()` e imports; `advance`/`handleIdentity`/`handleComprovante` INTOCADOS nesta task).

**Interfaces:**
- Produces: `assembleContext(input): AgentContext` onde `input = { conversation, agentConfig, integration, services: Service[], contact: Contact | null, history: Message[], today: string }`.

**Especificação:**
- `persona` ← campos do `agentConfig` (name/segment/tone/emojis/lang/instructions/fewShotDialogs).
- `business.companyName` ← `integration.fiscalName`; `business.services` ← `services.map(s => ({ description: s.description, price: s.price, emissivel: agentConfig.capabilities.linkedServiceIds.includes(s.id) }))`.
- `collected` ← do `contact`: `cpfNameVerified = contact?.cpfNameVerified ?? false`; `fullNameMasked = maskName(contact?.fullName)` (1º nome + inicial do sobrenome, ex.: "João S."); `cpfMasked = maskCpf(contact?.cpf)` (ex.: "529.***.**7-25"); `emissionStatus = null` por ora (sem lookup do intent nesta task — YAGNI; o estado da conversa já informa).
- `today` recebido pronto (o caller formata; determinístico no teste).
- Funções `maskName`/`maskCpf` puras (exportadas, testadas).

- [ ] **Step 1: Teste do ContextAssembler (falha)** — `tests/application/agent/ContextAssembler.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assembleContext, maskCpf, maskName } from "../../../src/application/agent/ContextAssembler";

const integration: any = { id: "int1", fiscalName: "Clínica X LTDA" };
const agentConfig: any = { name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "oi", fewShotDialogs: [], capabilities: { linkedServiceIds: ["svc1"] } };
const services: any = [{ id: "svc1", description: "Massagem", price: 180 }, { id: "svc2", description: "Consulta", price: 250 }];

describe("ContextAssembler", () => {
  it("maskCpf esconde o miolo", () => { expect(maskCpf("52998224725")).toBe("529.***.**7-25"); expect(maskCpf(null)).toBeNull(); });
  it("maskName vira 1º nome + inicial", () => { expect(maskName("João da Silva")).toBe("João S."); expect(maskName(null)).toBeNull(); });
  it("monta persona, negócio (emissivel por linkedServiceIds) e collected", () => {
    const ctx = assembleContext({ conversation: { state: "new" } as any, agentConfig, integration, services, contact: { fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true } as any, history: [], today: "hoje" });
    expect(ctx.persona.name).toBe("Kaua");
    expect(ctx.business.companyName).toBe("Clínica X LTDA");
    expect(ctx.business.services.find(s => s.description === "Massagem")!.emissivel).toBe(true);
    expect(ctx.business.services.find(s => s.description === "Consulta")!.emissivel).toBe(false);
    expect(ctx.collected.cpfNameVerified).toBe(true);
    expect(ctx.collected.cpfMasked).toBe("529.***.**7-25");
    expect(ctx.collected.fullNameMasked).toBe("João S.");
  });
});
```
- [ ] **Step 2: Ver falhar** — `npm test -- ContextAssembler` → FAIL.
- [ ] **Step 3: Implementar `ContextAssembler.ts`** conforme spec (puro; `state: conversation.state`).
- [ ] **Step 4: Ver passar** — `npm test -- ContextAssembler` → PASS.
- [ ] **Step 5: Ligar em `ConversationStateMachine.context()`** — substituir o método `context()` (`:198-201`) por: buscar `services = await this.d.services.listByIntegration(integration.id)`, `history = await this.d.conversations.getHistory(conv.id, 20)`, `contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber)`, e `return assembleContext({ conversation: conv, agentConfig: cfg, integration, services, contact, history, today: formatToday() })`. `formatToday()` = data local America/Sao_Paulo em PT-BR (helper puro-ish; aceitar `new Date()` aqui é ok — runtime real). A assinatura de `context(conv, cfg)` passa a receber também `integration` (ajuste as chamadas em `handleChatting`/`handleIdentity`). **NÃO tocar em `processIdentity`/`handleComprovante`.**
- [ ] **Step 6: Typecheck + regressão** — `npm run typecheck` limpo; `npm test` — os testes de identity/emission/happyPath continuam VERDES (o brain é mockado neles, então a montagem de contexto real não os afeta; se algum quebrar por assinatura de `context()`, ajuste a CHAMADA, nunca o gate). 
- [ ] **Step 7: Commit conjunto Tasks 1+2+3** (mensagem na Task 2 Step 8).

---

## Grupo C — Fase 3: Des-engessar (dispatcher-com-guarda)

### Task 4: advance() vira dispatcher + handleChatting trata actions novas + regra mídia→gate B

**Files:**
- Modify `src/application/agent/ConversationStateMachine.ts` (`advance` e `handleChatting`; gates INTOCADOS).
- Create `tests/application/ConversationStateMachine.chat.test.ts`.

**Especificação do `advance()` novo:**
```
if (conversation.humanHandoff) return;                     // igual hoje (:42)
// regra dura: mídia em estado de comprovante → gate B ANTES do brain
if (inbound.media && (state===AwaitingComprovante || state===VerifyingComprovante)) return handleComprovante(...);
switch (state) {
  case CollectingIdentity: case ValidatingCpf:            return handleIdentity(...);   // INTOCADO
  case AwaitingComprovante: case VerifyingComprovante:    return handleComprovante(...); // INTOCADO
  default:                                                return handleChatting(...);    // New, ReadyToEmit, Done, e qualquer outro → conversa
}
```
Ou seja: mata o `default: "Um momento, já te respondo."` — o default agora é CONVERSAR. Estados de chat = tudo que não é identidade/comprovante.

**`handleChatting` novo:** roda o brain (com contexto rico). A extração eager de identidade continua (se `extracted.fullName && extracted.cpf` → `state=CollectingIdentity` + `processIdentity`, igual `:64-70`). Depois envia `decision.reply`. E trata a `action`:
- `intent_emit` → `state = CollectingIdentity` + `save` (idêntico ao `request_identity` de hoje, `:73-76`). NUNCA pula portão.
- `reply`/`answer_question`/`quote_price`/`smalltalk`/`provide_identity`/`request_comprovante` → só a resposta (já enviada); sem transição fiscal.
- `handoff` → `handoff(conv, reason)`.

- [ ] **Step 1: Testes de chat + invariante (falham)** — `tests/application/ConversationStateMachine.chat.test.ts` (reuse o `baseDeps`/`integration`/`agentConfig`/`inbound` no molde de `.identity.test.ts`; seed com um serviço):
```ts
// (copiar baseDeps/integration/agentConfig/inbound/imageInbound do molde de .emission.test.ts)
describe("ConversationStateMachine — conversa (des-engessado)", () => {
  it("estado New com quote_price responde e NÃO entra no funil nem emite", async () => {
    // brain.decide → { reply:["Massagem custa R$180"], action:{type:"quote_price"} }
    // após advance em New: sendText chamado; state continua New; fiscal.emitNfse NUNCA chamado; upsertCustomer nunca chamado
  });
  it("estado Done (pós-emissão) responde em vez de 'Um momento, já te respondo'", async () => {
    // conv.state=Done; brain.decide → { reply:["De nada!"], action:{type:"smalltalk"} }
    // advance → sendText chamado com "De nada!"; emitNfse não chamado
  });
  it("intent_emit em New → move para CollectingIdentity (pede identidade), sem emitir", async () => {
    // brain.decide → { reply:["Claro! Me manda nome e CPF"], action:{type:"intent_emit"} }
    // advance em New → state CollectingIdentity; emitNfse não chamado
  });
  it("INVARIANTE FISCAL: nenhuma action de conversa alcança emitNfse", async () => {
    // para cada action em [reply,answer_question,quote_price,smalltalk,intent_emit]: advance em New → expect(fiscal.emitNfse).not.toHaveBeenCalled()
  });
  it("mídia em AwaitingComprovante vai pro gate B (handleComprovante), não pro brain", async () => {
    // conv.state=AwaitingComprovante; advance(imageInbound) → comprovante.analyze chamado; brain.decide NÃO chamado
  });
});
```
Escreva as asserções concretas (com os mocks). Use `deps.brain.decide` mockado por caso.
- [ ] **Step 2: Ver falhar** — `npm test -- ConversationStateMachine.chat` → FAIL (default atual responde "Um momento"; mídia-em-New não existe; etc.).
- [ ] **Step 3: Implementar o `advance()` dispatcher + `handleChatting` novo** conforme spec. **NÃO tocar** em `processIdentity`/`handleComprovante`/`handoff`/`send`.
- [ ] **Step 4: Ver passar + regressão** — `npm test` — os novos passam E `.identity`/`.emission`/`happyPath` continuam VERDES (o refactor não muda os gates). Se `happyPath` quebrar: a 1ª msg do brain no happyPath usa `action:{type:"request_identity"}` (nome antigo) — **ajuste o teste happyPath** para `intent_emit` (é uma renomeação de action, comportamento idêntico), afirmando o correto.
- [ ] **Step 5: Typecheck** limpo.
- [ ] **Step 6: Commit** — `feat(cerebro): advance vira dispatcher-com-guarda (mata o funil); conversa livre em todo estado; mídia→gate B; invariante fiscal testado`.

---

## Grupo D — Fase 4: Regressão dos portões (gate verde)

### Task 5: Confirmar a rede de regressão + fechar a fase

**Files:** Reference `tests/application/ConversationStateMachine.identity.test.ts`, `.emission.test.ts`, `tests/acceptance/happyPath.test.ts`. (Ajustes só se a renomeação `request_identity→intent_emit` exigir — já feito na Task 4.)

- [ ] **Step 1: Suíte completa verde** — `npm run typecheck` limpo E `npm test` — TODOS verdes, incluindo: os 3 gates (`identity`: CPF↔nome + handoff; `emission`: comprovante triplo + handoff + emite; `happyPath`: fluxo completo), os novos de chat + invariante fiscal, e os da Fase 1 (persistência in-memory + mappers). Expected: 0 falhas.
- [ ] **Step 2: Conferência manual do diff dos gates** — `git diff <base-do-grupo-C> -- src/application/agent/ConversationStateMachine.ts` e confirmar que as linhas de `processIdentity` (gate A), `handleComprovante` (gate B) e `emitNfse` (gate C) NÃO mudaram (só `advance`/`handleChatting`/`context`). Registrar no report.
- [ ] **Step 3: Commit (se houve algum ajuste de teste)** — senão, fase fechada no commit da Task 4.

---

## Self-Review

**Cobertura da spec (§3 arquitetura, §4 contexto, §5 persona, §6 n/a-conversa):** dois eixos → Task 1 (contrato) + Task 4 (dispatcher); contexto rico (persona/negócio/collected/today/few-shot) → Tasks 2-3; persona dirige a voz → Task 2 (PromptComposer) + Task 3 (ContextAssembler); não-reescrever-IAIProvider → mantido (Task 2 usa completeWithTool). Camada de conversa Vereda (buffer/turn/barge-in) = Fase 5 (Plano 3), FORA daqui. Memória longa (summary) = Fase 7, FORA. Pix = fora (nota).

**Portões byte-a-byte:** Task 5 Step 2 verifica o diff; Global Constraints proíbem tocar processIdentity/handleComprovante; invariante fiscal testado na Task 4.

**Placeholder scan:** os testes de chat (Task 4 Step 1) descrevem as asserções em prosa nos comentários — o implementador ESCREVE as asserções concretas (indicado explicitamente). Demais steps têm código/comando concreto.

**Consistência de tipos:** `AgentContext`/`AgentProposedAction`/`AgentPersona`/`AgentBusiness`/`AgentCollected` definidos na Task 1 e consumidos igual em 2/3/4. `composePrompt`/`assembleContext`/`maskCpf`/`maskName` com assinaturas fixas. `intent_emit` substitui `request_identity` em TODO lugar (tool enum, union, handleChatting, happyPath).

**Risco chave:** o refactor do `advance()` perto dos gates — mitigado por (a) não tocar os métodos de gate, (b) a rede de regressão existente verde, (c) o teste de invariante, (d) a conferência de diff na Task 5.

## Próximo plano
- **Plano 3 — Fases 5-8:** camada de conversa (buffer+turn+barge-in+typing), personalização pela interface, memória longa redigida, smoke real no WhatsApp.
