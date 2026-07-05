# P2 — Grupo 2 (Task 4): advance() dispatcher-com-guarda + conversa livre + invariante fiscal

**Branch:** `feat/kaua-cerebro` · **Base:** `ddd946a` · **Data:** 2026-07-05

## Escopo executado
Task 4 do plano `docs/superpowers/plans/2026-07-05-kaua-fase2-cerebro.md`:
des-engessar a máquina de estados. `advance()` virou dispatcher-com-guarda (mata o
`default: "Um momento, já te respondo."`), `handleChatting` trata as actions novas,
regra dura mídia→gate B, e a suíte de conversa + invariante fiscal.

**Gates INTOCADOS (constraint dura):** `processIdentity` (gate A), `handleComprovante`
(gate B), `handoff`, `send` — byte-a-byte. Só `advance` e `handleChatting` mudaram.

## `advance()` novo (colado)
```ts
if (conversation.humanHandoff) return; // bot calado

// Regra dura: mídia em estado de comprovante → gate B (handleComprovante) ANTES
// de qualquer roteamento ao cérebro. O ato fiscal NUNCA passa pela IA.
if (
  inbound.media &&
  (conversation.state === ConversationState.AwaitingComprovante ||
    conversation.state === ConversationState.VerifyingComprovante)
) {
  return this.handleComprovante(conversation, agentConfig, integration, inbound);
}

switch (conversation.state) {
  case ConversationState.CollectingIdentity:
  case ConversationState.ValidatingCpf:
    return this.handleIdentity(conversation, agentConfig, integration, inbound);
  case ConversationState.AwaitingComprovante:
  case ConversationState.VerifyingComprovante:
    return this.handleComprovante(conversation, agentConfig, integration, inbound);
  default:
    // New, ReadyToEmit, Done e qualquer outro estado não-fiscal → conversa livre.
    // O default deixa de ser o "Um momento" morto: o cérebro responde em todo estado.
    return this.handleChatting(conversation, agentConfig, integration, inbound);
}
```

## `handleChatting` — spec implementada
1. Roda o brain com o contexto rico (`this.context(...)` já ligado na Task 3).
2. **Extração eager de identidade** (inalterada): se `extracted.fullName && extracted.cpf`
   → `state=CollectingIdentity` + `save` + `processIdentity(...)` (o gate A valida). Continua idêntica.
3. Envia `decision.reply`.
4. **Roteamento por action** (nenhuma alcança o ato fiscal):
   - `intent_emit` → `state=CollectingIdentity` + `save` (mesmo efeito do antigo
     `request_identity`; só ACIONA a coleta, nunca pula portão).
   - `handoff` → `this.handoff(conv, reason)` (adicionado nesta task).
   - `reply` / `answer_question` / `quote_price` / `smalltalk` / `provide_identity` /
     `request_comprovante` → só a resposta (já enviada), sem transição fiscal.

## Testes criados — `tests/application/ConversationStateMachine.chat.test.ts` (5 casos)
Molde `depsWith`/`imageInbound` copiado de `.emission.test.ts`; add `textInbound`/`newConversation`/`awaitingComprovante`.
1. **New + quote_price** responde (`sendText` com a cotação), `state` continua `New`, `emitNfse`/`upsertCustomer` nunca chamados.
2. **Done responde** ("De nada!") em vez de "Um momento, já te respondo" — assere `brain.decide` chamado, o texto novo enviado, o texto morto NÃO enviado, `emitNfse` não chamado. **(este era o único RED contra o `ddd946a`.)**
3. **intent_emit em New** → `state=CollectingIdentity`, reply enviada, `emitNfse`/`upsertCustomer` nunca chamados.
4. **INVARIANTE FISCAL** — loop sobre `[reply, answer_question, quote_price, smalltalk, provide_identity, intent_emit]`: cada action em New → `emitNfse` NUNCA chamado.
5. **Mídia em AwaitingComprovante** → `comprovante.analyze` chamado (gate B), `brain.decide` NÃO chamado.

TDD: escrevi os testes → `npx vitest run ConversationStateMachine.chat` → **1 RED** (caso Done: `brain.decide` 0 chamadas, batia no default morto) → implementei → **5 GREEN**.

## Ajuste de testes de regressão (renomeação `request_identity`→`intent_emit`)
O action `request_identity` saiu do union na Task 1 (virou `intent_emit`, efeito idêntico). Renomeei os 3 usos remanescentes em testes, afirmando o contrato correto (comportamento idêntico, os testes seguem verdes):
- `tests/acceptance/happyPath.test.ts` (1ª msg do brain + comentários).
- `tests/application/ConversationStateMachine.identity.test.ts` (2 mocks).

Zero `request_identity` restante em `src/`(exceto 1 comentário explicativo) e `tests/`.

## Verificação
- `npm run typecheck` → **limpo**.
- `npm run typecheck:test` → **limpo**.
- `npm test` → **65 passed | 1 skipped (66)** (era 60|1 antes; +5 chat). Regressão VERDE:
  - `ConversationStateMachine.identity.test.ts` (4) — gate A.
  - `ConversationStateMachine.emission.test.ts` (2) — gate B/C (comprovante triplo + emite/handoff).
  - `tests/acceptance/happyPath.test.ts` (1) — fluxo completo conversa→coleta→comprovante→emite→PDF.
  - `ConversationStateMachine.chat.test.ts` (5) — novos.

## Prova: gates byte-a-byte (`git diff ddd946a -- ...ConversationStateMachine.ts`)
3 hunks, TODOS dentro de `advance()` e `handleChatting()`:
- `@@ -53,9` → guarda mídia→gate B (add) no `advance`.
- `@@ -63,7` → remove `case New`, `default` passa a `handleChatting` (mata "Um momento").
- `@@ -82,10` → `handleChatting` ganha o branch `handoff` + comentário do roteamento.

**Nenhum `+`/`-` de lógica em `processIdentity` / `handleComprovante` / `handoff` / `send`.** Sem imports novos.

## Concerns
- **`handoff` em handleChatting envia `decision.reply` ANTES de transferir** (spec: "Depois envia decision.reply. E trata a action"). Se o brain devolver `handoff` com reply não-vazia, o cliente vê a bolha do brain + a mensagem de transferência. É o que a spec descreve; nenhum teste required exercita handoff-em-chat. Se preferir handoff terminal (sem a bolha solta), é troca de 1 linha.
- A **guarda mídia→gate B é funcionalmente redundante** com o `case AwaitingComprovante/VerifyingComprovante` do switch (mesmos estados). Mantida de propósito (defense-in-depth, "regra dura" da spec): torna o invariante explícito e robusto a reordenação futura do switch. O teste 5 passa com ou sem ela.
- Estados `ReadyToEmit`/`Emitting` caem no `default → handleChatting`. `Emitting` é um estado transitório dentro de `handleComprovante` (nunca persistido entre turns no fluxo atual); `ReadyToEmit` hoje não é setado por ninguém. Sem impacto no fluxo real; se um turno chegar nesses estados, o comportamento é conversar (não emitir) — consistente com "a IA nunca emite".
