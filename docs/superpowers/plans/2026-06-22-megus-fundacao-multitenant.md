# Fundação Multi-Tenant + Persistência (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao backend Megus uma base multi-tenant com persistência real em Azure SQL (via Prisma), trocando os repositórios em memória por repositórios Prisma atrás das mesmas portas — sem perder estado no restart, sem auth e sem UI.

**Architecture:** Mantém Clean Arch + DDD. Entidades de domínio continuam interfaces puras; Prisma vive só na infraestrutura (uma implementação nova por porta + portas novas para `User`/`Company`/`Membership`). Um factory escolhe Prisma ou in-memory por `DATABASE_URL`. O tenant em runtime continua resolvido pelo número de WhatsApp.

**Tech Stack:** Node 22 / TypeScript (ESM), Prisma (provider `sqlserver`), Azure SQL, vitest. SQL Server local (Docker) para autorar migrations e rodar os testes de contrato Prisma.

## Global Constraints

- **ESM, sem extensão nos imports**, `moduleResolution: Bundler`, TS strict + `noUncheckedIndexedAccess`.
- **Sem auth** (sem senha/login/JWT) e **sem UI** nesta fase — só estrutura + persistência.
- **Domínio puro:** nenhuma entidade de domínio importa Prisma. Os repositórios (infra) mapeiam linha Prisma ↔ entidade.
- **Portas inalteradas de assinatura;** in-memory **permanece** como modo de teste/dev.
- **Toggle por `DATABASE_URL`:** preenchida → Prisma; vazia → in-memory.
- **Tenant em runtime** resolvido por `IIntegrationRepository.getByWhatsappNumber`; empresa via `integration.companyId`.
- **IDs = UUID string gerado pela aplicação** (`randomUUID`); o app fornece o `id` ao salvar.
- **Campos compostos** (AgentConfig `capabilities`/`knowledgeFiles`/`fewShotDialogs`) → coluna `String` com JSON serializado (sqlserver não tem `Json` nativo); o repo serializa/desserializa.
- **Campos longos** (instructions, JSONs, message body, description) → `@db.NVarChar(Max)` no Prisma (default do sqlserver trunca em 1000).
- **Segredos só em `.env`** (gitignored): `DATABASE_URL`, `DATABASE_URL_TEST`. Connection string traduzida ADO.NET→`sqlserver://`.
- **Commits sem `Co-Authored-By`.**
- A cada tarefa: `npm run typecheck`, `npm run typecheck:test` e `npm test` verdes (modo in-memory é o default; os 50 testes atuais não podem regredir).

---

## File Structure

**Criar:**
- `src/domain/entities/Company.ts`, `User.ts`, `Membership.ts` — entidades novas.
- `src/infrastructure/persistence/Repositories.ts` — interface do "bundle" de repositórios (o que o factory retorna).
- `src/infrastructure/persistence/pilotSeed.ts` — dados do piloto (DRY: usados pelo seed in-memory e pelo seed Prisma).
- `src/infrastructure/persistence/createRepositories.ts` — factory do toggle.
- `src/infrastructure/persistence/prisma/client.ts` — singleton do PrismaClient.
- `src/infrastructure/persistence/prisma/PrismaRepositories.ts` — implementação Prisma de todas as portas.
- `prisma/schema.prisma` — schema.
- `prisma/seed.ts` — seed idempotente (upsert) para o banco.
- `docker-entrypoint.sh` — migrate + seed (se `DATABASE_URL`) e start.
- Testes: `tests/infrastructure/persistence/newRepos.inmemory.test.ts`, `tests/infrastructure/persistence/repository-contract.test.ts`, `tests/infrastructure/persistence/seed-idempotency.test.ts`.

**Modificar:**
- `src/domain/entities/Integration.ts` — perde `fiscalDoc`/`fiscalName`, ganha `companyId`/`evolutionInstance`.
- `src/domain/ports/repositories.ts` — adiciona `ICompanyRepository`/`IUserRepository`/`IMembershipRepository`.
- `src/infrastructure/persistence/memory/InMemoryRepositories.ts` — adiciona companies/users/memberships; implementa `Repositories`.
- `src/application/agent/ConversationStateMachine.ts` — `StateMachineDeps` ganha `companies`; identidade fiscal vem da Company.
- `src/main.ts` — usa o factory; remove o seed in-code (vai pro `pilotSeed`).
- `src/infrastructure/config/env.ts` — `DATABASE_URL`, `DATABASE_URL_TEST`.
- `package.json` — deps prisma + scripts.
- `Dockerfile` — `prisma generate` + entrypoint.
- Fixtures de teste: `tests/application/ConversationStateMachine.identity.test.ts`, `ConversationStateMachine.emission.test.ts`, `tests/acceptance/happyPath.test.ts`, `tests/application/HandleInboundMessage.test.ts`.

---

## Task 1: Entidades multi-tenant + portas novas + in-memory (aditivo)

Adiciona `Company`/`User`/`Membership`, suas portas e a impl in-memory delas. **Não toca em `Integration`** ainda — puramente aditivo, os 50 testes seguem verdes.

**Files:**
- Create: `src/domain/entities/Company.ts`, `src/domain/entities/User.ts`, `src/domain/entities/Membership.ts`
- Create: `src/infrastructure/persistence/Repositories.ts`
- Modify: `src/domain/ports/repositories.ts`
- Modify: `src/infrastructure/persistence/memory/InMemoryRepositories.ts`
- Test: `tests/infrastructure/persistence/newRepos.inmemory.test.ts`

**Interfaces:**
- Produces: entities `Company`, `User`, `Membership`; ports `ICompanyRepository { getById, save }`, `IUserRepository { getById, findByEmail, save }`, `IMembershipRepository { findByUserAndCompany, save }`; interface `Repositories` (bundle).

- [ ] **Step 1: Entidades**

