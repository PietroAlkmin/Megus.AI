# Kaua — Conexão WhatsApp multi-tenant (instância Evolution por empresa) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Cada empresa conecta o SEU WhatsApp dentro da plataforma: cria uma instância Evolution própria → escaneia o QR → fica conectada → e o bot dela **responde pela instância dela**. Self-service, por tenant.

**Architecture:** (1) envio por-tenant — `OutboundText/Media` ganham `instance`, o `ConversationStateMachine` manda a `integration.evolutionInstance`, o `EvolutionMessagingProvider` envia pela instância certa; (2) provisionamento — um `IWhatsAppProvisioner` (Evolution admin API: create instance + set webhook + QR + connectionState) atrás de rotas `POST /api/agente/whatsapp/connect` e `GET .../status`; (3) frontend — o `WhatsAppQrModal` puxa o QR real e faz polling do status. Inbound já roteia por `to`=número da instância (webhookMapper) → nada a mudar lá, só gravar `whatsappNumber` quando parear.

**Tech Stack:** Node/TS, Express, Vitest; Evolution API 2.3.7 (global `EVOLUTION_API_KEY`).

## Global Constraints
- **Ato fiscal intocado.** Não mexer nos gates/providers fiscais.
- **Multi-tenant:** a instância é derivada da integração da empresa do JWT (nunca de input). Um tenant não alcança a instância de outro. `whatsappNumber` só é gravado a partir do `ownerJid` real reportado pela Evolution (não de input).
- **Envio por-tenant:** `sendText/sendMedia` DEVEM usar `integration.evolutionInstance` da conversa; fallback pro global só se vazio (compat piloto).
- Sem migração de schema (Integration já tem `evolutionInstance`/`whatsappNumber`). Commits sem co-autoria.
- **Segurança:** criar instância é operação cara — 1 instância por empresa (reusa a existente); nome derivado do `integrationId`.

## File Structure
- Modify: `src/domain/ports/IMessagingProvider.ts` (`OutboundText`/`OutboundMedia` + `instance?`).
- Modify: `src/infrastructure/messaging/evolution/EvolutionMessagingProvider.ts` (usa `msg.instance ?? cfg.instance`).
- Modify: `src/application/agent/ConversationStateMachine.ts` (thread `integration.evolutionInstance` em `send`/`sendMedia`/`handoff`).
- Modify: `src/domain/ports/repositories.ts` (`IIntegrationRepository.updateConnection(integrationId, evolutionInstance, whatsappNumber)`) + InMemory + Prisma.
- Create: `src/domain/ports/IWhatsAppProvisioner.ts` — `provision(instanceName): Promise<{qrBase64: string|null}>`; `status(instanceName): Promise<{connected: boolean; number: string|null}>`.
- Create: `src/infrastructure/messaging/evolution/EvolutionProvisioner.ts` — implementa via Evolution admin API.
- Create: `src/infrastructure/http/api/routes/whatsapp.routes.ts` — `POST /connect`, `GET /status`. Modify `app.ts` (montar em `/api/agente/whatsapp`) e `main.ts` (instanciar o provisioner + passar o webhook URL por env `PUBLIC_WEBHOOK_URL` default `http://megus-app:3000/webhook/evolution`).
- Frontend: Create `src/frontend/Megus Wireframe/src/whatsapp/whatsappService.js`; Modify `WhatsAppQrModal.jsx` (QR real + polling), `app.html`/`auth.html` (carregar o service).

---

### Task 1: Envio por-tenant (refactor da mensageria)
**Files:** `IMessagingProvider.ts`, `EvolutionMessagingProvider.ts`, `ConversationStateMachine.ts`.
- [ ] **Step 1:** `OutboundText` e `OutboundMedia` ganham `instance?: string`.
- [ ] **Step 2:** `EvolutionMessagingProvider.sendText/sendMedia`: `const instance = msg.instance ?? this.cfg.instance;` e usar `instance` na URL (`/message/sendText/${instance}`).
- [ ] **Step 3:** `ConversationStateMachine`: `send(conv, bubbles, instance?)` passa `instance` em `sendText`; `handoff(conv, reason, instance?)` repassa a `send`; `handleComprovante` passa `instance` no `sendMedia`. Os handlers têm `integration` → passam `integration.evolutionInstance`. **NÃO** alterar a lógica dos gates — só o parâmetro `instance` no envio.
- [ ] **Step 4:** Teste em `ConversationStateMachine.chat.test.ts` (ou novo): com `integration.evolutionInstance="inst-x"`, após um `advance` que responde, `sendText` foi chamado com `instance:"inst-x"`. Existing tests seguem verdes (instance é opcional).
- [ ] **Step 5:** typecheck + `npm test` verdes. Commit `feat(wa): envio por-tenant (instance no OutboundText/Media, SM manda integration.evolutionInstance)`.

