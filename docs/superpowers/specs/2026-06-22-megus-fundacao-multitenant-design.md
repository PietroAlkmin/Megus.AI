# Megus AI — Fundação Multi-Tenant + Persistência (Fase 1) — Design

**Goal:** dar ao Megus uma **base multi-tenant com persistência real** (Azure SQL via Prisma): modelar `Company`/`User`/`Membership` e amarrar a `Integration` a uma empresa, trocando os repositórios em memória por repositórios Prisma atrás das mesmas portas — sem perder estado no restart e sem ainda construir auth ou UI.

**Architecture:** mantém Clean Arch + DDD do Megus. As entidades de domínio continuam **interfaces puras**; o Prisma vive só na camada de infraestrutura (uma implementação nova por porta, mais portas novas para `User`/`Company`/`Membership`). O composition root escolhe Prisma ou in-memory por `DATABASE_URL`. O tenant em runtime continua resolvido pelo número de WhatsApp da mensagem recebida.

**Tech Stack:** Node 22 / TypeScript (ESM), Prisma (provider `sqlserver`), Azure SQL, as portas/entidades existentes do Megus.

## Global Constraints

- **Sem fluxo de auth no MVP** — apenas a *estrutura* (`User`, `Company`, `Membership`). Nada de senha, login, JWT, sessão. Campos de credencial entram numa fase futura de auth.
- **Sem UI / frontend** nesta fase. Entrega é backend puro (modelo + persistência + seed + migrations).
- **Domínio puro:** nenhuma entidade de domínio importa Prisma. Os repositórios (infra) mapeiam linha Prisma ↔ entidade de domínio.
- **Portas inalteradas:** as interfaces de repositório existentes não mudam de assinatura; ganham implementação Prisma. As implementações in-memory **permanecem** (modo de teste/dev).
- **Toggle por `DATABASE_URL`:** preenchida → repos Prisma; vazia → repos in-memory. Mesmo padrão de `MESSAGING_PROVIDER`.
- **Tenant em runtime** é resolvido por número de WhatsApp (`IIntegrationRepository.getByWhatsappNumber`), como hoje. A empresa é alcançada via `integration.companyId`.
- **Segredos só em `.env`** (gitignored): `DATABASE_URL`, `DATABASE_URL_TEST`. Nunca no repo. Connection string traduzida de ADO.NET para o formato `sqlserver://...` do Prisma.
- **Commits sem trailer de atribuição** (sem `Co-Authored-By`).
- IDs continuam **UUID string gerado pela aplicação** (`randomUUID`), como nos ports atuais — o app fornece o `id` ao salvar.

---

## 1. Modelo de dados

Hierarquia:

```
User ──(Membership: role)── Company ──1:N── Integration ──1:N── { AgentConfig, Service,
                              (tenant)        (WhatsApp/Kaua)       Contact, Conversation,
                                                                   Message, EmissionIntent }
```

### Entidades novas

- **Company (o tenant / a empresa prestadora):**
  `id, name, fiscalDoc (CNPJ/CPF do prestador), fiscalName, fiscalProviderRef (string|null), active, createdAt, updatedAt`.
  A **identidade fiscal do prestador sai da `Integration` e passa a morar aqui** — é a empresa que é o prestador.
- **User:** `id, name, email (único), createdAt, updatedAt`. Sem campos de senha/credencial nesta fase.
- **Membership:** `id, userId, companyId, role (enum: "owner"), createdAt`. Tabela de vínculo extensível: o MVP cria **1 membership por usuário** (1↔1), mas o schema já permite time/N:N depois sem refactor.

### Entidade alterada

- **Integration (o "Kaua" de uma empresa):**
  - **ganha** `companyId` (FK → Company) e `evolutionInstance` (string; nome da instância Evolution — hoje fixo `"Megus"`, vira por-tenant numa fase futura).
  - **mantém** `whatsappNumber`, `active`, `displayName`, timestamps.
  - **perde** `fiscalDoc` e `fiscalName` (subiram para `Company`).

### Entidades inalteradas (forma)

`AgentConfig`, `Service`, `Contact`, `Conversation`, `Message`, `EmissionIntent` mantêm os campos atuais e continuam escopados por `integrationId`. Para chegar na empresa: `integration.companyId`.

### Impacto no código existente

- `ConversationStateMachine.handleComprovante` e o caminho de emissão hoje leem `integration.fiscalDoc` / `integration.fiscalName`. Passam a ler `integration.company.fiscalDoc` / `.fiscalName` (a `Integration` carregada traz a `Company`, ou o caso de uso resolve a empresa). As portas que entregam a `Integration` para o fluxo devem incluir a empresa.

### Esboço do `schema.prisma` (provider sqlserver)

```prisma
model Company {
  id               String        @id
  name             String
  fiscalDoc        String
  fiscalName       String
  fiscalProviderRef String?
  active           Boolean       @default(true)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  memberships      Membership[]
  integrations     Integration[]
}

model User {
  id          String       @id
  name        String
  email       String       @unique
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  memberships Membership[]
}

model Membership {
  id        String   @id
  userId    String
  companyId String
  role      String   @default("owner")
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  company   Company  @relation(fields: [companyId], references: [id])
  @@unique([userId, companyId])
}

model Integration {
  id               String          @id
  companyId        String
  displayName      String
  whatsappNumber   String
  evolutionInstance String
  active           Boolean         @default(true)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  company          Company         @relation(fields: [companyId], references: [id])
  agentConfig      AgentConfig?
  services         Service[]
  contacts         Contact[]
  conversations    Conversation[]
  emissions        EmissionIntent[]
}
// AgentConfig, Service, Contact, Conversation, Message, EmissionIntent:
// espelham as entidades atuais, com FK integrationId (e Message.conversationId).
// Campos compostos (capabilities, knowledgeFiles, fewShotDialogs) → colunas String
// com JSON serializado (o provider sqlserver do Prisma NÃO tem tipo Json nativo);
// o repositório serializa/desserializa no mapeamento linha ↔ entidade.
```

