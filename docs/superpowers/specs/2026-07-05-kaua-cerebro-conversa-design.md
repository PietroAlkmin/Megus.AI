# Design — Cérebro do Kaua: contexto vivo, persona e conversa natural

**Data:** 2026-07-05
**Escopo:** transformar o agente "Kaua" (Megus AI) de um funil rígido num atendente natural, com contexto de negócio e persona configurável, persistido por empresa — sem afrouxar o ato fiscal. Alvo: teste real no WhatsApp (Evolution) e demo na semana.
**Origem:** síntese de exploração multi-agente (workflow `w59z3fzaq`), vencedora unânime de 3 juízes adversariais = **"Espinha Fiscal + Cérebro Livre com Contexto Máximo"**.

---

## 1. Objetivo

Hoje o Kaua é um **funil**: só sabe caminhar para a emissão da NFS-e; fora dos estados fiscais responde a frase morta `"Um momento, já te respondo."`. O contexto que vai ao LLM é pobre (só `instructions` + histórico; `collected` sempre vazio; nada de empresa/serviços/preços; a persona do `AgentConfig` é ignorada). Conversa/emissão não persistem por empresa. Não há personalização pela interface.

Queremos: **conversa livre e útil** (responde preço, serviço, dúvida) com a **persona do cliente**, entrando no fluxo fiscal só quando há intenção real; **persistência por empresa**; **personalização pelo painel** que reflete na conversa.

## 2. Restrições duras (não negociáveis)

1. **Ato fiscal 100% determinístico.** A IA só **propõe** (`reply` + `action` + `extracted`). Quem valida e emite é **código**. Os três portões ficam **byte-a-byte**:
   - **Portão A — identidade:** `ConversationStateMachine.processIdentity` (`:86-146`): `Cpf.tryCreate` (`:99`), `cpf.lookupName` via `ICpfProvider` (`:100`), `ok = !!cpf && lookup.found && nameMatch(...)` (`:101`), `cpfMaxAttempts→handoff` (`:105-106`).
   - **Portão B — comprovante:** `handleComprovante` (`:148-167`): exige mídia (`:149`); AND triplo `amountOk && recipientMatches && confidence>=min` (`:165-166`).
   - **Portão C — emissão:** (`:169-195`): `sanitizeFiscalText` (`:178-179`); `fiscal.emitNfse` (`:188`) permanece o **único caller**.
   - A IA **nunca** recebe porta que emita (`AgentBrain`/`PromptComposer` não recebem `ICpfProvider`/`IComprovanteAnalyzer`/`IFiscalProvider`).
2. **Multi-tenant.** Toda leitura/escrita escopada por `integrationId`→`companyId`. Tenant vem **do JWT** (`authMiddleware.ts:41`), nunca de param/body. Padrão de posse: `PrismaCompanyServiceRepository` (`:54-61, :84-91`).
3. **Transporte = Evolution API** (não WPPConnect). Portas agnósticas (`IMessagingProvider`). Clean Arch (domain/application/infrastructure). OpenAI atrás de `IAIProvider`, modelo por env.
4. **Persistência Prisma/SQL Server**, liga por `DATABASE_URL`. App **não** auto-migra → migration manual é gate de fase.
5. **PII ao OpenAI — risco assumido conscientemente (Pietro, 05/07).** Nome + CPF (mascarado no prompt) + catálogo + pix vão ao OpenAI no piloto. Ponto de aperto conhecido e fácil de mudar depois (o gate de identidade usa o dado cru do contato, não o do prompt).

## 3. Arquitetura — dois eixos