`src/domain/entities/Company.ts`:
```ts
/** Empresa = o tenant. É o prestador (identidade fiscal mora aqui). */
export interface Company {
  id: string;
  name: string;
  fiscalDoc: string; // CNPJ/CPF do prestador
  fiscalName: string; // razão/nome do prestador
  fiscalProviderRef: string | null; // ref opaca ao backend fiscal; null = mock
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

`src/domain/entities/User.ts`:
```ts
/** Usuário do painel. Sem credenciais nesta fase (auth vem depois). */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}
```

`src/domain/entities/Membership.ts`:
```ts
/** Vínculo usuário↔empresa. MVP cria 1 por usuário; tabela extensível p/ time. */
export type MembershipRole = "owner";
export interface Membership {
  id: string;
  userId: string;
  companyId: string;
  role: MembershipRole;
  createdAt: Date;
}
```

- [ ] **Step 2: Portas** — adicionar ao final de `src/domain/ports/repositories.ts` (e os imports de tipo no topo):

```ts
import type { Company } from "../entities/Company";
import type { User } from "../entities/User";
import type { Membership } from "../entities/Membership";
```
```ts
export interface ICompanyRepository {
  getById(id: string): Promise<Company | null>;
  save(company: Company): Promise<void>;
}

export interface IUserRepository {
  getById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface IMembershipRepository {
  findByUserAndCompany(userId: string, companyId: string): Promise<Membership | null>;
  save(membership: Membership): Promise<void>;
}
```

- [ ] **Step 3: Bundle `Repositories`** — `src/infrastructure/persistence/Repositories.ts`:

```ts
import type {
  IAgentConfigRepository, ICompanyRepository, IContactRepository,
  IConversationRepository, IEmissionIntentRepository, IIntegrationRepository,
  IMembershipRepository, IServiceRepository, IUserRepository,
} from "../../domain/ports/repositories";

/** Conjunto de repositórios que o app consome (o factory devolve isto). */
export interface Repositories {
  companies: ICompanyRepository;
  users: IUserRepository;
  memberships: IMembershipRepository;
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  contacts: IContactRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  services: IServiceRepository;
}
```

- [ ] **Step 4: Failing test** — `tests/infrastructure/persistence/newRepos.inmemory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRepositories } from "../../../src/infrastructure/persistence/memory/InMemoryRepositories";