---

## 2. Camada de persistência

- **Prisma é a fonte do modelo.** `schema.prisma` gera o client tipado e as migrations. As **entidades de domínio continuam puras** (zero import de Prisma); os repositórios de infra mapeiam linha ↔ entidade.
- **Repositórios Prisma** para cada porta existente (`IConversationRepository`, `IContactRepository`, `IIntegrationRepository`, `IAgentConfigRepository`, `IServiceRepository`, `IEmissionIntentRepository`) + **portas novas** `IUserRepository`, `ICompanyRepository`, `IMembershipRepository` (cada uma com sua impl Prisma e in-memory).
- **In-memory permanece** como modo de teste/dev (os 50 testes atuais continuam rodando sem banco).
- **Toggle no composition root** (`main.ts`): `DATABASE_URL` preenchida → repos Prisma; vazia → in-memory.
- **Seed idempotente** (`prisma/seed.ts` ou script equivalente, via upsert): cria a Company "Consultório (piloto)" + User + Membership(owner) + Integration (número `5511922211300`, `evolutionInstance="Megus"`) + AgentConfig do Kaua + Service "Massagem" R$180. Substitui o seed hardcoded do `main.ts`.
- **Migrations:** `prisma migrate` versiona o schema; `prisma migrate deploy` aplica em produção.
- **Pré-requisitos de infra (não-código):** (1) firewall do Azure SQL liberando o IP do VPS `187.77.253.134` — **feito**; (2) `DATABASE_URL` no `.env` no formato Prisma `sqlserver://megusdata.database.windows.net:1433;database=megusDB;user=...;password=...;encrypt=true`.

---

## 3. Cutover do piloto vivo + deploy

- **Sem migração de dados real:** o estado in-memory de hoje é efêmero (já zera no restart); conversas/contatos atuais são descartáveis. A única coisa a preservar é a **configuração do piloto**, que o **seed reproduz no banco**. O pareamento do WhatsApp e a instância Evolution não são tocados (vivem no postgres do Evolution, separado).
- **Dockerfile:** adiciona `npx prisma generate` no build (client na imagem).
- **Start do container:** roda `npx prisma migrate deploy` e o **seed idempotente** antes de subir o app.
- **`.env` do VPS:** ganha `DATABASE_URL`; o compose passa pro container `megus-app`.
- **`main.ts`:** com `DATABASE_URL` setada, **pula o seed in-code** (dados vêm do banco); sem ela, mantém o seed in-memory atual.
- **Rollback:** esvaziar `DATABASE_URL` → volta pro in-memory na hora (rede de segurança no primeiro dia).
- **Sequência do primeiro cutover:** deploy com `DATABASE_URL` → migrate (cria tabelas) + seed (cria config do piloto) → app sobe lendo do banco → zap de teste confirma resolução via banco nos logs → restart deixa de zerar.

---

## 4. Testes

1. **Contrato de repositório (peça-chave):** uma suíte que exercita o comportamento das portas — criar/buscar, dedup, e **escopo por tenant** (empresa A nunca enxerga dado de empresa B). Parametrizada por uma factory: roda contra **in-memory no CI** (rápido, sem banco) e contra **Prisma quando `DATABASE_URL_TEST` existir** — garantindo paridade entre as duas implementações.
2. **Smoke Prisma no deploy:** migrate → seed → cria company/integration/conversa → lê de volta → zap de teste. Não trava o CI esperando banco.
3. **Seed idempotente:** teste de que rodar o seed 2x não duplica.
4. **Os 50 testes atuais continuam** verdes no modo in-memory (default).

---

## Critérios de aceite

- Com `DATABASE_URL` setada, o container roda migrate + seed e o app sobe lendo do banco; inbound resolve a Integration do piloto pelo número `5511922211300`.
- **Escopo por tenant garantido:** uma consulta no escopo da empresa A não retorna dados da empresa B (coberto pelo contrato de repositório).
- **Restart preserva** a configuração e as conversas (não zera mais).
- Com `DATABASE_URL` vazia, o app cai no in-memory e os 50 testes continuam verdes.
- O contrato de repositório passa contra a in-memory; a impl Prisma é validada pelo smoke de deploy.
- O fluxo do piloto no WhatsApp real continua idêntico (identidade → CPF↔nome → comprovante → emissão → PDF), agora persistido.

## Fora de escopo (Fase 1)

- **Fluxo de auth** (login, senha/hash, JWT, sessão, reset, verificação de email) — fase de auth posterior.
- **UI / frontend** (telas de cadastro, painel de personalização do Kaua) — Fase 2.
- **Provisionamento de instância Evolution por-tenant** e conexão de número pelo painel — Fase 3.
- **Dashboards / leitura de conversas e notas no painel.**
- **Convites, papéis além de `owner`, multi-empresa por usuário** — o schema permite, o MVP não usa.
- **Comprovante real (visão) e emissão de NFS-e real (Kapty)** — roadmap separado, não depende desta fase.
