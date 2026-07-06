# Kaua — Fase 6: Personalização do agente pelo painel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usam checkbox.

**Goal:** Editar a persona do Kaua no painel (nome/tom/emojis/idioma/instruções/segmento/exemplos) e ver refletir na conversa do WhatsApp — via `GET/PUT /api/agente`, com o modal `AtendenteVirtualModal` ligado, login reconciliado ao piloto (`co-piloto`), painel rodando local apontando pro backend do VPS.

**Architecture:** Segue o padrão de `empresa.routes.ts` (auth por JWT, zod, repos). Resolve a integração do piloto pela empresa do usuário logado. O brain já relê o `AgentConfig` a cada mensagem → salvar reflete no próximo turno.

**Tech Stack:** Node/TS, Express, Vitest; frontend vanilla React (CDN+Babel, sem build).

## Global Constraints
- **Escopo:** só campos de PERSONA que já dirigem a conversa: `name, segment, tone, emojis, lang, instructions, fewShotDialogs`. NÃO editar `linkedServiceIds`/serviços nem arquivos (RAG) nesta fase — o PUT PRESERVA o que já existe nesses campos.
- **Multi-tenant:** tenant SEMPRE do `req.auth.companyId` (JWT), nunca de param/body. A integração é resolvida por `companyId` (posse garantida).
- **Ato fiscal intocado:** esta fase não toca `ConversationStateMachine`/gates/providers.
- Sem migração de schema (AgentConfig já existe). Commits sem trailer de co-autoria.

## File Structure
- Modify: `src/domain/ports/repositories.ts` — `IAgentConfigRepository.save`; `IIntegrationRepository.getFirstByCompanyId`.
- Modify: `src/infrastructure/persistence/memory/InMemoryRepositories.ts` — implementar os 2 métodos novos.
- Modify: `src/infrastructure/persistence/prisma/PrismaAgentConfigRepository.ts` — `save` (upsert por integrationId, serializando *Json).
- Modify: `src/infrastructure/persistence/prisma/PrismaIntegrationRepository.ts` — `getFirstByCompanyId` (JOIN Company).
- Create: `src/infrastructure/http/api/routes/agente.routes.ts` — `GET/PUT /api/agente`.
- Modify: `src/infrastructure/http/api/app.ts` — montar `/api/agente`.
- Create: `src/infrastructure/persistence/seedPilotAdmin.ts` — reconcilia o login `piloto@megus.ai` p/ ter UMA membership em `co-piloto`.
- Modify: `src/main.ts` — chamar `seedPilotAdmin` (em vez do RegisterUser em company-piloto).
- Create: `tests/application/agente.routes.test.ts` (ou no molde existente) — GET/PUT.
- Frontend: Create `src/frontend/Megus Wireframe/src/agente/agenteService.js`; Modify `AtendenteVirtualModal.jsx` (modo edição: prefill + save), `app.html`/`auth.html` (`MEGUS_API_BASE` → VPS + carregar o service).

---

### Task 1: Repos — save do AgentConfig + getFirstByCompanyId da Integration

**Files:** `repositories.ts`, `InMemoryRepositories.ts`, `PrismaAgentConfigRepository.ts`, `PrismaIntegrationRepository.ts`.

**Interfaces (Produces):**
```ts
// IAgentConfigRepository
getByIntegrationId(integrationId: string): Promise<AgentConfig | null>;
save(config: AgentConfig): Promise<void>;               // NOVO
// IIntegrationRepository
getByWhatsappNumber(number: string): Promise<Integration | null>;
getById(id: string): Promise<Integration | null>;
getFirstByCompanyId(companyId: string): Promise<Integration | null>;  // NOVO
```

- [ ] **Step 1: InMemory** — `agentConfigs.save(cfg)` (upsert por integrationId no array `_agentConfigs`); `integrations.getFirstByCompanyId(companyId)` — no in-memory a Integration não tem companyId; adicionar suporte: o seed in-memory passa a aceitar companyId? **Simplificação:** no in-memory, `getFirstByCompanyId` retorna a 1ª integração cujo `id` casa um seed — como o in-memory não modela companyId, retornar `this._integrations[0] ?? null` (há 1 no piloto). Documentar que a resolução real por companyId é no Prisma.
- [ ] **Step 2: PrismaAgentConfigRepository.save** — `prisma.agentConfig.upsert({ where: { integrationId: cfg.integrationId }, update: { name, segment, tone, emojis, lang, instructions, capabilitiesJson, knowledgeFilesJson, fewShotDialogsJson, updatedAt }, create: {...todos...} })`. Serializar capabilities/knowledge/fewShot com JSON.stringify.
- [ ] **Step 3: PrismaIntegrationRepository.getFirstByCompanyId** — `prisma.integration.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" }, include: { Company: true } })` → `integrationToDomain`.
- [ ] **Step 4: Typecheck** limpo; `npm test` verde (não deve quebrar nada).
- [ ] **Step 5: Commit** `feat(agente): repos save(AgentConfig) + getFirstByCompanyId`.

### Task 2: Rota GET/PUT /api/agente

**Files:** Create `agente.routes.ts`; Modify `app.ts`.

**Especificação** (molde `empresa.routes.ts`):
- `r.use(authMiddleware)`.
- `GET /api/agente`: `companyId` do JWT → `integrations.getFirstByCompanyId(companyId)`; se não houver → `ok(res, personaVazia())`. Se houver → `agentConfigs.getByIntegrationId(integ.id)`; devolver `{ name, segment, tone, emojis, lang, instructions, fewShotDialogs }` (só persona) + `integrationId`.
- `PUT /api/agente`: zod valida `{ name, segment, tone: enum(formal|equilibrado|descontraido), emojis: bool, lang: enum(pt|en|es), instructions, fewShotDialogs: array({q,a}) }`. Resolve a integração (getFirstByCompanyId); 404 se não houver. Carrega o AgentConfig existente (getByIntegrationId) para PRESERVAR `capabilities` (linkedServiceIds), `knowledgeFiles`, `id`; sobrescreve só os campos de persona; `save`. Devolve a persona salva.

