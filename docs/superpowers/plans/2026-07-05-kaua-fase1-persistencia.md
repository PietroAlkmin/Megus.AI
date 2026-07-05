# Kaua — Fase 0 (Harness) + Fase 1 (Persistência) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer conversas, contatos, emissões, integrações, agente e serviços do Megus persistirem no Azure SQL (Prisma) escopados por empresa, sobrevivendo a restart — sem tocar no ato fiscal.

**Architecture:** Implementar as portas de repositório existentes (`src/domain/ports/repositories.ts`) com adapters Prisma, seguindo o padrão já provado em `PrismaCompanyServiceRepository`/`PrismaUserRepository` (mapeamento `toDomain` inline, `WHERE` sempre escopado por `integrationId`/`companyId`). Reconciliar o drift entidade↔schema (a entidade `Integration` tem `fiscalDoc/fiscalName/fiscalProviderRef` que no banco vivem em `Company`) via JOIN. Semear o piloto no banco no boot (idempotente). Trocar **todos** os repos para Prisma em `main.ts` quando houver `DATABASE_URL`.

**Tech Stack:** Node 20 + TypeScript (ESM), Prisma 6.19 (`@prisma/client`) sobre SQL Server (Azure), Express, Vitest, tsx.

## Global Constraints

- **Ato fiscal intocado.** Este plano NÃO altera `ConversationStateMachine.ts` (portões `:99-101`, `:165-166`, `:188`) nem os providers fiscal/CPF/comprovante. Só troca a camada de persistência atrás das portas.
- **Multi-tenant SEMPRE.** Todo método de leitura/escrita filtra por `integrationId` (ou por `companyId` via Integration). Nenhuma query sem escopo de tenant. Padrão de posse: `PrismaCompanyServiceRepository.getById` (`:54-61`).
- **Sem migração de schema nesta fase.** Todas as tabelas/colunas já existem em `prisma/schema.prisma` (Contact, Conversation, Message, EmissionIntent, AgentConfig, Service, Integration, Company). O campo novo `Conversation.summary` é da Fase 7 — **não** entra aqui.
- **App não auto-migra.** Nenhum `.migrate()`/`EnsureCreated`. Persistência liga só por `DATABASE_URL` presente; sem ela, in-memory (dev/teste).
- **Prisma model↔entidade:** a entidade `Integration` NÃO tem `companyId` (é interno do repo); `EmissionIntent` do domínio não tem `appointmentAt/paidAt/chargeSentAt/notaNumber` (colunas extras do schema → default null no create); `state` de `Conversation` e `status` de `EmissionIntent` são string no banco.
- **Ambiente de teste de DB:** o sandbox do Claude NÃO alcança o Azure SQL (firewall por-IP). Os testes de contrato rodam **verdes no sandbox contra o `InMemoryRepositories`**; a validação Prisma real (round-trip, IDOR, survives-restart) roda **na máquina do Pietro ou no VPS** (IPs liberados). Cada passo diz onde executa.
- **Nomes de coluna alinhados ao Azure** (já no schema): `Service{code,description,issCode,price}`, `Company{fiscalDoc,fiscalName,fiscalProviderRef}`, `AgentConfig{capabilitiesJson,knowledgeFilesJson,fewShotDialogsJson}`.

---

## File Structure

- Create: `src/infrastructure/persistence/prisma/PrismaContactRepository.ts` — IContactRepository sobre tabela Contact.
- Create: `src/infrastructure/persistence/prisma/PrismaServiceRepository.ts` — IServiceRepository sobre tabela Service.
- Create: `src/infrastructure/persistence/prisma/PrismaConversationRepository.ts` — IConversationRepository (Conversation + Message).
- Create: `src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository.ts` — IEmissionIntentRepository sobre EmissionIntent.
- Create: `src/infrastructure/persistence/prisma/PrismaAgentConfigRepository.ts` — IAgentConfigRepository (parse dos campos *Json).
- Create: `src/infrastructure/persistence/prisma/PrismaIntegrationRepository.ts` — IIntegrationRepository (JOIN Company p/ fiscal*).
- Create: `src/infrastructure/persistence/seedPilot.ts` — semeia Integration+Company+AgentConfig+Service do piloto no banco (idempotente).
- Create: `tests/repositoryContract.ts` — suíte de contrato reusável (roda contra qualquer implementação das portas).
- Create: `tests/inMemoryRepositories.contract.test.ts` — roda o contrato contra `InMemoryRepositories` (verde no sandbox).
- Create: `tests/prismaMappers.test.ts` — testa os mapeadores puros (drift Integration↔Company, parse *Json).
- Create: `src/infrastructure/persistence/prisma/mappers.ts` — funções puras `integrationToDomain`, `agentConfigToDomain` (testáveis sem DB).
- Modify: `src/main.ts:106-113` — trocar TODOS os repos para Prisma quando `DATABASE_URL`; chamar `seedPilot` no boot.
- Reference (não modificar): `src/domain/ports/repositories.ts`, `prisma/schema.prisma`, `src/infrastructure/persistence/memory/InMemoryRepositories.ts`.

---