function company(id: string) {
  return { id, name: "X", fiscalDoc: "1", fiscalName: "X", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
}

describe("InMemoryRepositories — company/user/membership", () => {
  it("company: save + getById", async () => {
    const r = new InMemoryRepositories();
    await r.companies.save(company("c1"));
    expect((await r.companies.getById("c1"))?.name).toBe("X");
    expect(await r.companies.getById("nope")).toBeNull();
  });

  it("user: save + findByEmail (único)", async () => {
    const r = new InMemoryRepositories();
    await r.users.save({ id: "u1", name: "Ana", email: "a@x.com", createdAt: new Date(), updatedAt: new Date() });
    expect((await r.users.findByEmail("a@x.com"))?.id).toBe("u1");
    expect(await r.users.findByEmail("no@x.com")).toBeNull();
  });

  it("membership: save + findByUserAndCompany", async () => {
    const r = new InMemoryRepositories();
    await r.memberships.save({ id: "m1", userId: "u1", companyId: "c1", role: "owner", createdAt: new Date() });
    expect((await r.memberships.findByUserAndCompany("u1", "c1"))?.role).toBe("owner");
    expect(await r.memberships.findByUserAndCompany("u1", "c2")).toBeNull();
  });
});
```

- [ ] **Step 5: Run test — expect FAIL** (`companies`/`users`/`memberships` não existem):

Run: `npm test -- newRepos.inmemory`
Expected: FAIL (Property 'companies' does not exist / undefined).

- [ ] **Step 6: Implementar no InMemoryRepositories** — em `src/infrastructure/persistence/memory/InMemoryRepositories.ts`:

Adicionar imports de tipo (`Company`, `User`, `Membership`, `ICompanyRepository`, `IUserRepository`, `IMembershipRepository`, e o tipo `Repositories`), declarar a classe como `implements Repositories`, estender `SeedData`, e adicionar os arrays + objetos:

```ts
// novos campos privados:
private _companies: Company[] = [];
private _users: User[] = [];
private _memberships: Membership[] = [];

// estender SeedData:
interface SeedData {
  companies?: Company[];
  users?: User[];
  memberships?: Membership[];
  integrations?: Integration[];
  agentConfigs?: AgentConfig[];
  contacts?: Contact[];
  services?: Service[];
}

// no seed():
if (data.companies) this._companies.push(...data.companies);
if (data.users) this._users.push(...data.users);
if (data.memberships) this._memberships.push(...data.memberships);

// novos repositórios:
companies: ICompanyRepository = {
  getById: async (id) => this._companies.find((c) => c.id === id) ?? null,
  save: async (c) => {
    const i = this._companies.findIndex((x) => x.id === c.id);
    if (i >= 0) this._companies[i] = c; else this._companies.push(c);
  },
};

users: IUserRepository = {
  getById: async (id) => this._users.find((u) => u.id === id) ?? null,
  findByEmail: async (email) => this._users.find((u) => u.email === email) ?? null,
  save: async (u) => {
    const i = this._users.findIndex((x) => x.id === u.id);
    if (i >= 0) this._users[i] = u; else this._users.push(u);
  },
};

memberships: IMembershipRepository = {
  findByUserAndCompany: async (userId, companyId) =>
    this._memberships.find((m) => m.userId === userId && m.companyId === companyId) ?? null,
  save: async (m) => {
    const i = this._memberships.findIndex((x) => x.id === m.id);
    if (i >= 0) this._memberships[i] = m; else this._memberships.push(m);
  },
};
```
Declarar `export class InMemoryRepositories implements Repositories {` (importar `Repositories` de `../Repositories`).

- [ ] **Step 7: Run tests + typecheck — expect PASS**

Run: `npm test && npm run typecheck && npm run typecheck:test`
Expected: PASS (53 testes; os 50 anteriores + 3 novos).

- [ ] **Step 8: Commit**

```bash
git add src/domain/entities/Company.ts src/domain/entities/User.ts src/domain/entities/Membership.ts \
  src/domain/ports/repositories.ts src/infrastructure/persistence/Repositories.ts \
  src/infrastructure/persistence/memory/InMemoryRepositories.ts \
  tests/infrastructure/persistence/newRepos.inmemory.test.ts
git commit -m "feat: entidades Company/User/Membership + portas e repos in-memory (aditivo)"
```

---

## Task 2: Mover identidade fiscal Integration→Company (atômico)

`Integration` perde `fiscalDoc`/`fiscalName` e ganha `companyId`/`evolutionInstance`. A state machine passa a ler a identidade fiscal da **Company** (via `companies.getById(integration.companyId)`). Atualiza o seed do `main.ts` e **todas as fixtures de teste** no mesmo passo, pra suíte ficar verde.

**Files:**
- Modify: `src/domain/entities/Integration.ts`
- Modify: `src/application/agent/ConversationStateMachine.ts`
- Modify: `src/main.ts` (seed in-code)
- Modify: `tests/application/ConversationStateMachine.identity.test.ts`, `tests/application/ConversationStateMachine.emission.test.ts`, `tests/acceptance/happyPath.test.ts`, `tests/application/HandleInboundMessage.test.ts`
- Test: novo caso em `ConversationStateMachine.emission.test.ts` (ou identity) provando leitura da Company.

**Interfaces:**
- Consumes: `ICompanyRepository` (Task 1).
- Produces: `Integration` com `{ companyId, evolutionInstance }` (sem `fiscalDoc`/`fiscalName`); `StateMachineDeps` com `companies: ICompanyRepository`.

- [ ] **Step 1: Failing test** — adicionar em `tests/application/ConversationStateMachine.emission.test.ts` um caso que prova que o `expectedRecipientDoc` passado ao analyzer vem da **Company**, não da Integration. (O arquivo já monta deps; espelhe o padrão dele.) Caso:

```ts
it("usa o CNPJ da COMPANY (não da Integration) na conferência do comprovante", async () => {
  const repos = new InMemoryRepositories();
  // company com o CNPJ que deve aparecer na conferência
  await repos.companies.save({ id: "co1", name: "Consultorio", fiscalDoc: "66008326000173", fiscalName: "Consultorio", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() });
  const integration = { id: "int1", companyId: "co1", displayName: "x", whatsappNumber: "5511999990000", evolutionInstance: "Megus", active: true, createdAt: new Date(), updatedAt: new Date() };
  repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta", price: 180, issCode: "0107" }] });
  const contact = { id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "Joao", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() };
  await repos.contacts.save(contact);

  const analyze = vi.fn(async () => ({ amount: 180, payerName: "Joao", recipientDoc: "66008326000173", recipientMatches: true, confidence: 1, raw: "" }));
  const deps = baseDeps(repos); // baseDeps deve incluir companies: repos.companies
  deps.comprovante.analyze = analyze;

  const sm = new ConversationStateMachine(deps);
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await sm.advance(conv, agentConfig, integration as any, { providerMessageId: "m", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() });

  expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ expectedRecipientDoc: "66008326000173" }));
});
```

- [ ] **Step 2: Run — expect FAIL** (Integration ainda tem fiscalDoc; `baseDeps` sem `companies`; analyze recebe o doc da integration). 

Run: `npm test -- emission`
Expected: FAIL (typecheck/asserção).

- [ ] **Step 3: Reescrever `Integration`** — `src/domain/entities/Integration.ts`:

```ts
/**
 * Integração = o "Kaua" de uma empresa: o vínculo do número de WhatsApp a uma Company.
 * A identidade fiscal do prestador mora na Company (não aqui).
 */