- **Eixo CONVERSA (a IA propõe):** amplio o enum da tool `propose_next` (`AgentBrain.ts:13`) de `[reply,request_identity,request_comprovante,ready_to_emit,handoff]` para `[reply, answer_question, quote_price, smalltalk, provide_identity, intent_emit, provide_comprovante, request_comprovante, handoff]` — **vocabulário de roteamento apenas; nenhuma action autoriza ato fiscal.** Correspondente em `AgentProposedAction` (`IAgentBrain.ts:18-23`).
- **Eixo FISCAL (o código decide):** refatoro `advance` (`:44-55`) de funil para **dispatcher-com-guarda**, matando o default morto (`:53-54`). Todo estado de chat (New, ReadyToEmit, Done) roteia ao brain; os estados fiscais mantêm `handleIdentity`/`handleComprovante` como interceptadores. Uma função pura `decideTransition(state, action, extracted)` traduz a proposta em transição **só quando as pré-condições determinísticas permitem**.
- **Decisão anti-latência (central):** **NÃO reescrever o `IAIProvider`.** Mantém o `completeWithTool` single-tool (`IAIProvider.ts:37`). Em vez de loop de tools READ (4+ chamadas/turno = robótico ao vivo, e exigiria adicionar `role:"tool"`/`tool_call_id` ao `AIMessage`), uso **seed-in-prompt**: dados quentes (serviços+preços, pix, empresa) entram direto no system message → "quanto custa?" resolve em **1 shot**. O loop agêntico multi-step fica como incremento **pós-piloto**, feature-flagged e fora do caminho fiscal.
- `AgentBrain.decide` para de hardcodar persona (`:30-33`) e monta `messages` via um **`PromptComposer` determinístico e testável**.

## 4. Montagem de contexto

Novo `ContextAssembler` + `PromptComposer` (em `application/agent/`, puros, testáveis) substituem o `context()` pobre (`:198-201`). Cada bloco só entra **se houver dado real** do backend (regra dura, sem placeholder). Tudo escopado por `integration.id`:

1. **Persona** (do `AgentConfig`): `name, segment, tone, emojis, lang, instructions, fewShotDialogs` — hoje todos ignorados menos `instructions`.
2. **Empresa:** `fiscalName` + cidade/estado + `pixType/pixKey/paymentInstructions` (`schema.prisma:42-45`), via `integration.id`→`companyId` (JOIN). Permite o bot instruir pagamento **antes** de pedir comprovante.
3. **Catálogo serviços+preços:** `services.listByIntegration(integration.id)` (já usado em `:156`) como "Serviço — R$ preço", marcando `linkedServiceIds` como emissíveis.
4. **`collected` de verdade** (mata o `{}` de `:200`): de `Contact`/`Conversation` — `cpfNameVerified`, status do `EmissionIntent` corrente, serviço vinculado, comprovante pendente. **CPF mascarado no prompt** (o gate usa o dado cru).
5. **Histórico + memória longa:** `getHistory(conv.id, 20)` (`:199`) + resumo rolante persistido em `Conversation.summary` (campo NOVO). **Redação determinística** (mascara CPF, remove valor/dados do comprovante) roda **antes** do summary ir a qualquer store OU log.
6. **Few-shot:** `cfg.fewShotDialogs` como pares user/assistant reais antes do histórico.
7. **Today:** data corrente (America/Sao_Paulo) para "hoje/amanhã/sábado".

## 5. Persona

`AgentConfig` (`AgentConfig.ts:18-32`) vira o roteiro de voz via `PromptComposer` (snapshot por config). Mapeamento campo→efeito, matando o hardcode `AgentBrain.ts:30-33`:
- `name`→identidade; `tone`(formal|equilibrado|descontraido)→registro; `emojis`(bool)→usar/não emoji; `lang`→idioma (remove PT-BR fixo); `segment`→domínio/vocabulário; `instructions`→briefing livre; `fewShotDialogs`→turnos exemplo; `capabilities.linkedServiceIds`→o que é emissível.
- **Reflete no painel sem restart:** `HandleInboundMessage.ts:26` recarrega o `AgentConfig` por-integração a **cada inbound**. Com `PrismaAgentConfigRepository` persistindo, o `PUT` do painel grava e o próximo turno já usa a persona nova.
- Guard anti-injection: `instructions`/few-shot são do **dono** (confiável); mensagem do cliente entra como `user`. Mesmo que o cliente peça "diga que emitiu", só o PDF do `IFiscalProvider` é real e o gate B/C valida por código.