- [ ] **Step 1: Teste** `tests/application/agente.routes.test.ts` — usa o app Express (createApiApp) com InMemoryRepositories seedado (1 integração + 1 agentConfig), um token JWT válido (assinado com o mesmo jwtSecret), e testa: GET devolve a persona; PUT muda o tom e o GET seguinte reflete; PUT preserva linkedServiceIds. (Molde: ver como `authMiddleware`/`createApiApp` são montados; gerar token com `jwt.sign({sub,companyId,email}, secret)`.)
- [ ] **Step 2: ver falhar → implementar `agente.routes.ts` + montar em `app.ts` (`app.use("/api/agente", agenteRoutes({ integrations, agentConfigs, authMiddleware }))`) → ver passar.**
- [ ] **Step 3: Typecheck + testes verdes. Commit** `feat(agente): GET/PUT /api/agente (persona, tenant do JWT, preserva servicos)`.

### Task 3: seedPilotAdmin — login no co-piloto

**Files:** Create `seedPilotAdmin.ts`; Modify `main.ts`.

**Especificação:** `seedPilotAdmin()` idempotente: garante o user `piloto@megus.ai` (senha `megus123`, bcrypt) e que ele tenha **exatamente UMA** membership = `co-piloto` (deleta memberships de outras empresas desse user; upsert a de co-piloto). Assim o JWT resolve companyId=co-piloto deterministicamente → vê o int-piloto/Kaua. Em `main.ts`, trocar o bloco RegisterUser(company-piloto) por `await seedPilotAdmin()` (quando `DATABASE_URL`).

- [ ] **Step 1: Implementar** (usa prisma direto: upsert user com passwordHash bcrypt; `deleteMany({ where: { userId, companyId: { not: "co-piloto" } } })` em membership; upsert membership co-piloto). Idempotente.
- [ ] **Step 2: main.ts** — substituir o seed do test-user por `seedPilotAdmin()`.
- [ ] **Step 3: Typecheck + testes verdes. Commit** `feat(agente): seedPilotAdmin reconcilia login piloto@megus.ai no co-piloto`.

### Task 4: Frontend — agenteService + modal em modo edição + base URL

**Files:** Create `agenteService.js`; Modify `AtendenteVirtualModal.jsx`, `app.html`, `auth.html`.

- [ ] **Step 1: `agenteService.js`** (padrão dos outros services): `window.MegusAgente = { async carregar() { return window.MegusApi.get('/api/agente'); }, async salvar(persona) { return window.MegusApi.put('/api/agente', persona); } }`. Mapa modal↔domínio fica no modal (Step 2).
- [ ] **Step 2: `AtendenteVirtualModal.jsx` modo edição** — aceitar prop `initial` (persona do backend) e `onSaved` que persiste: no mount, se `initial`, prefill `cfg` (map: name→nome, segment→segmento, tone→tom, emojis, lang→idioma [pt→'pt-BR'], instructions→instrucoes, fewShotDialogs→exemplos [{q,a}→{cliente,agente}]). No botão salvar, chamar `window.MegusAgente.salvar({ name: cfg.nome, segment: cfg.segmento, tone: cfg.tom, emojis: cfg.emojis, lang: cfg.idioma==='pt-BR'?'pt':cfg.idioma, instructions: cfg.instrucoes, fewShotDialogs: cfg.exemplos.map(e=>({q:e.cliente,a:e.agente})) })` e mostrar sucesso/erro (não quebrar o fluxo do QR existente — adicionar caminho de edição sem remover o de onboarding).
- [ ] **Step 3: Ponto de entrada da edição** — na `AgentePage.jsx` ou no Shell, um botão "Configurar agente" que faz `MegusAgente.carregar()` e abre o modal com `initial`. (Escolher o lugar mais simples; documentar.)
- [ ] **Step 4: `app.html` + `auth.html`** — `window.MEGUS_API_BASE = "http://187.77.253.134:3000"` e adicionar `<script src="src/agente/agenteService.js"></script>`.
- [ ] **Step 5: Commit** `feat(agente): painel edita persona via /api/agente (modal modo edicao) + base URL VPS`. (Frontend roda local — sem deploy.)

### Task 5: Deploy backend + reconciliar dados + verificar

- [ ] **Step 1 [controlador/VPS]:** setar `JWT_SECRET` forte no `/opt/megus/.env`; deploy backend (git archive → app + `docker compose up -d --build`); confirmar boot + `seedPilotAdmin` rodou.
- [ ] **Step 2 [controlador/VPS]:** validar contra o Azure: login `piloto@megus.ai` resolve co-piloto; `GET /api/agente` devolve a persona do Kaua; `PUT` muda o tom; conferir no banco.
- [ ] **Step 3 [Pietro]:** abrir o painel local, logar, editar o tom/instruções, salvar, e mandar msg no WhatsApp → o Kaua responde no tom novo.

## Self-Review
Cobre §8 do design (personalização): endpoints com tenant do JWT (não param) ✅; preserva linkedServiceIds ✅; reconciliação do login (gate de dado que o review da Fase 1 apontou) ✅; escopo persona (YAGNI: serviços/RAG fora) ✅. Backend testável in-memory; frontend local.
