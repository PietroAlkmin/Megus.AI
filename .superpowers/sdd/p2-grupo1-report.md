# Report — Plano 2 (Fase 2/3/4 — cérebro), Grupo 1 (Tasks 1-3)

Branch: `feat/kaua-cerebro`
Escopo: Task 1 (contrato `IAgentBrain`) + Task 2 (`PromptComposer` + `AgentBrain`) + Task 3 (`ContextAssembler` + `ConversationStateMachine.context()`), commitadas juntas (o contrato sozinho não compila).

## Arquivos

**Criados**
- `src/application/agent/PromptComposer.ts` — `composePrompt(ctx): AIMessage[]`, puro.
- `src/application/agent/ContextAssembler.ts` — `assembleContext(input): AgentContext`, `maskCpf`, `maskName`, puros.
- `tests/application/agent/PromptComposer.test.ts` — código do plano (Task 2 Step 1), com `!` nos acessos por índice (ver "Ajustes").
- `tests/application/agent/ContextAssembler.test.ts` — código do plano (Task 3 Step 1), sem alterações.

**Modificados**
- `src/domain/ports/IAgentBrain.ts` — `AgentContext`/`AgentProposedAction` reescritos exatamente como o plano (persona/business/collected/today; `intent_emit` no lugar de `request_identity`; `AgentBusinessService`/`AgentBusiness`/`AgentCollected`/`AgentPersona` novos). `AgentDecision`/`IAgentBrain` mantidos.
- `src/infrastructure/ai/AgentBrain.ts` — `decide()` monta `messages` via `composePrompt(context)` (removido o `system` hardcoded); enum de `action.type` da tool `propose_next` ampliado para `["reply","answer_question","quote_price","smalltalk","provide_identity","intent_emit","request_comprovante","handoff"]`; fallbacks seguros mantidos (`a.reply ?? []`, `a.action ?? {type:"reply"}`).
- `tests/infrastructure/ai/AgentBrain.test.ts` — `EMPTY_CONTEXT` trocado para o shape novo (persona/business/collected/today); teste de histórico ajustado ao comentário "system + few-shot(0) + 2 history = 3 mensagens"; teste de repasse de `action` trocado de `request_identity` para `intent_emit` (mesma semântica, nome novo).
- `src/application/agent/ConversationStateMachine.ts` — SÓ:
  - imports (`AgentContext`, `assembleContext`) + helper novo `formatToday()` (data PT-BR America/Sao_Paulo, `new Date()` real);
  - `context(conv, cfg)` → `context(conv, cfg, integration)`: busca `services.listByIntegration`, `getHistory`, `contacts.findByWhatsapp`, delega a `assembleContext(...)`;
  - as duas CHAMADAS de `context()` (em `handleChatting` e `handleIdentity`) ajustadas para passar `integration`;
  - ver "Ajustes vs. o plano" abaixo para a única mudança de conteúdo fora de `context()`.

## Gate

### `npm run typecheck`
```
> megus-ai@0.0.1 typecheck
> tsc --noEmit
```
Limpo (sem saída).

### `npm run typecheck:test` (tsconfig.test.json, cobre `tests/**`)
```
> megus-ai@0.0.1 typecheck:test
> tsc -p tsconfig.test.json --noEmit
```
Limpo (sem saída) — rodei este script também porque é o padrão já usado nos reports anteriores do branch (grupoB-report.md roda os dois). Sem ele, o `PromptComposer.test.ts` do plano não compila sob `noUncheckedIndexedAccess: true` (ver "Ajustes").

### `npm test`
```
Test Files  21 passed | 1 skipped (22)
     Tests  60 passed | 1 skipped (61)
```
Baseline antes desta unidade: 53 passed | 1 skipped (54). Ganho: +7 testes (4 `PromptComposer` + 3 `ContextAssembler`); `AgentBrain.test.ts` continua com 5 testes (reescritos, não expandidos).