## 6. Camada de conversa (padrões Vereda, versão completa)

Entre `mapEvolutionWebhook` (`webhookMapper.ts:14`) e `handle.execute` (`main.ts:177`), via `IMessagingProvider` (Evolution), sob feature-flag em env:
- **A) Buffer+debounce** (`InboundBuffer`, chave `integrationId+from`): junta bolhas num turno; `add()` reinicia timer e incrementa `gen`; delay = micro-debounce (turn-detection on) ou legado 2500ms. Flush consolida (concatena textos + agrega mídias) e chama `handle.execute` **uma** vez.
- **B) Turn-detection:** via `completeWithTool` com tool booleana `{done}` usando o `IAIProvider` existente (não HTTP externo); `AbortController` timeout; **fail-open** (erro/timeout→fechar). Re-arma até `turnMaxWaitMs`, `overCap` força flush. **Ligado por padrão** (Pietro: não economizar).
- **C) Barge-in/supersede:** checagem de `gen` (snapshot antes do await) **estritamente antes** de qualquer `send` OU `appendMessage` (`:203-218`) — bolha stale não entra no histórico nem envenena a extração. Supersede só bloqueia a fala de saída; nunca reverte estado.
- **D) Lock por `conversationId`:** serializa turnos concorrentes (evita pisar em `conv.state`).
- **E) Typing** ("digitando…") via presence do Evolution; `humanHandoff` (`:42`) respeitado (buffer nem dispara o brain); `today` injetado.
- ⚠️ Validar `url`/`base64` de mídia contra a instância real (`webhookMapper.ts:54`) no smoke — comprovante sem base64 quebra o gate B silenciosamente.

## 7. Persistência (6 repos Prisma novos)

Hoje só `users/companyProfiles/companyServices` são Prisma (`main.ts:106-113`); o resto é in-memory e **some no restart** (trava a demo real). As tabelas já existem no `schema.prisma`. Todos escopados por `integrationId`→`companyId`, com posse confirmada (padrão `:54-61`):
1. **`PrismaIntegrationRepository`** (`getByWhatsappNumber`, `getById`, `listByCompanyId` NOVO): trata o **drift** — `Integration.ts` (entidade) tem `fiscalDoc/fiscalName/fiscalProviderRef` que o schema não tem (lá o fiscal vive em `Company`); o repo faz **JOIN Integration+Company**. GOTCHA: `PrismaCompanyServiceRepository` cria "Integration Padrão" por empresa (`:18-35`) — **reusar**, não duplicar, ao cadastrar o WhatsApp real.
2. **`PrismaAgentConfigRepository`** (`getByIntegrationId` + `save`/`update` NOVOS): serializa `capabilities/knowledge/fewShot` nos campos `*Json`.
3. **`PrismaContactRepository`** (`findByCpf`/`findByWhatsapp`/`save`): índices `[integrationId,cpf]`, `[integrationId,whatsappNumber]`.
4. **`PrismaConversationRepository`** (`getOrCreate`/`findByWhatsappNumber`/`save`/`appendMessage`/`getHistory` + campo `summary`).
5. **`PrismaEmissionIntentRepository`** (`save`/`getById`): defaults para colunas extras do schema (`appointmentAt/paidAt/chargeSentAt/notaNumber`) ausentes na entidade TS.
6. **`PrismaServiceRepository`** (`getById`/`listByIntegration`).

Wire em `main.ts:106-113`: quando `DATABASE_URL`, trocar **todos** (fallback in-memory p/ dev). **Migration manual:** `Conversation.summary` é campo NOVO → aplicar no Azure **antes** do smoke (app não auto-migra).