export interface Integration {
  id: string;
  companyId: string;
  displayName: string;
  whatsappNumber: string; // E.164
  evolutionInstance: string; // nome da instância Evolution (hoje "Megus")
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 4: State machine lê a Company** — em `src/application/agent/ConversationStateMachine.ts`:

(a) `StateMachineDeps` ganha `companies: ICompanyRepository` (importar de `../../domain/ports/repositories`).

(b) No `processIdentity`, antes do `upsertCustomer`, resolver a empresa e usar `company.fiscalProviderRef`:
```ts
const company = await this.d.companies.getById(integration.companyId);
if (!company) { await this.handoff(conv, "empresa não encontrada"); return; }
// ...
await this.d.fiscal.upsertCustomer({
  integrationRef: company.fiscalProviderRef, name: fullName, cpf: cpf.digits, whatsapp: conv.whatsappNumber,
});
```

(c) No `handleComprovante`, resolver a empresa e usar `company.fiscalDoc`/`company.fiscalName`:
```ts
const company = await this.d.companies.getById(integration.companyId);
if (!company) { await this.handoff(conv, "empresa não encontrada"); return; }
const analysis = await this.d.comprovante.analyze({
  media: { mimetype: inbound.media.mimetype, base64: inbound.media.base64, url: inbound.media.url },
  expectedRecipientDoc: company.fiscalDoc, expectedRecipientName: company.fiscalName,
});
```

- [ ] **Step 5: Atualizar o seed in-code do `main.ts`** — em `src/main.ts`, o bloco `repos.seed({...})` passa a criar a Company e referenciá-la na Integration:

```ts
repos.seed({
  companies: [{
    id: "co-piloto", name: "Kapty (consultório)", fiscalDoc: "66008326000173",
    fiscalName: "Kapty (consultório)", fiscalProviderRef: null, active: true,
    createdAt: new Date(), updatedAt: new Date(),
  }],
  integrations: [{
    id: "int-piloto", companyId: "co-piloto", displayName: "Kapty (consultório)",
    whatsappNumber: env.PILOT_WHATSAPP_NUMBER ?? "5511999999999",
    evolutionInstance: env.EVOLUTION_INSTANCE, active: true,
    createdAt: new Date(), updatedAt: new Date(),
  }],
  agentConfigs: [/* inalterado */],
  services: [/* inalterado */],
});
```
E adicionar `companies: repos.companies,` nas deps do `new ConversationStateMachine({...})`.

- [ ] **Step 6: Atualizar fixtures de teste**

Em `ConversationStateMachine.identity.test.ts` e `ConversationStateMachine.emission.test.ts`: a função `baseDeps(repos)` ganha `companies: repos.companies,`. O objeto `integration` perde `fiscalDoc`/`fiscalName` e ganha `companyId: "int1"→companyId` e `evolutionInstance: "Megus"`. Em cada teste que precisa de identidade fiscal, semear a company correspondente (`repos.companies.save({ id: <companyId>, fiscalDoc: ..., fiscalName: ..., ... })`).

Em `tests/acceptance/happyPath.test.ts` e `tests/application/HandleInboundMessage.test.ts`: ajustar o `integration` (companyId + evolutionInstance, sem fiscalDoc/Name) e semear a company. Onde os deps da state machine são montados, incluir `companies`.

> Regra: qualquer fixture de `Integration` no projeto agora exige `companyId` + `evolutionInstance` e **não pode** ter `fiscalDoc`/`fiscalName`. Qualquer fluxo que chegue em comprovante/emissão exige uma `Company` semeada com o `id == integration.companyId`.

- [ ] **Step 7: Run tests + typecheck — expect PASS**

Run: `npm run typecheck && npm run typecheck:test && npm test`
Expected: PASS (o novo caso prova leitura via Company; suíte verde).

- [ ] **Step 8: Commit**

```bash
git add src/domain/entities/Integration.ts src/application/agent/ConversationStateMachine.ts src/main.ts tests/
git commit -m "refactor: identidade fiscal sobe de Integration para Company; state machine resolve via companies repo"
```

---

## Task 3: Scaffold Prisma (schema, client, deps, env, migration inicial)

Instala Prisma, escreve o `schema.prisma`, gera o client e autora a migration inicial contra um **SQL Server local (Docker)**. Sem mudar comportamento — o app continua in-memory (toggle entra na Task 4).

**Files:**
- Modify: `package.json`
- Create: `prisma/schema.prisma`, `src/infrastructure/persistence/prisma/client.ts`
- Modify: `src/infrastructure/config/env.ts`
- Create: `prisma/migrations/**` (gerado)

- [ ] **Step 1: Instalar deps**

Run: `npm i -D prisma && npm i @prisma/client`
Expected: instala; `package.json` ganha as deps.

- [ ] **Step 2: env** — em `src/infrastructure/config/env.ts`, no `schema = z.object({...})`:
```ts
  // Persistência. Vazio = repos in-memory (dev/teste). Formato Prisma sqlserver://
  DATABASE_URL: z.string().optional(),
  // Banco de testes (SQL Server local) para o contrato Prisma; vazio = só in-memory no CI
  DATABASE_URL_TEST: z.string().optional(),
```
(Se já existir `DATABASE_URL` legada, manter uma só.)

- [ ] **Step 3: `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

model Company {
  id                String        @id
  name              String
  fiscalDoc         String
  fiscalName        String
  fiscalProviderRef String?
  active            Boolean       @default(true)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  memberships       Membership[]
  integrations      Integration[]
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
  id                String           @id
  companyId         String
  displayName       String
  whatsappNumber    String
  evolutionInstance String
  active            Boolean          @default(true)
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  company           Company          @relation(fields: [companyId], references: [id])
  agentConfig       AgentConfig?
  services          Service[]
  contacts          Contact[]
  conversations     Conversation[]
  emissions         EmissionIntent[]
}

model AgentConfig {
  id                 String      @id
  integrationId      String      @unique
  name               String
  segment            String
  tone               String
  emojis             Boolean
  lang               String
  instructions       String      @db.NVarChar(Max)
  capabilitiesJson   String      @db.NVarChar(Max)
  knowledgeFilesJson String      @db.NVarChar(Max)
  fewShotDialogsJson String      @db.NVarChar(Max)
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  integration        Integration @relation(fields: [integrationId], references: [id])
}

model Service {
  id            String      @id
  integrationId String
  code          String
  description   String
  price         Float
  issCode       String
  integration   Integration @relation(fields: [integrationId], references: [id])
}

model Contact {
  id              String       @id
  integrationId   String
  whatsappNumber  String
  fullName        String?
  cpf             String?
  cpfNameVerified Boolean      @default(false)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  integration     Integration  @relation(fields: [integrationId], references: [id])
  @@index([integrationId, cpf])
  @@index([integrationId, whatsappNumber])
}

model Conversation {
  id             String      @id
  integrationId  String
  contactId      String
  whatsappNumber String
  state          String
  humanHandoff   Boolean     @default(false)
  lastInboundAt  DateTime
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  integration    Integration @relation(fields: [integrationId], references: [id])
  messages       Message[]
  @@index([integrationId, contactId])
}

model Message {
  id             String       @id
  conversationId String
  direction      String
  author         String
  kind           String
  body           String       @db.NVarChar(Max)
  mediaUrl       String?
  createdAt      DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  @@index([conversationId, createdAt])
}

model EmissionIntent {
  id                String      @id
  conversationId    String
  contactId         String
  integrationId     String
  status            String
  tomadorName       String
  tomadorCpf        String
  serviceId         String?
  description       String      @db.NVarChar(Max)
  amount            Float
  paymentVerified   Boolean
  paymentConfidence Float
  fiscalKey         String?
  pdfUrl            String?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  integration       Integration @relation(fields: [integrationId], references: [id])
}
```

- [ ] **Step 4: Client singleton** — `src/infrastructure/persistence/prisma/client.ts`:
```ts
import { PrismaClient } from "@prisma/client";

let _client: PrismaClient | null = null;

/** Singleton do PrismaClient (uma conexão por processo). */
export function prisma(url?: string): PrismaClient {
  if (!_client) {
    _client = url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
  }
  return _client;
}
```

- [ ] **Step 5: package.json scripts** — adicionar:
```json
"prisma:generate": "prisma generate",
"prisma:migrate": "prisma migrate dev",
"db:seed": "tsx prisma/seed.ts"
```

- [ ] **Step 6: Subir SQL Server local + gerar client + migration inicial**

```bash
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=Megus_Local_123" -p 1433:1433 -d --name megus-mssql mcr.microsoft.com/mssql/server:2022-latest
# cria o database de dev/test
docker exec megus-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "Megus_Local_123" -No -Q "CREATE DATABASE megus_dev"
export DATABASE_URL="sqlserver://localhost:1433;database=megus_dev;user=sa;password=Megus_Local_123;encrypt=true;trustServerCertificate=true"
npx prisma generate
npx prisma migrate dev --name init
```
Expected: `prisma generate` ok; `migrate dev` cria `prisma/migrations/<ts>_init/migration.sql` e aplica no banco local.

- [ ] **Step 7: typecheck + tests (ainda in-memory) — expect PASS**

Run: `npm run typecheck && npm run typecheck:test && npm test`
Expected: PASS (sem mudança de comportamento; client gerado compila).

- [ ] **Step 8: Commit** (a migration vai junto; `node_modules/.prisma` é gerado, não commitar):

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations \
  src/infrastructure/persistence/prisma/client.ts src/infrastructure/config/env.ts
git commit -m "build: scaffold Prisma (schema sqlserver, client, env, migration inicial)"
```

---

## Task 4: Repos Prisma + factory + toggle + teste de contrato

Implementa `PrismaRepositories` (todas as portas, com (de)serialização JSON), o `pilotSeed` compartilhado, o factory `createRepositories`, e liga o `main.ts` no factory. O teste de **contrato** roda contra in-memory (sempre) e Prisma (quando `DATABASE_URL_TEST`).

**Files:**
- Create: `src/infrastructure/persistence/pilotSeed.ts`, `src/infrastructure/persistence/createRepositories.ts`, `src/infrastructure/persistence/prisma/PrismaRepositories.ts`
- Modify: `src/main.ts`
- Test: `tests/infrastructure/persistence/repository-contract.test.ts`

**Interfaces:**
- Consumes: `Repositories` (Task 1), `prisma()` (Task 3).
- Produces: `createRepositories(env): Promise<Repositories>`; `pilotSeed(env): { company, integration, agentConfig, service, user, membership }`; `PrismaRepositories implements Repositories`.

- [ ] **Step 1: pilotSeed compartilhado** — `src/infrastructure/persistence/pilotSeed.ts`:
```ts
import type { Env } from "../config/env";
import type { Company } from "../../domain/entities/Company";
import type { User } from "../../domain/entities/User";
import type { Membership } from "../../domain/entities/Membership";
import type { Integration } from "../../domain/entities/Integration";
import type { AgentConfig } from "../../domain/entities/AgentConfig";
import type { Service } from "../../domain/entities/Service";

export interface PilotSeed {
  company: Company; user: User; membership: Membership;
  integration: Integration; agentConfig: AgentConfig; service: Service;
}

/** Dados do piloto (DRY entre seed in-memory e seed Prisma). IDs fixos = idempotência. */
export function pilotSeed(env: Env): PilotSeed {
  const now = new Date();
  return {
    company: { id: "co-piloto", name: "Kapty (consultório)", fiscalDoc: "66008326000173", fiscalName: "Kapty (consultório)", fiscalProviderRef: null, active: true, createdAt: now, updatedAt: now },
    user: { id: "user-piloto", name: "Piloto", email: "piloto@megus.local", createdAt: now, updatedAt: now },
    membership: { id: "mem-piloto", userId: "user-piloto", companyId: "co-piloto", role: "owner", createdAt: now },
    integration: { id: "int-piloto", companyId: "co-piloto", displayName: "Kapty (consultório)", whatsappNumber: env.PILOT_WHATSAPP_NUMBER ?? "5511999999999", evolutionInstance: env.EVOLUTION_INSTANCE, active: true, createdAt: now, updatedAt: now },
    agentConfig: { id: "ag-piloto", integrationId: "int-piloto", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "Você é o atendente do consultório. Seja cordial e ajude o paciente a emitir a nota fiscal após o pagamento.", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc-massagem"] }, knowledgeFiles: [], fewShotDialogs: [], createdAt: now, updatedAt: now },
    service: { id: "svc-massagem", integrationId: "int-piloto", code: "0107", description: "Massagem", price: 180, issCode: "0107" },
  };
}
```

- [ ] **Step 2: PrismaRepositories** — `src/infrastructure/persistence/prisma/PrismaRepositories.ts`. Implementa `Repositories`; helpers de mapping serializam/desserializam os campos JSON do AgentConfig.

```ts
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Repositories } from "../Repositories";
import type { AgentConfig, AgentCapabilities } from "../../../domain/entities/AgentConfig";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { ConversationState } from "../../../domain/entities/ConversationState";
import type { Message } from "../../../domain/entities/Message";
import { prisma } from "./client";

// ---- mapping AgentConfig (campos JSON viram String) ----
function agentToRow(a: AgentConfig) {
  return {
    id: a.id, integrationId: a.integrationId, name: a.name, segment: a.segment,
    tone: a.tone, emojis: a.emojis, lang: a.lang, instructions: a.instructions,
    capabilitiesJson: JSON.stringify(a.capabilities),
    knowledgeFilesJson: JSON.stringify(a.knowledgeFiles),
    fewShotDialogsJson: JSON.stringify(a.fewShotDialogs),
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}
function rowToAgent(r: any): AgentConfig {
  return {
    id: r.id, integrationId: r.integrationId, name: r.name, segment: r.segment,
    tone: r.tone, emojis: r.emojis, lang: r.lang, instructions: r.instructions,
    capabilities: JSON.parse(r.capabilitiesJson) as AgentCapabilities,
    knowledgeFiles: JSON.parse(r.knowledgeFilesJson) as string[],
    fewShotDialogs: JSON.parse(r.fewShotDialogsJson) as { q: string; a: string }[],
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export class PrismaRepositories implements Repositories {
  private db: PrismaClient;
  constructor(url?: string) { this.db = prisma(url); }

  companies = {
    getById: async (id: string) => this.db.company.findUnique({ where: { id } }),
    save: async (c: any) => { await this.db.company.upsert({ where: { id: c.id }, create: c, update: c }); },
  };

  users = {
    getById: async (id: string) => this.db.user.findUnique({ where: { id } }),
    findByEmail: async (email: string) => this.db.user.findUnique({ where: { email } }),
    save: async (u: any) => { await this.db.user.upsert({ where: { id: u.id }, create: u, update: u }); },
  };

  memberships = {
    findByUserAndCompany: async (userId: string, companyId: string) =>
      this.db.membership.findUnique({ where: { userId_companyId: { userId, companyId } } }) as any,
    save: async (m: any) => { await this.db.membership.upsert({ where: { id: m.id }, create: m, update: m }); },
  };

  integrations = {
    getByWhatsappNumber: async (n: string) => this.db.integration.findFirst({ where: { whatsappNumber: n } }),
    getById: async (id: string) => this.db.integration.findUnique({ where: { id } }),
  };

  agentConfigs = {
    getByIntegrationId: async (integrationId: string) => {
      const r = await this.db.agentConfig.findUnique({ where: { integrationId } });
      return r ? rowToAgent(r) : null;
    },
  };

  contacts = {
    findByCpf: async (integrationId: string, cpf: string) => this.db.contact.findFirst({ where: { integrationId, cpf } }),
    findByWhatsapp: async (integrationId: string, number: string) => this.db.contact.findFirst({ where: { integrationId, whatsappNumber: number } }),
    save: async (c: any) => { await this.db.contact.upsert({ where: { id: c.id }, create: c, update: c }); },
  };

  conversations = {
    getOrCreate: async (integrationId: string, contactId: string, number: string): Promise<Conversation> => {
      const found = await this.db.conversation.findFirst({ where: { integrationId, contactId } });
      if (found) return found as unknown as Conversation;
      const now = new Date();
      const conv = { id: randomUUID(), integrationId, contactId, whatsappNumber: number, state: "new", humanHandoff: false, lastInboundAt: now, createdAt: now, updatedAt: now };
      await this.db.conversation.create({ data: conv });
      return conv as unknown as Conversation;
    },
    findByWhatsappNumber: async (integrationId: string, number: string) =>
      this.db.conversation.findFirst({ where: { integrationId, whatsappNumber: number } }) as any,
    save: async (c: Conversation) => {
      const data = { ...c, state: c.state as unknown as string };
      await this.db.conversation.upsert({ where: { id: c.id }, create: data as any, update: data as any });
    },
    appendMessage: async (m: Message) => { await this.db.message.create({ data: m as any }); },
    getHistory: async (conversationId: string, limit: number): Promise<Message[]> => {
      const rows = await this.db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: limit * 4 });
      return rows.slice(-limit) as unknown as Message[];
    },
  };

  emissions = {
    save: async (e: any) => { await this.db.emissionIntent.upsert({ where: { id: e.id }, create: e, update: e }); },
    getById: async (id: string) => this.db.emissionIntent.findUnique({ where: { id } }) as any,
  };

  services = {
    getById: async (id: string) => this.db.service.findUnique({ where: { id } }),
    listByIntegration: async (integrationId: string) => this.db.service.findMany({ where: { integrationId } }),
  };

  agentConfigsSaveRow = agentToRow; // exposto p/ o seed (Task 5)
}
```
> Nota de tipagem: o `Conversation.state` é enum string (`ConversationState`); no banco é `String`. O cast `as unknown as Conversation` na leitura é aceitável aqui porque os valores do enum SÃO as strings persistidas. Onde o `noUncheckedIndexedAccess`/strict reclamar, anote os parâmetros com os tipos de domínio (`Company`, `User`, etc.) em vez de `any` — preferir tipos reais; `any` só nos pontos de mapping Prisma↔domínio acima.

- [ ] **Step 3: Factory** — `src/infrastructure/persistence/createRepositories.ts`:
```ts
import type { Env } from "../config/env";
import type { Repositories } from "./Repositories";
import { InMemoryRepositories } from "./memory/InMemoryRepositories";
import { pilotSeed } from "./pilotSeed";

/** Escolhe a persistência por DATABASE_URL. In-memory já vem semeado com o piloto. */
export async function createRepositories(env: Env): Promise<Repositories> {
  if (env.DATABASE_URL) {
    const { PrismaRepositories } = await import("./prisma/PrismaRepositories");
    return new PrismaRepositories(env.DATABASE_URL);
  }
  const repos = new InMemoryRepositories();
  const s = pilotSeed(env);
  repos.seed({
    companies: [s.company], users: [s.user], memberships: [s.membership],
    integrations: [s.integration], agentConfigs: [s.agentConfig], services: [s.service],
  });
  return repos;
}
```

- [ ] **Step 4: Ligar `main.ts` no factory** — em `src/main.ts`, substituir o bloco `const repos = new InMemoryRepositories(); repos.seed({...})` por:
```ts
const repos = await createRepositories(env);
```
Remover o import de `InMemoryRepositories` e o `repos.seed({...})` inteiro (agora vivem no factory/pilotSeed); importar `createRepositories`. As deps da state machine e do `HandleInboundMessage` continuam lendo `repos.contacts` etc. (a forma é a mesma). Adicionar `companies: repos.companies` se ainda não estiver (veio na Task 2).

- [ ] **Step 5: Teste de contrato (parametrizado)** — `tests/infrastructure/persistence/repository-contract.test.ts`:
```ts
import { describe, expect, it, beforeAll } from "vitest";
import { InMemoryRepositories } from "../../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { Repositories } from "../../../src/infrastructure/persistence/Repositories";

type Factory = { name: string; make: () => Promise<Repositories> };

const factories: Factory[] = [
  { name: "in-memory", make: async () => new InMemoryRepositories() },
];
if (process.env.DATABASE_URL_TEST) {
  factories.push({
    name: "prisma",
    make: async () => {
      const { PrismaRepositories } = await import("../../../src/infrastructure/persistence/prisma/PrismaRepositories");
      return new PrismaRepositories(process.env.DATABASE_URL_TEST);
    },
  });
}

for (const f of factories) {
  describe(`contrato de repositório (${f.name})`, () => {
    let r: Repositories;
    beforeAll(async () => { r = await f.make(); });

    it("escopo por tenant: contact de uma integração não vaza para outra", async () => {
      const co = { id: "C-"+f.name, name: "X", fiscalDoc: "1", fiscalName: "X", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
      await r.companies.save(co);
      await r.contacts.save({ id: "K1-"+f.name, integrationId: "intA-"+f.name, whatsappNumber: "551199", fullName: null, cpf: "111", cpfNameVerified: false, createdAt: new Date(), updatedAt: new Date() });
      expect(await r.contacts.findByCpf("intA-"+f.name, "111")).not.toBeNull();
      expect(await r.contacts.findByCpf("intB-"+f.name, "111")).toBeNull();
    });

    it("conversation getOrCreate é estável (mesmo contato → mesma conversa)", async () => {
      const a = await r.conversations.getOrCreate("intC-"+f.name, "ctC-"+f.name, "5599");
      const b = await r.conversations.getOrCreate("intC-"+f.name, "ctC-"+f.name, "5599");
      expect(a.id).toBe(b.id);
    });

    it("histórico devolve em ordem e respeita o limite", async () => {
      const conv = await r.conversations.getOrCreate("intD-"+f.name, "ctD-"+f.name, "5588");
      for (const body of ["a", "b", "c"]) {
        await r.conversations.appendMessage({ id: body+"-"+f.name, conversationId: conv.id, direction: "inbound", author: "contact", kind: "text", body, mediaUrl: null, createdAt: new Date() });
      }
      const hist = await r.conversations.getHistory(conv.id, 2);
      expect(hist.map((m) => m.body)).toEqual(["b", "c"]);
    });
  });
}
```
> Nota: as integrações `intA/intB...` não precisam existir como linha (sem FK enforcement no teste de contato/conversa do MVP) — se o Prisma reclamar de FK, semear uma Integration mínima por `integrationId` usado, sob a company `co`.

- [ ] **Step 6: Rodar contrato (in-memory) + suíte + opcional Prisma**

Run (CI/local, sem banco): `npm test`
Expected: PASS — o contrato roda na in-memory.

Opcional (validar Prisma localmente, com o container da Task 3 no ar):
```bash
export DATABASE_URL_TEST="sqlserver://localhost:1433;database=megus_dev;user=sa;password=Megus_Local_123;encrypt=true;trustServerCertificate=true"
npm test -- repository-contract
```
Expected: PASS nas duas factories (in-memory + prisma).

- [ ] **Step 7: typecheck + tests — expect PASS**

Run: `npm run typecheck && npm run typecheck:test && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/infrastructure/persistence/pilotSeed.ts src/infrastructure/persistence/createRepositories.ts \
  src/infrastructure/persistence/prisma/PrismaRepositories.ts src/main.ts \
  tests/infrastructure/persistence/repository-contract.test.ts
git commit -m "feat: repos Prisma + factory createRepositories (toggle DATABASE_URL) + contrato de repositório"
```

---

## Task 5: Seed Prisma idempotente

Script de seed que faz **upsert** do `pilotSeed` no banco (rodado no deploy). Teste de idempotência: rodar 2x não duplica.

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (campo `prisma.seed`)
- Test: `tests/infrastructure/persistence/seed-idempotency.test.ts`

**Interfaces:**
- Consumes: `pilotSeed` (Task 4), `prisma()` (Task 3), `agentToRow` mapping (replicado no seed).

- [ ] **Step 1: `prisma/seed.ts`**
```ts
import { env } from "../src/infrastructure/config/env";
import { prisma } from "../src/infrastructure/persistence/prisma/client";
import { pilotSeed } from "../src/infrastructure/persistence/pilotSeed";

async function main() {
  const db = prisma(env.DATABASE_URL);
  const s = pilotSeed(env);

  await db.company.upsert({ where: { id: s.company.id }, create: s.company, update: s.company });
  await db.user.upsert({ where: { id: s.user.id }, create: s.user, update: s.user });
  await db.membership.upsert({ where: { id: s.membership.id }, create: s.membership, update: s.membership });
  await db.integration.upsert({ where: { id: s.integration.id }, create: s.integration, update: s.integration });

  const a = s.agentConfig;
  const agentRow = {
    id: a.id, integrationId: a.integrationId, name: a.name, segment: a.segment, tone: a.tone,
    emojis: a.emojis, lang: a.lang, instructions: a.instructions,
    capabilitiesJson: JSON.stringify(a.capabilities),
    knowledgeFilesJson: JSON.stringify(a.knowledgeFiles),
    fewShotDialogsJson: JSON.stringify(a.fewShotDialogs),
    createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
  await db.agentConfig.upsert({ where: { id: a.id }, create: agentRow, update: agentRow });
  await db.service.upsert({ where: { id: s.service.id }, create: s.service, update: s.service });

  console.log("[seed] piloto upsert ok");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: package.json** — adicionar o bloco de seed do Prisma:
```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 3: Failing test (idempotência)** — `tests/infrastructure/persistence/seed-idempotency.test.ts`. Roda **só quando `DATABASE_URL_TEST`**; senão, skip:
```ts
import { describe, expect, it } from "vitest";

const RUN = !!process.env.DATABASE_URL_TEST;
describe.runIf(RUN)("seed idempotente (Prisma)", () => {
  it("rodar o seed 2x não duplica a Company do piloto", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST! } } });
    const seedOnce = async () => {
      const { pilotSeed } = await import("../../../src/infrastructure/persistence/pilotSeed");
      const { env } = await import("../../../src/infrastructure/config/env");
      const s = pilotSeed(env);
      await db.company.upsert({ where: { id: s.company.id }, create: s.company, update: s.company });
    };
    await seedOnce(); await seedOnce();
    const count = await db.company.count({ where: { id: "co-piloto" } });
    expect(count).toBe(1);
    await db.$disconnect();
  });
});
```

- [ ] **Step 4: Rodar (com banco local)**
```bash
export DATABASE_URL="sqlserver://localhost:1433;database=megus_dev;user=sa;password=Megus_Local_123;encrypt=true;trustServerCertificate=true"
export DATABASE_URL_TEST="$DATABASE_URL"
npx prisma migrate deploy
npx tsx prisma/seed.ts && npx tsx prisma/seed.ts   # 2x, sem erro/duplicação
npm test -- seed-idempotency
```
Expected: seed roda 2x sem erro; teste PASS (count == 1).

- [ ] **Step 5: Suíte sem banco — expect PASS (teste de seed skipado)**

Run: `npm test`
Expected: PASS (o teste de idempotência é skipado sem `DATABASE_URL_TEST`).

- [ ] **Step 6: Commit**
```bash
git add prisma/seed.ts package.json tests/infrastructure/persistence/seed-idempotency.test.ts
git commit -m "feat: seed Prisma idempotente do piloto + teste de idempotência"
```

---

## Task 6: Deploy — Dockerfile, entrypoint (migrate+seed), compose

Build da imagem com `prisma generate`; no start, se `DATABASE_URL` existir, roda `migrate deploy` + seed antes de subir o app. Validado pelo build local + smoke de deploy (spec §3/§4).

**Files:**
- Modify: `Dockerfile`
- Create: `docker-entrypoint.sh`
- Modify: `.dockerignore` (não excluir `prisma/`)

- [ ] **Step 1: `docker-entrypoint.sh`**
```sh
#!/bin/sh
set -e
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL presente — migrate deploy + seed"
  npx prisma migrate deploy
  npx tsx prisma/seed.ts