### Task 2: IIntegrationRepository.updateConnection
**Files:** `repositories.ts`, `InMemoryRepositories.ts`, `PrismaIntegrationRepository.ts`.
- [ ] **Step 1:** `updateConnection(integrationId: string, evolutionInstance: string, whatsappNumber: string): Promise<void>` na porta.
- [ ] **Step 2:** InMemory (atualiza o objeto no array). Prisma (`prisma.integration.update({where:{id}, data:{evolutionInstance, whatsappNumber, updatedAt}})`).
- [ ] **Step 3:** typecheck + testes verdes. Commit `feat(wa): IIntegrationRepository.updateConnection`.

### Task 3: IWhatsAppProvisioner + EvolutionProvisioner
**Files:** Create `IWhatsAppProvisioner.ts`, `EvolutionProvisioner.ts`.
**Especificação (Evolution admin API, base `EVOLUTION_BASE_URL`, header `apikey`):**
- `provision(instanceName)`: (a) `POST /instance/create` `{instanceName, integration:"WHATSAPP-BAILEYS", qrcode:true}` (idempotente: se já existe, 403/409 → seguir); (b) `POST /webhook/set/{instanceName}` `{webhook:{enabled:true, url: <webhookUrl>, byEvents:false, base64:true, events:["MESSAGES_UPSERT"]}}`; (c) obter QR: da resposta do create (`qrcode.base64`) OU `GET /instance/connect/{instanceName}` → `base64`. Retorna `{qrBase64}`.
- `status(instanceName)`: `GET /instance/connectionState/{instanceName}` → `state` ('open'|'connecting'|'close'); se `open`, `GET /instance/fetchInstances` (achar por name) → `ownerJid` → número (só dígitos). Retorna `{connected: state==='open', number}`.
- [ ] **Step 1:** porta + implementação (fetch nativo, header `apikey`). Sem teste de rede aqui (validação real no VPS na Task 6); typecheck limpo. Commit `feat(wa): EvolutionProvisioner (create+webhook+qr+state)`.

### Task 4: Rotas /api/agente/whatsapp/connect e /status
**Files:** Create `whatsapp.routes.ts`; Modify `app.ts`, `main.ts`.
- `r.use(authMiddleware)`.
- `POST /connect`: `companyId` do JWT → `integrations.ensureDefaultForCompany(companyId)`; nome da instância = `integration.evolutionInstance || ("megus-"+integration.id)`; `provisioner.provision(nome)`; `integrations.updateConnection(integration.id, nome, integration.whatsappNumber || "")`; devolve `{qr: qrBase64, instance: nome}`.
- `GET /status`: integração da empresa → se sem `evolutionInstance` → `{connected:false}`; senão `provisioner.status(evolutionInstance)`; se `connected`, `updateConnection(id, instance, number)`; devolve `{connected, number}`.
- `app.ts`: montar `app.use("/api/agente/whatsapp", whatsappRoutes({integrations, provisioner, authMiddleware, webhookUrl}))`. `main.ts`: instanciar `EvolutionProvisioner` (base/apikey do env) + `webhookUrl = env.PUBLIC_WEBHOOK_URL ?? "http://megus-app:3000/webhook/evolution"` (adicionar ao `env.ts`).
- [ ] Teste (mock do provisioner): POST /connect devolve qr + grava instance na integração; GET /status connected grava number. Commit `feat(wa): rotas connect/status (instancia por empresa, tenant do JWT)`.

### Task 5: Frontend — QR real + polling
**Files:** Create `whatsappService.js`; Modify `WhatsAppQrModal.jsx`, `app.html`, `auth.html`.
- `whatsappService.js`: `window.MegusWhatsApp = { connect: () => MegusApi.post('/api/agente/whatsapp/connect'), status: () => MegusApi.get('/api/agente/whatsapp/status') }`.
- `WhatsAppQrModal.jsx`: no mount, `connect()` → renderizar o QR REAL (`<img src={qrBase64}>` — o base64 já vem como data-url ou prefixar `data:image/png;base64,`); trocar o `setTimeout(mock)` por **polling** de `status()` a cada 3s → quando `connected`, setar `connected=true` + mostrar o número. Manter o visual/passos.
- `app.html`/`auth.html`: `<script src="src/whatsapp/whatsappService.js"></script>`.
- [ ] Commit `feat(wa): QrModal puxa QR real + polling do status (fim do mock)`.

### Task 6: Deploy + teste ao vivo [controlador + Pietro]
- [ ] Deploy backend (git archive + rebuild). Validar no VPS: `POST /connect` cria instância + devolve QR; `GET /status` reflete. Confirmar o webhook da nova instância aponta pro app.
- [ ] Pietro: cadastra empresa nova → configura agente → "Conectar WhatsApp" → escaneia com o **chip novo** → "Conectado" → manda msg → o bot da empresa nova responde pela instância dela.

## Self-Review
Envio por-tenant (crux) → Task 1; provisionamento → Tasks 3-4; QR real → Task 5. Inbound multi-instância já funciona (roteia por `to`). Segurança: instância derivada do tenant, número do ownerJid real. Piloto (Megus) segue funcionando (fallback + status já 'open').