### Task 0: Harness de teste local (Fase 0)

Sobe o app em modo console (sem WhatsApp) e prova a conversa ponta-a-ponta via `/dev/inbound`, base para validar tudo o que vem depois.

**Files:**
- Reference: `.env` (local), `src/main.ts:179-191` (`onDevInbound`), `src/infrastructure/http/server.ts:67`.

- [ ] **Step 1: Garantir `.env` de harness** — conferir que o `.env` local tem: `MESSAGING_PROVIDER=none`, `DATABASE_URL=` VAZIO (in-memory), `FISCAL_PROVIDER=mock`, `CPF_PROVIDER=mock`, `COMPROVANTE_PROVIDER=mock`, `OPENAI_API_KEY=<real>`, `PILOT_WHATSAPP_NUMBER=5511999999999`. (In-memory nesta primeira subida isola o harness de qualquer efeito no banco real.)

- [ ] **Step 2: Subir o app** — Run: `npm run dev` — Expected: log `Megus AI no ar — webhook /webhook/evolution, dev /dev/inbound, QR /qr` e `[persistência] tudo in-memory (sem DATABASE_URL)`.

- [ ] **Step 3: Mandar uma mensagem de teste** — Run (o número seed é `5511999999999`):
```bash
curl -s -X POST http://localhost:3000/dev/inbound -H "Content-Type: application/json" \
  -d '{"from":"5511988887777","to":"5511999999999","kind":"text","text":"oi, quero uma nota fiscal"}'
```
Expected: no console do `npm run dev`, o `LogMessagingProvider` loga a resposta do Kaua (uma bolha de texto pedindo nome+CPF). Isso confirma o loop inbound→brain→resposta sem WhatsApp.

- [ ] **Step 4: Commit** (só se algo do `.env.example`/doc mudou; código não muda nesta task) — pular se nada mudou no versionado.

---

### Task 1: Mapeadores puros (drift Integration↔Company e parse *Json)

Isola a lógica que dá pra testar SEM banco: reconstruir a entidade `Integration` a partir das linhas Integration+Company, e desserializar os campos `*Json` do `AgentConfig`. Repos Prisma só chamam esses mapeadores.

**Files:**
- Create: `src/infrastructure/persistence/prisma/mappers.ts`
- Test: `tests/prismaMappers.test.ts`

**Interfaces:**
- Produces: `integrationToDomain(integ, company): Integration` e `agentConfigToDomain(row): AgentConfig` (consumidos por PrismaIntegrationRepository / PrismaAgentConfigRepository).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/prismaMappers.test.ts
import { describe, it, expect } from "vitest";
import { integrationToDomain, agentConfigToDomain } from "../src/infrastructure/persistence/prisma/mappers";

describe("integrationToDomain", () => {
  it("reconstrói fiscalDoc/fiscalName/fiscalProviderRef a partir da Company (drift)", () => {
    const integ = { id: "int1", displayName: "Consultório", whatsappNumber: "5512997843384", active: true, createdAt: new Date(0), updatedAt: new Date(0) };
    const company = { fiscalDoc: "66008326000173", fiscalName: "Clinica X", fiscalProviderRef: null };
    const out = integrationToDomain(integ, company);
    expect(out).toEqual({
      id: "int1", displayName: "Consultório", whatsappNumber: "5512997843384",
      fiscalDoc: "66008326000173", fiscalName: "Clinica X", fiscalProviderRef: null,
      active: true, createdAt: new Date(0), updatedAt: new Date(0),
    });
  });
});