else
  echo "[entrypoint] sem DATABASE_URL — modo in-memory"
fi
exec npx tsx src/main.ts
```

- [ ] **Step 2: `Dockerfile`** — substituir o conteúdo por:
```dockerfile
FROM node:22-slim
WORKDIR /app

# Prisma precisa de openssl no runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Deps + schema primeiro (cache) — generate precisa do schema
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

# Código
COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
```

- [ ] **Step 3: `.dockerignore`** — garantir que **não** ignora `prisma/` (manter `node_modules`, `.git`, `.env`, `dist`, `*.log`, `.superpowers` ignorados; **não** adicionar `prisma`).

- [ ] **Step 4: Build local — expect SUCCESS**

Run: `docker build -t megus-app-test .`
Expected: build conclui; `prisma generate` roda no build.

- [ ] **Step 5: Smoke do entrypoint sem banco (in-memory)**

Run: `docker run --rm -e MESSAGING_PROVIDER=none -e OPENAI_API_KEY=sk-x -p 3001:3000 megus-app-test &` ; depois `curl -s localhost:3001/health`
Expected: log "sem DATABASE_URL — modo in-memory" e depois "Megus AI no ar"; `/health` → `{"status":"ok"}`. (Encerrar o container após.)

- [ ] **Step 6: Commit**
```bash
git add Dockerfile docker-entrypoint.sh .dockerignore
git commit -m "build: Dockerfile com prisma generate + entrypoint (migrate deploy + seed quando DATABASE_URL)"
```

- [ ] **Step 7: Cutover em produção (manual, com Pietro — fora do CI)**

No VPS, em `/opt/megus`: adicionar `DATABASE_URL` (Azure SQL, formato Prisma) ao `.env`; adicionar a env `DATABASE_URL=${DATABASE_URL}` ao serviço `megus-app` no `docker-compose.yml`; `docker compose up -d --build megus-app`. O entrypoint roda migrate + seed; o app sobe lendo do banco. Validar com zap de teste + logs (resolve via banco). **Rollback:** esvaziar `DATABASE_URL` → volta in-memory.

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:** §1 modelo → Tasks 1–2; §2 persistência (Prisma, repos, toggle, seed, migrations) → Tasks 3–5; §3 cutover+deploy → Task 6; §4 testes (contrato parametrizado, seed idempotente, smoke, 50 testes seguem) → Tasks 1/4/5/6. Critérios de aceite cobertos: persistir+resolver por número (Task 6 cutover), escopo por tenant (contrato, Task 4), restart não zera (Task 6), toggle vazio→in-memory verde (Task 4/6), fiscal via Company (Task 2). Fora-de-escopo respeitado (sem auth/UI/provisionamento Evolution/dashboard).

**Placeholder scan:** sem "TBD/TODO"; todo passo tem código/comando concreto.

**Type consistency:** `Repositories` (Task 1) reusado em InMemory/Prisma/factory/contrato; `pilotSeed`→entidades reais; portas novas com assinaturas idênticas entre Tasks 1/4/5; `ConversationState` (enum string) mapeado como `String` no Prisma com cast nos pontos de mapping.