**Regressão fiscal — CONFIRMADA VERDE:**
- `tests/application/ConversationStateMachine.identity.test.ts` — 4/4 verdes.
- `tests/application/ConversationStateMachine.emission.test.ts` — 2/2 verdes.
- `tests/acceptance/happyPath.test.ts` — 1/1 verde.

## Diff dos gates (conferência)

`git diff -- src/application/agent/ConversationStateMachine.ts` mostra que `processIdentity` (gate A), `handleComprovante` (gate B, incl. `emitNfse` em `:188` original) e `handoff`/`send` **não mudaram uma linha**. `advance()` (o switch-dispatcher e o `default` "Um momento...") também não mudou — fica intocado para a Task 4. As únicas mudanças de conteúdo (fora de imports/helper/`context()`) foram nas duas linhas que CHAMAM `context()` (adicionando `integration`) e uma linha em `handleChatting` (ver abaixo).

## Ajustes vs. o plano

1. **Rename obrigatório `request_identity` → `intent_emit` em `handleChatting` (linha do antigo `:73`).** O plano (Task 3 Step 5) restringe esta task a "só o método `context()` e imports" e deixa o rename de `request_identity` para a Task 4 (`handleChatting` novo). Só que o Task 1 já **remove `request_identity` do union `AgentProposedAction`** — e `handleChatting` tinha `if (decision.action.type === "request_identity")`, uma comparação de literal contra um tipo discriminado que, sem esse rename, vira erro de compilação (`TS2367`, "no overlap") sob `strict: true`. Troquei só esse literal por `"intent_emit"` (comentário explicando), preservando 100% a estrutura/lógica de `handleChatting` (mesmo `if`, mesmo efeito: move para `CollectingIdentity`). Não é o refactor de dispatcher da Task 4 — é o mínimo para o contrato da Task 1 compilar, e é exatamente o que a nota do Task 1 prescreve ("mesmo efeito no código"). Validado que nenhum teste de regressão depende do comportamento da branch antiga: em `identity.test.ts` os casos que passam por `action.type` não afirmam `conv.state` nessa branch, e em `happyPath.test.ts` a transição para `CollectingIdentity` ocorre pelo ramo de `extracted.fullName/cpf` (early-return), não por este `if`.
2. **`npm run typecheck:test` incluído no gate.** O plano só cita `npm run typecheck`; segui o padrão do `grupoB-report.md` (já rodava os dois) e descobri que o código de teste do plano para `PromptComposer.test.ts` (`msgs[0].content`, `msgs[1].role`, etc.) não compila sob `noUncheckedIndexedAccess: true` (ativo no `tsconfig.json`). Adicionei `!` non-null assertion nos 8 acessos por índice (mesmo padrão já usado em `AgentBrain.test.ts` pré-existente, ex. `call![0]`). Nenhuma asserção mudou — só a forma de acessar o array.
3. **`formatToday()`** ficou como função top-level (não exportada) dentro de `ConversationStateMachine.ts`, já que o plano não abre um arquivo novo para isso e a task só permite tocar `context()` + imports desse arquivo.

Nenhum outro desvio de tipos/assinaturas/comportamento em relação ao plano.

## Commit

Um commit, mensagem (Task 2 Step 8):
`feat(cerebro): contexto rico + persona via PromptComposer; AgentBrain monta prompt do AgentConfig`

Hash: preenchido após o commit (ver saída do comando).

## Concerns

- O ajuste (1) acima toca uma linha fora do escopo literal listado ("SÓ `context()`") — necessário para o contrato compilar; documentado e validado sem regressão. Se o Pietro preferir, dá pra reverter e já fazer a Task 4 completa numa unidade só (o `handleChatting` novo troca essa mesma linha de qualquer forma).
- `emissionStatus` no `AgentCollected` fica sempre `null` nesta task (YAGNI, conforme o plano) — o prompt nunca vai mencionar status de emissão em andamento até uma fase futura que busque o `EmissionIntent`.
- `formatToday()` usa `new Date()` real (não injetado) — não testável em isolamento por design do plano ("aceitar `new Date()` aqui é ok — runtime real"); nenhum teste depende do formato exato da data.