describe("agentConfigToDomain", () => {
  it("desserializa os campos *Json em objetos", () => {
    const row = {
      id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude",
      tone: "equilibrado", emojis: true, lang: "pt", instructions: "Seja cordial.",
      capabilitiesJson: JSON.stringify({ chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] }),
      knowledgeFilesJson: JSON.stringify([]),
      fewShotDialogsJson: JSON.stringify([{ q: "oi", a: "olá!" }]),
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    const out = agentConfigToDomain(row);
    expect(out.capabilities.linkedServiceIds).toEqual(["svc1"]);
    expect(out.fewShotDialogs).toEqual([{ q: "oi", a: "olá!" }]);
    expect(out.knowledgeFiles).toEqual([]);
    expect(out.name).toBe("Kaua");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm test -- prismaMappers` — Expected: FAIL ("Cannot find module .../mappers").

- [ ] **Step 3: Implementar os mapeadores**

```ts
// src/infrastructure/persistence/prisma/mappers.ts
import type { Integration } from "../../../domain/entities/Integration";
import type { AgentConfig, AgentCapabilities } from "../../../domain/entities/AgentConfig";

export function integrationToDomain(
  integ: { id: string; displayName: string; whatsappNumber: string; active: boolean; createdAt: Date; updatedAt: Date },
  company: { fiscalDoc: string; fiscalName: string; fiscalProviderRef: string | null },
): Integration {
  return {
    id: integ.id,
    displayName: integ.displayName,
    whatsappNumber: integ.whatsappNumber,
    fiscalDoc: company.fiscalDoc,
    fiscalName: company.fiscalName,
    fiscalProviderRef: company.fiscalProviderRef ?? null,
    active: integ.active,
    createdAt: integ.createdAt,
    updatedAt: integ.updatedAt,
  };
}

export function agentConfigToDomain(row: {
  id: string; integrationId: string; name: string; segment: string; tone: string;
  emojis: boolean; lang: string; instructions: string;
  capabilitiesJson: string; knowledgeFilesJson: string; fewShotDialogsJson: string;
  createdAt: Date; updatedAt: Date;
}): AgentConfig {
  return {
    id: row.id,
    integrationId: row.integrationId,
    name: row.name,
    segment: row.segment,
    tone: row.tone as AgentConfig["tone"],
    emojis: row.emojis,
    lang: row.lang as AgentConfig["lang"],
    instructions: row.instructions,
    capabilities: JSON.parse(row.capabilitiesJson) as AgentCapabilities,
    knowledgeFiles: JSON.parse(row.knowledgeFilesJson) as string[],
    fewShotDialogs: JSON.parse(row.fewShotDialogsJson) as { q: string; a: string }[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 4: Rodar e ver passar** — Run: `npm test -- prismaMappers` — Expected: PASS (2 testes).

- [ ] **Step 5: Commit**
```bash
git add src/infrastructure/persistence/prisma/mappers.ts tests/prismaMappers.test.ts
git commit -m "feat(persist): mapeadores puros Integration<-Company e AgentConfig *Json"
```

---

### Task 2: Suíte de contrato de repositórios (roda no sandbox via in-memory)

Uma suíte que qualquer implementação das portas tem que passar — prova o round-trip e o **isolamento de tenant (IDOR)**. Roda verde contra `InMemoryRepositories` no sandbox; depois é reusada contra Prisma no banco do Pietro (Task 8).

**Files:**
- Create: `tests/repositoryContract.ts` (factory, não é `.test.ts`)
- Create: `tests/inMemoryRepositories.contract.test.ts`

**Interfaces:**
- Produces: `runRepositoryContract(makeRepos: () => Promise<ReposBundle>)` onde `ReposBundle = { contacts, conversations, emissions, services }` (as portas de `repositories.ts`). Consumido pelo teste in-memory e (Task 8) pelo teste Prisma.

- [ ] **Step 1: Escrever a suíte de contrato + o teste in-memory (que falha)**

```ts
// tests/repositoryContract.ts
import { expect } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  IContactRepository, IConversationRepository, IEmissionIntentRepository, IServiceRepository,
} from "../src/domain/ports/repositories";
import { ConversationState } from "../src/domain/entities/ConversationState";

export interface ReposBundle {
  contacts: IContactRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  services: IServiceRepository;
}

// Reusável: recebe uma função que devolve um bundle LIMPO por chamada.
export async function assertRepositoryContract(repos: ReposBundle): Promise<void> {
  const A = "intA_" + randomUUID().slice(0, 6);
  const B = "intB_" + randomUUID().slice(0, 6);
  const now = new Date();

  // Contact round-trip + IDOR
  const cA = { id: randomUUID(), integrationId: A, whatsappNumber: "551111", fullName: "Ana", cpf: "11111111111", cpfNameVerified: true, createdAt: now, updatedAt: now };
  await repos.contacts.save(cA);
  expect((await repos.contacts.findByCpf(A, "11111111111"))?.fullName).toBe("Ana");
  // tenant B NÃO enxerga o contato de A (IDOR)
  expect(await repos.contacts.findByCpf(B, "11111111111")).toBeNull();
  expect(await repos.contacts.findByWhatsapp(B, "551111")).toBeNull();

  // Conversation + Message round-trip + IDOR
  const conv = await repos.conversations.getOrCreate(A, cA.id, "551111");
  expect(conv.state).toBe(ConversationState.New);
  await repos.conversations.appendMessage({ id: randomUUID(), conversationId: conv.id, direction: "inbound", author: "contact", kind: "text", body: "oi", mediaUrl: null, createdAt: new Date() });
  await repos.conversations.appendMessage({ id: randomUUID(), conversationId: conv.id, direction: "outbound", author: "agent", kind: "text", body: "olá!", mediaUrl: null, createdAt: new Date(Date.now() + 1) });
  const hist = await repos.conversations.getHistory(conv.id, 20);
  expect(hist.map((m) => m.body)).toEqual(["oi", "olá!"]); // ordem cronológica
  expect(await repos.conversations.findByWhatsappNumber(B, "551111")).toBeNull(); // IDOR

  // EmissionIntent round-trip
  const intentId = randomUUID();
  await repos.emissions.save({ id: intentId, conversationId: conv.id, contactId: cA.id, integrationId: A, status: "ready", tomadorName: "Ana", tomadorCpf: "11111111111", serviceId: null, description: "Massagem", amount: 180, paymentVerified: true, paymentConfidence: 1, fiscalKey: null, pdfUrl: null, createdAt: now, updatedAt: now });
  expect((await repos.emissions.getById(intentId))?.status).toBe("ready");
}
```

```ts
// tests/inMemoryRepositories.contract.test.ts
import { describe, it } from "vitest";
import { InMemoryRepositories } from "../src/infrastructure/persistence/memory/InMemoryRepositories";
import { assertRepositoryContract } from "./repositoryContract";

describe("InMemoryRepositories — contrato", () => {
  it("cumpre o contrato (round-trip + IDOR)", async () => {
    const r = new InMemoryRepositories();
    await assertRepositoryContract({ contacts: r.contacts, conversations: r.conversations, emissions: r.emissions, services: r.services });
  });
});
```

- [ ] **Step 2: Rodar e ver passar (in-memory já cumpre)** — Run: `npm test -- contract` — Expected: PASS. *(Se falhar, o bug está no teste ou numa suposição errada sobre o in-memory — corrigir o teste antes de seguir, pois ele é o gabarito do Prisma.)*

- [ ] **Step 3: Commit**
```bash
git add tests/repositoryContract.ts tests/inMemoryRepositories.contract.test.ts
git commit -m "test(persist): suite de contrato de repositorios (round-trip + IDOR) verde no in-memory"
```

---

### Task 3: PrismaContactRepository

**Files:**
- Create: `src/infrastructure/persistence/prisma/PrismaContactRepository.ts`

**Interfaces:**
- Consumes: `prisma` (`./client`), `IContactRepository`, `Contact`.
- Produces: `class PrismaContactRepository implements IContactRepository`.

- [ ] **Step 1: Implementar**

```ts
// src/infrastructure/persistence/prisma/PrismaContactRepository.ts
import { prisma } from "./client";
import type { IContactRepository } from "../../../domain/ports/repositories";
import type { Contact } from "../../../domain/entities/Contact";

function toDomain(r: { id: string; integrationId: string; whatsappNumber: string; fullName: string | null; cpf: string | null; cpfNameVerified: boolean; createdAt: Date; updatedAt: Date }): Contact {
  return { id: r.id, integrationId: r.integrationId, whatsappNumber: r.whatsappNumber, fullName: r.fullName, cpf: r.cpf, cpfNameVerified: r.cpfNameVerified, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

export class PrismaContactRepository implements IContactRepository {
  async findByCpf(integrationId: string, cpfDigits: string): Promise<Contact | null> {
    const r = await prisma.contact.findFirst({ where: { integrationId, cpf: cpfDigits } });
    return r ? toDomain(r) : null;
  }
  async findByWhatsapp(integrationId: string, number: string): Promise<Contact | null> {
    const r = await prisma.contact.findFirst({ where: { integrationId, whatsappNumber: number } });
    return r ? toDomain(r) : null;
  }
  async save(contact: Contact): Promise<void> {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: { fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, updatedAt: contact.updatedAt },
      create: { id: contact.id, integrationId: contact.integrationId, whatsappNumber: contact.whatsappNumber, fullName: contact.fullName, cpf: contact.cpf, cpfNameVerified: contact.cpfNameVerified, createdAt: contact.createdAt, updatedAt: contact.updatedAt },
    });
  }
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros novos neste arquivo.

- [ ] **Step 3: Commit**
```bash
git add src/infrastructure/persistence/prisma/PrismaContactRepository.ts
git commit -m "feat(persist): PrismaContactRepository escopado por integrationId"
```

---

### Task 4: PrismaServiceRepository

**Files:**
- Create: `src/infrastructure/persistence/prisma/PrismaServiceRepository.ts`

**Interfaces:**
- Produces: `class PrismaServiceRepository implements IServiceRepository`.

- [ ] **Step 1: Implementar**

```ts
// src/infrastructure/persistence/prisma/PrismaServiceRepository.ts
import { prisma } from "./client";
import type { IServiceRepository } from "../../../domain/ports/repositories";
import type { Service } from "../../../domain/entities/Service";

function toDomain(r: { id: string; integrationId: string; code: string; description: string; price: number; issCode: string }): Service {
  return { id: r.id, integrationId: r.integrationId, code: r.code, description: r.description, price: r.price, issCode: r.issCode };
}

export class PrismaServiceRepository implements IServiceRepository {
  async getById(id: string): Promise<Service | null> {
    const r = await prisma.service.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }
  async listByIntegration(integrationId: string): Promise<Service[]> {
    const rows = await prisma.service.findMany({ where: { integrationId } });
    return rows.map(toDomain);
  }
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros novos.

- [ ] **Step 3: Commit**
```bash
git add src/infrastructure/persistence/prisma/PrismaServiceRepository.ts
git commit -m "feat(persist): PrismaServiceRepository"
```

---

### Task 5: PrismaConversationRepository (Conversation + Message)

**Files:**
- Create: `src/infrastructure/persistence/prisma/PrismaConversationRepository.ts`

**Interfaces:**
- Produces: `class PrismaConversationRepository implements IConversationRepository`.

**Nota de ordenação:** `getHistory` deve devolver as ÚLTIMAS `limit` mensagens em ordem CRONOLÓGICA (igual ao in-memory `slice(-limit)`). No SQL: `orderBy [{createdAt:desc},{id:desc}]`, `take: limit`, e `.reverse()` no resultado.

- [ ] **Step 1: Implementar**

```ts
// src/infrastructure/persistence/prisma/PrismaConversationRepository.ts
import { randomUUID } from "node:crypto";
import { prisma } from "./client";
import type { IConversationRepository } from "../../../domain/ports/repositories";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { Message } from "../../../domain/entities/Message";
import { ConversationState } from "../../../domain/entities/ConversationState";

function convToDomain(r: { id: string; integrationId: string; contactId: string; whatsappNumber: string; state: string; humanHandoff: boolean; lastInboundAt: Date; createdAt: Date; updatedAt: Date }): Conversation {
  return { id: r.id, integrationId: r.integrationId, contactId: r.contactId, whatsappNumber: r.whatsappNumber, state: r.state as ConversationState, humanHandoff: r.humanHandoff, lastInboundAt: r.lastInboundAt, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
function msgToDomain(r: { id: string; conversationId: string; direction: string; author: string; kind: string; body: string; mediaUrl: string | null; createdAt: Date }): Message {
  return { id: r.id, conversationId: r.conversationId, direction: r.direction as Message["direction"], author: r.author as Message["author"], kind: r.kind as Message["kind"], body: r.body, mediaUrl: r.mediaUrl, createdAt: r.createdAt };
}

export class PrismaConversationRepository implements IConversationRepository {
  async getOrCreate(integrationId: string, contactId: string, number: string): Promise<Conversation> {
    const existing = await prisma.conversation.findFirst({ where: { integrationId, contactId } });
    if (existing) return convToDomain(existing);
    const now = new Date();
    const created = await prisma.conversation.create({
      data: { id: randomUUID(), integrationId, contactId, whatsappNumber: number, state: ConversationState.New, humanHandoff: false, lastInboundAt: now, createdAt: now, updatedAt: now },
    });
    return convToDomain(created);
  }
  async findByWhatsappNumber(integrationId: string, number: string): Promise<Conversation | null> {
    const r = await prisma.conversation.findFirst({ where: { integrationId, whatsappNumber: number } });
    return r ? convToDomain(r) : null;
  }
  async save(conv: Conversation): Promise<void> {
    await prisma.conversation.upsert({
      where: { id: conv.id },
      update: { state: conv.state, humanHandoff: conv.humanHandoff, contactId: conv.contactId, lastInboundAt: conv.lastInboundAt, updatedAt: new Date() },
      create: { id: conv.id, integrationId: conv.integrationId, contactId: conv.contactId, whatsappNumber: conv.whatsappNumber, state: conv.state, humanHandoff: conv.humanHandoff, lastInboundAt: conv.lastInboundAt, createdAt: conv.createdAt, updatedAt: conv.updatedAt },
    });
  }
  async appendMessage(m: Message): Promise<void> {
    await prisma.message.create({ data: { id: m.id, conversationId: m.conversationId, direction: m.direction, author: m.author, kind: m.kind, body: m.body, mediaUrl: m.mediaUrl, createdAt: m.createdAt } });
  }
  async getHistory(conversationId: string, limit: number): Promise<Message[]> {
    const rows = await prisma.message.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit });
    return rows.reverse().map(msgToDomain);
  }
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros novos.

- [ ] **Step 3: Commit**
```bash
git add src/infrastructure/persistence/prisma/PrismaConversationRepository.ts
git commit -m "feat(persist): PrismaConversationRepository (Conversation + Message, historico cronologico)"
```

---

### Task 6: PrismaEmissionIntentRepository

**Files:**
- Create: `src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository.ts`

**Interfaces:**
- Produces: `class PrismaEmissionIntentRepository implements IEmissionIntentRepository`.

**Nota:** o schema tem colunas extras nullable (`appointmentAt/paidAt/chargeSentAt/notaNumber`) que a entidade não tem → no `create`, não setar (o Prisma deixa null). `status` e `serviceId` seguem o domínio.

- [ ] **Step 1: Implementar**

```ts
// src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository.ts
import { prisma } from "./client";
import type { IEmissionIntentRepository } from "../../../domain/ports/repositories";
import type { EmissionIntent, EmissionIntentStatus } from "../../../domain/entities/EmissionIntent";

function toDomain(r: {
  id: string; conversationId: string | null; contactId: string | null; integrationId: string; status: string;
  tomadorName: string; tomadorCpf: string; serviceId: string | null; description: string; amount: number;
  paymentVerified: boolean; paymentConfidence: number; fiscalKey: string | null; pdfUrl: string | null;
  createdAt: Date; updatedAt: Date;
}): EmissionIntent {
  return {
    id: r.id, conversationId: r.conversationId ?? "", contactId: r.contactId ?? "", integrationId: r.integrationId,
    status: r.status as EmissionIntentStatus, tomadorName: r.tomadorName, tomadorCpf: r.tomadorCpf,
    serviceId: r.serviceId, description: r.description, amount: r.amount,
    paymentVerified: r.paymentVerified, paymentConfidence: r.paymentConfidence,
    fiscalKey: r.fiscalKey, pdfUrl: r.pdfUrl, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export class PrismaEmissionIntentRepository implements IEmissionIntentRepository {
  async save(i: EmissionIntent): Promise<void> {
    await prisma.emissionIntent.upsert({
      where: { id: i.id },
      update: { status: i.status, serviceId: i.serviceId, description: i.description, amount: i.amount, paymentVerified: i.paymentVerified, paymentConfidence: i.paymentConfidence, fiscalKey: i.fiscalKey, pdfUrl: i.pdfUrl, updatedAt: i.updatedAt },
      create: { id: i.id, conversationId: i.conversationId, contactId: i.contactId, integrationId: i.integrationId, status: i.status, tomadorName: i.tomadorName, tomadorCpf: i.tomadorCpf, serviceId: i.serviceId, description: i.description, amount: i.amount, paymentVerified: i.paymentVerified, paymentConfidence: i.paymentConfidence, fiscalKey: i.fiscalKey, pdfUrl: i.pdfUrl, createdAt: i.createdAt, updatedAt: i.updatedAt },
    });
  }
  async getById(id: string): Promise<EmissionIntent | null> {
    const r = await prisma.emissionIntent.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros novos.

- [ ] **Step 3: Commit**
```bash
git add src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository.ts
git commit -m "feat(persist): PrismaEmissionIntentRepository (registro fiscal deixa de ser volatil)"
```

---

### Task 7: PrismaAgentConfigRepository e PrismaIntegrationRepository

Os dois que dependem dos mapeadores puros da Task 1. Integration reconstrói via JOIN Company (drift).

**Files:**
- Create: `src/infrastructure/persistence/prisma/PrismaAgentConfigRepository.ts`
- Create: `src/infrastructure/persistence/prisma/PrismaIntegrationRepository.ts`

**Interfaces:**
- Consumes: `integrationToDomain`, `agentConfigToDomain` (Task 1).
- Produces: `PrismaAgentConfigRepository implements IAgentConfigRepository`, `PrismaIntegrationRepository implements IIntegrationRepository`.

- [ ] **Step 1: Implementar AgentConfig**

```ts
// src/infrastructure/persistence/prisma/PrismaAgentConfigRepository.ts
import { prisma } from "./client";
import type { IAgentConfigRepository } from "../../../domain/ports/repositories";
import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import { agentConfigToDomain } from "./mappers";

export class PrismaAgentConfigRepository implements IAgentConfigRepository {
  async getByIntegrationId(integrationId: string): Promise<AgentConfig | null> {
    const r = await prisma.agentConfig.findUnique({ where: { integrationId } });
    return r ? agentConfigToDomain(r) : null;
  }
}
```

- [ ] **Step 2: Implementar Integration (JOIN Company)**

```ts
// src/infrastructure/persistence/prisma/PrismaIntegrationRepository.ts
import { prisma } from "./client";
import type { IIntegrationRepository } from "../../../domain/ports/repositories";
import type { Integration } from "../../../domain/entities/Integration";
import { integrationToDomain } from "./mappers";

export class PrismaIntegrationRepository implements IIntegrationRepository {
  async getByWhatsappNumber(number: string): Promise<Integration | null> {
    const r = await prisma.integration.findFirst({ where: { whatsappNumber: number }, include: { Company: true } });
    return r ? integrationToDomain(r, r.Company) : null;
  }
  async getById(id: string): Promise<Integration | null> {
    const r = await prisma.integration.findUnique({ where: { id }, include: { Company: true } });
    return r ? integrationToDomain(r, r.Company) : null;
  }
}
```

- [ ] **Step 3: Typecheck** — Run: `npm run typecheck` — Expected: sem erros novos. *(Se o nome da relação Prisma não for `Company`, conferir em `prisma/schema.prisma` o campo de relação do model Integration e ajustar `include`.)*

- [ ] **Step 4: Commit**
```bash
git add src/infrastructure/persistence/prisma/PrismaAgentConfigRepository.ts src/infrastructure/persistence/prisma/PrismaIntegrationRepository.ts
git commit -m "feat(persist): PrismaAgentConfig + PrismaIntegration (JOIN Company p/ fiscal*)"
```

---

### Task 8: Seed do piloto no banco (idempotente)

Ao trocar `integrations`/`agentConfigs`/`services` para Prisma, o seed in-memory de `main.ts` deixa de valer para esses repos. Sem uma Integration no banco com `whatsappNumber = PILOT_WHATSAPP_NUMBER`, o `HandleInboundMessage.ts:20` acha `null` e IGNORA a mensagem. Este seed garante Company + Integration + AgentConfig + Service do piloto.

**Files:**
- Create: `src/infrastructure/persistence/seedPilot.ts`

**Interfaces:**
- Produces: `seedPilot(params: { whatsappNumber: string }): Promise<void>` — consumido por `main.ts`.

- [ ] **Step 1: Implementar (idempotente, reusa a Integration existente da empresa)**

```ts
// src/infrastructure/persistence/seedPilot.ts
import { prisma } from "./prisma/client";

const COMPANY_ID = "company-piloto";
const SERVICE_PRICE = 180;

/**
 * Semeia o piloto no banco (idempotente). Reusa a Integration existente da
 * empresa (a "Padrão" criada pelo PrismaCompanyServiceRepository) em vez de
 * duplicar — só ajusta o whatsappNumber/evolutionInstance p/ o número real.
 */
export async function seedPilot(params: { whatsappNumber: string }): Promise<void> {
  const now = new Date();
  await prisma.company.upsert({
    where: { id: COMPANY_ID },
    update: {},
    create: { id: COMPANY_ID, name: "Kapty (consultório)", fiscalDoc: "66008326000173", fiscalName: "Kapty (consultório)", updatedAt: now },
  });

  let integ = await prisma.integration.findFirst({ where: { companyId: COMPANY_ID } });
  if (!integ) {
    integ = await prisma.integration.create({
      data: { id: "int-piloto", companyId: COMPANY_ID, displayName: "Kapty (consultório)", whatsappNumber: params.whatsappNumber, evolutionInstance: "Megus", active: true, updatedAt: now },
    });
  } else {
    integ = await prisma.integration.update({ where: { id: integ.id }, data: { whatsappNumber: params.whatsappNumber, evolutionInstance: "Megus", updatedAt: now } });
  }

  const svcId = "svc-massagem-" + integ.id;
  await prisma.service.upsert({
    where: { id: svcId },
    update: { price: SERVICE_PRICE },
    create: { id: svcId, integrationId: integ.id, code: "0107", description: "Massagem", price: SERVICE_PRICE, issCode: "0107" },
  });

  await prisma.agentConfig.upsert({
    where: { integrationId: integ.id },
    update: {},
    create: {
      id: "ag-piloto-" + integ.id, integrationId: integ.id, name: "Kaua", segment: "saude",
      tone: "equilibrado", emojis: true, lang: "pt",
      instructions: "Você é o atendente do consultório. Seja cordial e ajude o paciente a emitir a nota fiscal após o pagamento.",
      capabilitiesJson: JSON.stringify({ chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [svcId] }),
      knowledgeFilesJson: JSON.stringify([]), fewShotDialogsJson: JSON.stringify([]), updatedAt: now,
    },
  });
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros.

- [ ] **Step 3: Commit**
```bash
git add src/infrastructure/persistence/seedPilot.ts
git commit -m "feat(persist): seedPilot idempotente (Company+Integration+AgentConfig+Service) no banco"
```

---

### Task 9: Wire em main.ts + validação real no banco

Troca TODOS os repos para Prisma quando há `DATABASE_URL` e semeia o piloto. Depois valida survives-restart + IDOR no banco do Pietro.

**Files:**
- Modify: `src/main.ts:106-113` (bloco `if (env.DATABASE_URL)`) e imports no topo.

**Interfaces:**
- Consumes: as 6 classes Prisma (Tasks 3-7) e `seedPilot` (Task 8).

- [ ] **Step 1: Ampliar o bloco de swap e semear**

Substituir o bloco atual (`main.ts:106-113`):
```ts
  if (env.DATABASE_URL) {
    repos.users = new PrismaUserRepository();
    repos.companyProfiles = new PrismaCompanyProfileRepository();
    repos.companyServices = new PrismaCompanyServiceRepository();
    logger.info("[persistência] usuários + empresa + serviços usando Prisma (banco real)");
  } else {
    logger.info("[persistência] tudo in-memory (sem DATABASE_URL)");
  }
```
por:
```ts
  if (env.DATABASE_URL) {
    repos.users = new PrismaUserRepository();
    repos.companyProfiles = new PrismaCompanyProfileRepository();
    repos.companyServices = new PrismaCompanyServiceRepository();
    repos.integrations = new PrismaIntegrationRepository();
    repos.agentConfigs = new PrismaAgentConfigRepository();
    repos.contacts = new PrismaContactRepository();
    repos.conversations = new PrismaConversationRepository();
    repos.emissions = new PrismaEmissionIntentRepository();
    repos.services = new PrismaServiceRepository();
    await seedPilot({ whatsappNumber: env.PILOT_WHATSAPP_NUMBER ?? "5511999999999" });
    logger.info("[persistência] TODOS os repositórios usando Prisma (banco real) + piloto semeado");
  } else {
    logger.info("[persistência] tudo in-memory (sem DATABASE_URL)");
  }
```
E adicionar os imports no topo de `main.ts`:
```ts
import { PrismaIntegrationRepository } from "./infrastructure/persistence/prisma/PrismaIntegrationRepository";
import { PrismaAgentConfigRepository } from "./infrastructure/persistence/prisma/PrismaAgentConfigRepository";
import { PrismaContactRepository } from "./infrastructure/persistence/prisma/PrismaContactRepository";
import { PrismaConversationRepository } from "./infrastructure/persistence/prisma/PrismaConversationRepository";
import { PrismaEmissionIntentRepository } from "./infrastructure/persistence/prisma/PrismaEmissionIntentRepository";
import { PrismaServiceRepository } from "./infrastructure/persistence/prisma/PrismaServiceRepository";
import { seedPilot } from "./infrastructure/persistence/seedPilot";
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` — Expected: sem erros. *(Nota: os campos `repos.integrations` etc. são atribuíveis porque `InMemoryRepositories` os declara como propriedades das interfaces — mesmo padrão dos 3 já trocados.)*

- [ ] **Step 3: [Pietro/VPS — precisa do Azure] Gerar o Prisma client e subir contra o banco**

Run (na máquina do Pietro, com `DATABASE_URL` real no `.env`):
```bash
npx prisma generate
npm run dev
```
Expected: log `[persistência] TODOS os repositórios usando Prisma (banco real) + piloto semeado`. Sem exceção de conexão (IP liberado no firewall do Azure).

- [ ] **Step 4: [Pietro/VPS] Validar survives-restart via /dev/inbound**

Com o `.env` apontando `PILOT_WHATSAPP_NUMBER=5512997843384` e `MESSAGING_PROVIDER=none`:
```bash
# 1) manda mensagem
curl -s -X POST http://localhost:3000/dev/inbound -H "Content-Type: application/json" \
  -d '{"from":"5511988887777","to":"5512997843384","kind":"text","text":"quero uma nota"}'
# 2) confirma no banco que a conversa/mensagem/contato existem
#    (Azure Data Studio ou o script analyze-db.ts, filtrando por integrationId do piloto)
# 3) Ctrl+C no npm run dev e sobe de novo (npm run dev)
# 4) manda outra mensagem do mesmo 'from' e confirma que a MESMA conversa continua (não recria)
```
Expected: a conversa e o histórico sobrevivem ao restart (não zeram); o contato e qualquer EmissionIntent persistem.

- [ ] **Step 5: [Pietro/VPS] Contrato Prisma real (round-trip + IDOR)**

Criar `tests/prismaRepositories.contract.test.ts` (roda só onde há DB):
```ts
import { describe, it } from "vitest";
import { assertRepositoryContract } from "./repositoryContract";
import { PrismaContactRepository } from "../src/infrastructure/persistence/prisma/PrismaContactRepository";
import { PrismaConversationRepository } from "../src/infrastructure/persistence/prisma/PrismaConversationRepository";
import { PrismaEmissionIntentRepository } from "../src/infrastructure/persistence/prisma/PrismaEmissionIntentRepository";
import { PrismaServiceRepository } from "../src/infrastructure/persistence/prisma/PrismaServiceRepository";

describe.skipIf(!process.env.DATABASE_URL)("Prisma — contrato (precisa DATABASE_URL)", () => {
  it("cumpre o contrato contra o banco real (round-trip + IDOR)", async () => {
    await assertRepositoryContract({
      contacts: new PrismaContactRepository(),
      conversations: new PrismaConversationRepository(),
      emissions: new PrismaEmissionIntentRepository(),
      services: new PrismaServiceRepository(),
    });
  });
});
```
Run (Pietro): `npm test -- prismaRepositories` — Expected: PASS (o mesmo gabarito do in-memory, agora contra o Azure). O caso IDOR (tenant B não lê contato/conversa de A) PASSA porque todo `WHERE` filtra `integrationId`.

- [ ] **Step 6: Commit**
```bash
git add src/main.ts tests/prismaRepositories.contract.test.ts
git commit -m "feat(persist): wire Prisma para todos os repos + seed piloto; contrato real (round-trip+IDOR) verde"
```

---

## Self-Review

**Spec coverage (§7 do design — Persistência):** os 6 repos (Integration/AgentConfig/Contact/Conversation+Message/EmissionIntent/Service) → Tasks 3-7; drift Integration↔Company → Task 1 + Task 7; reuso da "Integration Padrão" → Task 8 (seedPilot reusa `findFirst({companyId})`); wire de TODOS em main.ts → Task 9; migration `Conversation.summary` → **deliberadamente FORA** (é Fase 7, marcado nas Global Constraints); teste NEGATIVO de IDOR → Task 2 (in-memory) + Task 9 Step 5 (Prisma). Coberto.

**Placeholder scan:** sem TBD/TODO; todo passo com código ou comando concreto. Os passos que dependem do Azure estão marcados `[Pietro/VPS]` com o motivo (sandbox não alcança o firewall), não são placeholders.

**Type consistency:** `assertRepositoryContract(ReposBundle)` usado igual na Task 2 e Task 9. `integrationToDomain`/`agentConfigToDomain` definidos na Task 1 e consumidos na Task 7 com as mesmas assinaturas. `EmissionIntentStatus` importado do domínio. `ConversationState.New` usado no repo e no contrato. Nomes de coluna (`code/description/issCode/price`, `capabilitiesJson` etc.) conferidos contra `schema.prisma` e os repos existentes.

**Riscos conhecidos herdados do design:** (1) nome da relação Prisma `Company` no `include` — Task 7 Step 3 manda conferir no schema; (2) `getHistory` ordem cronológica — resolvido com `orderBy desc + reverse`; (3) `EmissionIntent` colunas extras — default null no create.

---

## Próximos planos (não neste arquivo)
- **Plano 2 — Cérebro (Fases 2-4):** ContextAssembler + PromptComposer, persona, des-engessar (enum + dispatcher-com-guarda), regressão dos portões fiscais.
- **Plano 3 — Conversa + Personalização + Memória + Smoke (Fases 5-8).**