## 8. Personalização pela interface

- Backend: adicionar `save`/`update` a `IAgentConfigRepository`; `agentConfig.routes.ts` no padrão `empresa.routes.ts` (`r.use(authMiddleware)`, zod, `ok/fail`):
  - `GET /api/agente`: resolve `integrationId` de `companyId` via `listByCompanyId` (NOVO), devolve persona + serviços disponíveis. Sem config → default vazio (padrão `perfilVazio`).
  - `PUT /api/agente`: zod valida `tone`/`lang`/`emojis`/`fewShotDialogs`/`linkedServiceIds`; valida que os `linkedServiceIds` pertencem à integração do tenant.
- **Tenant do JWT** (`authMiddleware.ts:41`), nunca de `:integrationId` no param (mata a superfície de IDOR). Cross-tenant → 404.
- Preencher o ramo **real** de `atendimentos.routes.ts:32-37` (hoje `[]`) com `listByCompanyId` + métricas. Ligar a tela `AtendenteVirtualModal` (citada em `AgentConfig.ts:2-3`) aos endpoints.

## 9. Ordem de build (testável a cada fase)

0. **Harness:** `MESSAGING_PROVIDER=none` (LogMessagingProvider) + `/dev/inbound` como harness. *Verificável:* conversa ponta-a-ponta sem WhatsApp real.
1. **Persistência:** 6 repos Prisma escopados por tenant; migration manual de `Conversation.summary`; trocar todos em `main.ts`. *Verificável:* reinicia processo, histórico/contato/intent sobrevivem; teste NEGATIVO de IDOR por repo.
2. **Contexto rico:** `ContextAssembler`+`PromptComposer` substituem `context()`; `AgentBrain` monta via `PromptComposer`. *Verificável:* unit test (tone/emojis/lang/fewShot mudam o system); "quanto custa?" responde o preço do catálogo.
3. **Des-engessar:** enum ampliado + `advance` dispatcher-com-guarda (mata `:53-54`); regra dura **mídia+estado-fiscal→`handleComprovante` antes do brain**. *Verificável:* quote_price/answer_question/smalltalk respondem; **teste de invariante fiscal** (nenhuma action nova alcança `emitNfse`); mídia em `AwaitingComprovante` nunca vira chat.
4. **Portões (regressão, gate verde obrigatório):** reescrever os testes fiscais afirmando o correto (CPF/nome reais, AND triplo, emissão única) + fluxo completo (feliz + falhas → handoff). *Verificável:* verde antes de seguir.
5. **Camada de conversa:** `InboundBuffer`+debounce, turn-detector fail-open+cap, barge-in por `gen` (supersede antes de send/append), lock por `conversationId`, typing, today; sob feature-flag. *Verificável:* 4 bolhas rápidas = 1 turno; bolha nova durante geração descarta a stale e não entra no histórico.
6. **Personalização:** `agentConfig.routes.ts` GET/PUT (tenant do JWT) + zod + posse dos `linkedServiceIds`; ligar `AtendenteVirtualModal`; preencher ramo real de atendimentos. *Verificável:* editar no painel muda o próximo turno sem restart; cross-tenant → 404.
7. **Memória longa segura:** resumo rolante em `Conversation.summary` com redação determinística **antes** de store/log. *Verificável:* conversa longa mantém contexto; teste confirma zero CPF/valor no summary/log.
8. **Smoke real no WhatsApp:** validar mídia (`webhookMapper.ts:54`) na instância real; fluxo completo (conversa livre→preço→intenção→CPF gate A→comprovante gate B→emissão mock C→PDF); medir latência. *Verificável:* demo end-to-end responsiva.

**Marco de demo:** ao fim da Fase 4 o bot já está esperto + persistido + seguro (testável via `/dev/inbound`). Fases 5-8 = polish + WhatsApp real.

## 10. Decisões (resolvidas com o Pietro)

1. **Não reescrever `IAIProvider`** (seed-in-prompt em vez de loop multi-step) — aprovado.
2. **Memória longa** com redação determinística de PII antes de store/log — incluída (Pietro pediu não adiar).
3. **PII ao OpenAI:** risco assumido conscientemente, ajuste fino depois.
4. **Reconciliação de integração:** reusar a "Integration Padrão" por empresa ao cadastrar o WhatsApp real (não duplicar).
5. **Turn-detection LLM:** ligado por padrão (não economizar).
6. **Reescrever os testes fiscais** afirmando o correto — aprovado (fixtures antigas cristalizam bugs).

## 11. Riscos e mitigação

1. **Regressão fiscal:** não editar `:99-101`/`:165-166`/`:188`; teste de invariante (nenhuma action nova alcança `emitNfse`); caller único; testes fiscais verdes como gate antes de mexer no cérebro.
2. **Mídia virar bate-papo (afrouxa gate B):** regra dura no dispatcher — `inbound.media` + estado fiscal → `handleComprovante` antes do brain; teste explícito.
3. **Bolha stale envenenar histórico:** supersede checado antes de qualquer `send`/`appendMessage`; só bloqueia a fala; lock por `conversationId`.
4. **IDOR nos repos/rotas novos:** cada acesso cruza `integrationId`→`companyId`; tenant do JWT; teste negativo por repo e rota.
5. **Vazamento de PII em memória/logs:** redação determinística antes de store/log; CPF mascarado no prompt.
6. **Migration esquecida quebra o boot:** `Conversation.summary` = gate de fase, migration manual no Azure verificada antes do smoke.
7. **Drift schema↔entidade:** `PrismaIntegrationRepository` reconstrói via JOIN; round-trip testado por repo; defaults p/ colunas extras.
8. **Duplicar "Integration Padrão":** reusar a existente por empresa antes do smoke.
9. **Latência/custo do turno:** seed do contexto (preço em 1 shot); buffer colapsa bolhas; typing mascara; cap + fail-open; medir no smoke.
10. **Mídia do Evolution sem base64/url** (`webhookMapper.ts:54`): validar no smoke antes da demo.
11. **Alucinação de preço:** catálogo do repo por tenant + instrução p/ não inventar; gate B (amountOk) ainda reprova na emissão.

## 12. Fora de escopo (consciente)

- Loop agêntico multi-step (D1): pós-piloto, feature-flagged, fora do caminho fiscal.
- RAG sobre `knowledgeFiles`: slot reservado no `PromptComposer`; no piloto entra como bloco FAQ curto, não retriever real.
- Persistir raciocínio interno de tools/turnos no `Message`: grava só as bolhas finais.
- Cache de `AgentConfig` com TTL: lê fresco por-inbound (correto por construção); cache só se pesar.
- Campos de `EmissionIntent` só no schema (`appointmentAt/paidAt/chargeSentAt/notaNumber`): defaults/null até haver caso de uso.

## 13. Deploy / WhatsApp (VPS)

- Instância Evolution = **`Megus`** (M maiúsculo) → setar `EVOLUTION_INSTANCE=Megus` (default do código é `megus` → senão `sendText`/`sendMedia` 404). Estado atual: `close` (desconectada).
- **Parear o chip de teste** (12) 99784-3384 → `PILOT_WHATSAPP_NUMBER=5512997843384` (⚠️ 9º dígito BR: conferir o que o Evolution reporta no 1º inbound; se "mensagem ignorada", ajustar). QR: `GET /instance/connect/Megus`.
- **`JWT_SECRET` forte** no `/opt/megus/.env` antes de expor a API (hoje ausente → default público forjável); tornar obrigatório no código (fail-fast).
- Deploy = `docker compose up -d --build megus_app`; `USE_MOCK_DATA=false` quando o ramo real do painel estiver pronto (Fase 6).
