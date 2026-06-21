# Megus AI — Atendente de WhatsApp ("Kaua") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o caminho-feliz demonstrável do atendente "Kaua": paciente manda mensagem no WhatsApp → Kaua coleta e valida nome+CPF → cria/dedup cliente → confere comprovante → emite NFS-e (mock) → devolve o PDF; com handoff humano em qualquer incerteza.

**Architecture:** Serviço Node/TypeScript em Clean Architecture + DDD (esqueleto já existe em `Megus.AI/`). O loop do Kaua é uma **máquina de estados determinística** (a Application); o LLM é ajudante com coleira (porta `IAgentBrain` + `IComprovanteAnalyzer`); mensageria via **Evolution API (Baileys)** atrás de `IMessagingProvider`; fiscal e CPF **mockados**. Persistência **in-memory primeiro** (demo sem depender de Postgres), Postgres como tarefa final.

**Tech Stack:** Node 20, TypeScript 5.6 (ESM, `moduleResolution: Bundler`), Vitest (testes), OpenAI SDK (cérebro/visão), `fetch` nativo (Evolution REST), `node:http`/Express mínimo (webhook), pino (logs), zod (env). Evolution API v2 self-host (modo Baileys).

## Global Constraints

- **Node** ≥ 20 (usa `fetch`/`crypto.randomUUID` nativos). `package.json` já fixa `"engines": { "node": ">=20" }` e `"type": "module"`.
- **TypeScript strict**: `strict: true` + `noUncheckedIndexedAccess: true` (já no `tsconfig.json`). Imports SEM extensão (`moduleResolution: Bundler`).
- **Regra dura de segurança:** o LLM NUNCA emite. Só a máquina de estados, após validar, chama `IFiscalProvider.emitNfse`. Nenhuma tarefa pode quebrar isso.
- **Agnosticismo de porta:** Application e Domain só conhecem as interfaces em `src/domain/ports/`. Nada de SDK do OpenAI/Evolution fora de `src/infrastructure/`.
- **Mocks fixos no MVP:** `IFiscalProvider` e `ICpfProvider` são mockados (decisões §5.1/§5.6 do spec). Não chamar a Kapty.
- **Parâmetros configuráveis via env** (já em `src/infrastructure/config/env.ts`): `COMPROVANTE_MIN_CONFIDENCE` (default 0.8), e novo `CPF_MAX_ATTEMPTS` (default 2).
- **Idioma:** mensagens ao paciente em PT-BR; código/comentários como o resto do repo.

---

## File Structure

**Já existe (esqueleto):** `src/domain/{entities,value-objects,ports,errors}`, `src/infrastructure/{config,cpf,fiscal,ai,messaging}`, `src/application/{agent,use-cases}`, `src/main.ts`. Ver README.

**Criar:**
- `vitest.config.ts` — config de teste.
- `src/domain/entities/Service.ts` — serviço (preço esperado da NFS-e).
- `src/domain/services/nameMatch.ts` — comparação normalizada CPF↔nome.
- `src/domain/ports/repositories.ts` — **modificar**: adicionar `IServiceRepository`.
- `src/infrastructure/persistence/memory/*.ts` — repos in-memory (Integration, AgentConfig, Contact, Conversation, EmissionIntent, Service).
- `src/application/agent/ConversationStateMachine.ts` — **substituir o stub** pela lógica real.
- `src/application/use-cases/HandleInboundMessage.ts` — **substituir o stub** pela orquestração real.
- `src/infrastructure/ai/OpenAiAgentBrain.ts` / `OpenAiComprovanteAnalyzer.ts` — **substituir stubs**.
- `src/infrastructure/messaging/evolution/EvolutionMessagingProvider.ts` — adapter Evolution.
- `src/infrastructure/messaging/evolution/webhookMapper.ts` — payload Evolution → `InboundMessage`.
- `src/infrastructure/http/server.ts` — webhook + /qr + /health.
- `src/main.ts` — **modificar**: wiring real.
- `src/infrastructure/config/env.ts` — **modificar**: vars do Evolution + `CPF_MAX_ATTEMPTS`.
- `tests/**` — testes espelhando `src/**`.

---

## Task 1: Test tooling + travar o `Cpf` value object

**Files:**
- Modify: `package.json` (devDeps `vitest`, script `test`)
- Create: `vitest.config.ts`
- Test: `tests/domain/value-objects/Cpf.test.ts`

**Interfaces:**
- Consumes: `Cpf` de `src/domain/value-objects/Cpf.ts` (existente: `Cpf.isValid(raw): boolean`, `Cpf.tryCreate(raw): Cpf | null`, `.digits`, `.format()`, `.equals(other)`).
- Produces: comando `npm test` funcional para todas as tarefas seguintes.

- [ ] **Step 1: Adicionar vitest ao package.json**

Em `package.json`, adicione em `devDependencies` `"vitest": "^2.1.0"` e em `scripts` `"test": "vitest run"`, `"test:watch": "vitest"`. Rode `npm install`.

- [ ] **Step 2: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Escrever o teste do `Cpf` (deve passar — VO já implementado)**

```ts
import { describe, expect, it } from "vitest";
import { Cpf } from "../../../src/domain/value-objects/Cpf";

describe("Cpf", () => {
  it("aceita CPF válido e normaliza dígitos", () => {
    const cpf = Cpf.tryCreate("529.982.247-25");
    expect(cpf).not.toBeNull();
    expect(cpf?.digits).toBe("52998224725");
    expect(cpf?.format()).toBe("529.982.247-25");
  });

  it("rejeita dígito verificador inválido", () => {
    expect(Cpf.isValid("529.982.247-24")).toBe(false);
    expect(Cpf.tryCreate("11111111111")).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/domain/value-objects/Cpf.test.ts
git commit -m "test: setup vitest + lock Cpf value object"
```

---

## Task 2: `nameMatch` — comparação normalizada CPF↔nome

**Files:**
- Create: `src/domain/services/nameMatch.ts`
- Test: `tests/domain/services/nameMatch.test.ts`

**Interfaces:**
- Produces: `nameMatch(typed: string, official: string): boolean` — true se o nome digitado bate com o oficial, ignorando acento/caixa/espaços e tolerando nome do meio ausente.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, expect, it } from "vitest";
import { nameMatch } from "../../../src/domain/services/nameMatch";

describe("nameMatch", () => {
  it("bate ignorando acento e caixa", () => {
    expect(nameMatch("joao da silva", "João da Silva")).toBe(true);
  });
  it("tolera nome do meio ausente (subconjunto na ordem)", () => {
    expect(nameMatch("Maria Souza", "Maria Aparecida Souza")).toBe(true);
  });
  it("recusa quando sobrenome não bate", () => {
    expect(nameMatch("Maria Souza", "Maria Oliveira")).toBe(false);
  });
  it("recusa string vazia", () => {
    expect(nameMatch("", "João Silva")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- nameMatch`
Expected: FAIL ("Cannot find module .../nameMatch").

- [ ] **Step 3: Implementar**

```ts
/** Normaliza: minúsculas, sem acento, tokens alfabéticos. */
function tokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * true se TODOS os tokens digitados aparecem, na ordem, dentro do nome oficial.
 * Tolera nome do meio ausente; exige primeiro e último presentes na sequência.
 */
export function nameMatch(typed: string, official: string): boolean {
  const a = tokens(typed);
  const b = tokens(official);
  if (a.length === 0 || b.length === 0) return false;
  let j = 0;
  for (const t of a) {
    while (j < b.length && b[j] !== t) j += 1;
    if (j === b.length) return false;
    j += 1;
  }
  return true;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- nameMatch`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/domain/services/nameMatch.ts tests/domain/services/nameMatch.test.ts
git commit -m "feat: nameMatch normalized CPF-vs-name comparison"
```

---

## Task 3: Entidade `Service` + `IServiceRepository` + repos in-memory

**Files:**
- Create: `src/domain/entities/Service.ts`
- Modify: `src/domain/ports/repositories.ts` (adicionar `IServiceRepository`)
- Create: `src/infrastructure/persistence/memory/InMemoryRepositories.ts`
- Test: `tests/infrastructure/persistence/InMemoryRepositories.test.ts`

**Interfaces:**
- Produces:
  - `Service { id, integrationId, code, description, price, issCode }`
  - `IServiceRepository.getById(id): Promise<Service|null>`, `.listByIntegration(integrationId): Promise<Service[]>`
  - `InMemoryRepositories` — objeto com `integrations, agentConfigs, contacts, conversations, emissions, services` implementando as interfaces de `repositories.ts`, mais `seed(data)` para testes/demo.
- Consumes: as interfaces de repositório existentes em `src/domain/ports/repositories.ts` e as entidades de `src/domain/entities/`.

- [ ] **Step 1: Criar a entidade `Service`**

```ts
/** Serviço NFS-e vinculado ao agente. price = valor esperado da emissão. */
export interface Service {
  id: string;
  integrationId: string;
  code: string;
  description: string;
  price: number; // BRL
  issCode: string;
}
```

- [ ] **Step 2: Adicionar `IServiceRepository` em `repositories.ts`**

No fim de `src/domain/ports/repositories.ts`, adicione o import `import type { Service } from "../entities/Service";` e:

```ts
export interface IServiceRepository {
  getById(id: string): Promise<Service | null>;
  listByIntegration(integrationId: string): Promise<Service[]>;
}
```

- [ ] **Step 3: Escrever o teste dos repos in-memory**

```ts
import { describe, expect, it } from "vitest";
import { InMemoryRepositories } from "../../../src/infrastructure/persistence/memory/InMemoryRepositories";

describe("InMemoryRepositories", () => {
  it("resolve integração por número e dedup de contato por CPF", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [{
        id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
        fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
        fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
      }],
    });
    const found = await repos.integrations.getByWhatsappNumber("5511999990000");
    expect(found?.id).toBe("int1");

    const now = new Date();
    await repos.contacts.save({
      id: "c1", integrationId: "int1", whatsappNumber: "5511988887777",
      fullName: "João Silva", cpf: "52998224725", cpfNameVerified: true,
      createdAt: now, updatedAt: now,
    });
    const dup = await repos.contacts.findByCpf("int1", "52998224725");
    expect(dup?.id).toBe("c1");
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test -- InMemoryRepositories`
Expected: FAIL (módulo inexistente).

- [ ] **Step 5: Implementar `InMemoryRepositories`**

```ts
import type { AgentConfig } from "../../../domain/entities/AgentConfig";
import type { Contact } from "../../../domain/entities/Contact";
import type { Conversation } from "../../../domain/entities/Conversation";
import type { EmissionIntent } from "../../../domain/entities/EmissionIntent";
import type { Integration } from "../../../domain/entities/Integration";
import type { Message } from "../../../domain/entities/Message";
import { ConversationState } from "../../../domain/entities/ConversationState";
import type { Service } from "../../../domain/entities/Service";
import { randomUUID } from "node:crypto";
import type {
  IAgentConfigRepository, IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IIntegrationRepository, IServiceRepository,
} from "../../../domain/ports/repositories";

interface SeedData {
  integrations?: Integration[];
  agentConfigs?: AgentConfig[];
  contacts?: Contact[];
  services?: Service[];
}

export class InMemoryRepositories {
  private _integrations: Integration[] = [];
  private _agentConfigs: AgentConfig[] = [];
  private _contacts: Contact[] = [];
  private _conversations: Conversation[] = [];
  private _messages: Message[] = [];
  private _emissions: EmissionIntent[] = [];
  private _services: Service[] = [];

  seed(data: SeedData): void {
    if (data.integrations) this._integrations.push(...data.integrations);
    if (data.agentConfigs) this._agentConfigs.push(...data.agentConfigs);
    if (data.contacts) this._contacts.push(...data.contacts);
    if (data.services) this._services.push(...data.services);
  }

  integrations: IIntegrationRepository = {
    getByWhatsappNumber: async (n) =>
      this._integrations.find((i) => i.whatsappNumber === n) ?? null,
    getById: async (id) => this._integrations.find((i) => i.id === id) ?? null,
  };

  agentConfigs: IAgentConfigRepository = {
    getByIntegrationId: async (id) =>
      this._agentConfigs.find((a) => a.integrationId === id) ?? null,
  };

  contacts: IContactRepository = {
    findByCpf: async (integrationId, cpf) =>
      this._contacts.find((c) => c.integrationId === integrationId && c.cpf === cpf) ?? null,
    findByWhatsapp: async (integrationId, number) =>
      this._contacts.find((c) => c.integrationId === integrationId && c.whatsappNumber === number) ?? null,
    save: async (contact) => {
      const i = this._contacts.findIndex((c) => c.id === contact.id);
      if (i >= 0) this._contacts[i] = contact;
      else this._contacts.push(contact);
    },
  };

  conversations: IConversationRepository = {
    getOrCreate: async (integrationId, contactId, number) => {
      let conv = this._conversations.find((c) => c.contactId === contactId);
      if (!conv) {
        const now = new Date();
        conv = {
          id: randomUUID(), integrationId, contactId, whatsappNumber: number,
          state: ConversationState.New, humanHandoff: false,
          lastInboundAt: now, createdAt: now, updatedAt: now,
        };
        this._conversations.push(conv);
      }
      return conv;
    },
    save: async (conv) => {
      const i = this._conversations.findIndex((c) => c.id === conv.id);
      if (i >= 0) this._conversations[i] = conv;
      else this._conversations.push(conv);
    },
    appendMessage: async (m) => { this._messages.push(m); },
    getHistory: async (conversationId, limit) =>
      this._messages.filter((m) => m.conversationId === conversationId).slice(-limit),
  };

  emissions: IEmissionIntentRepository = {
    save: async (intent) => {
      const i = this._emissions.findIndex((e) => e.id === intent.id);
      if (i >= 0) this._emissions[i] = intent;
      else this._emissions.push(intent);
    },
    getById: async (id) => this._emissions.find((e) => e.id === id) ?? null,
  };

  services: IServiceRepository = {
    getById: async (id) => this._services.find((s) => s.id === id) ?? null,
    listByIntegration: async (integrationId) =>
      this._services.filter((s) => s.integrationId === integrationId),
  };
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test -- InMemoryRepositories`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/entities/Service.ts src/domain/ports/repositories.ts src/infrastructure/persistence/memory/InMemoryRepositories.ts tests/infrastructure/persistence/InMemoryRepositories.test.ts
git commit -m "feat: Service entity + in-memory repositories"
```

---

## Task 4: `ConversationStateMachine` — identidade e validação de CPF

**Files:**
- Modify: `src/application/agent/ConversationStateMachine.ts` (substituir stub)
- Modify: `src/infrastructure/config/env.ts` (adicionar `CPF_MAX_ATTEMPTS`)
- Test: `tests/application/ConversationStateMachine.identity.test.ts`

**Interfaces:**
- Produces:
  - `interface StateMachineDeps { brain, cpf, comprovante, fiscal, messaging, contacts, conversations, emissions, services, config: { cpfMaxAttempts: number; comprovanteMinConfidence: number } }`
  - `class ConversationStateMachine { constructor(deps: StateMachineDeps); advance(conversation, agentConfig, integration, inbound): Promise<void> }`
  - O estado por-conversa de tentativas de CPF é mantido em memória no mapa `attempts` da instância (chaveado por conversationId).
- Consumes: `IAgentBrain.decide`, `ICpfProvider.lookupName`, `IFiscalProvider.upsertCustomer`, `nameMatch`, `Cpf`, repos, `IMessagingProvider.sendText`.

- [ ] **Step 1: Adicionar `CPF_MAX_ATTEMPTS` ao env**

Em `src/infrastructure/config/env.ts`, dentro do `schema`, adicione: `CPF_MAX_ATTEMPTS: z.coerce.number().default(2),`.

- [ ] **Step 2: Escrever o teste de identidade/CPF (happy + handoff)**

```ts
import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

function baseDeps(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn() },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { emitNfse: vi.fn(), upsertCustomer: vi.fn(async () => ({ customerId: "cust1", created: true })) },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations,
    emissions: repos.emissions, services: repos.services,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

const integration = {
  id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000",
  fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA",
  fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date(),
};
const agentConfig: any = { id: "ag1", integrationId: "int1", name: "Kaua", segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", instructions: "", capabilities: { chat: true, agenda: false, agendaLink: null, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"] }, knowledgeFiles: [], fewShotDialogs: [], createdAt: new Date(), updatedAt: new Date() };

function inbound(text: string): InboundMessage {
  return { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text, media: null, timestamp: new Date() };
}

describe("ConversationStateMachine — identidade/CPF", () => {
  it("CPF válido + nome bate → cria cliente e vai para AwaitingComprovante", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta", price: 300, issCode: "0107" }] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["ok"], action: { type: "reply" }, extracted: { fullName: "João da Silva", cpf: "529.982.247-25" } });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    conv.state = ConversationState.CollectingIdentity;
    await sm.advance(conv, agentConfig, integration, inbound("Sou João da Silva, CPF 529.982.247-25"));

    expect(deps.fiscal.upsertCustomer).toHaveBeenCalledOnce();
    const saved = await repos.conversations.save; // estado persistido
    expect(conv.state).toBe(ConversationState.AwaitingComprovante);
  });

  it("nome não bate 2x → handoff humano", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration] });
    const deps = baseDeps(repos);
    (deps.brain.decide as any).mockResolvedValue({ reply: ["?"], action: { type: "reply" }, extracted: { fullName: "Fulano Errado", cpf: "529.982.247-25" } });
    (deps.cpf.lookupName as any).mockResolvedValue({ found: true, name: "João da Silva" });

    const sm = new ConversationStateMachine(deps);
    const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
    conv.state = ConversationState.CollectingIdentity;
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));
    expect(conv.state).toBe(ConversationState.CollectingIdentity); // 1ª falha: pede de novo
    await sm.advance(conv, agentConfig, integration, inbound("Fulano Errado 529.982.247-25"));
    expect(conv.state).toBe(ConversationState.HumanHandoff); // 2ª falha
    expect(conv.humanHandoff).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- ConversationStateMachine.identity`
Expected: FAIL (stub lança "pendente da Seção 2").

- [ ] **Step 4: Implementar a porção de identidade/CPF do `ConversationStateMachine`**

Substitua TODO o conteúdo de `src/application/agent/ConversationStateMachine.ts`. (As partes de comprovante/emissão entram na Task 5 — por ora, esses ramos chamam `this.notImplemented`.)

```ts
import type { AgentConfig } from "../../domain/entities/AgentConfig";
import type { Conversation } from "../../domain/entities/Conversation";
import { ConversationState } from "../../domain/entities/ConversationState";
import type { Integration } from "../../domain/entities/Integration";
import { Cpf } from "../../domain/value-objects/Cpf";
import { nameMatch } from "../../domain/services/nameMatch";
import type { IAgentBrain } from "../../domain/ports/IAgentBrain";
import type { ICpfProvider } from "../../domain/ports/ICpfProvider";
import type { IComprovanteAnalyzer } from "../../domain/ports/IComprovanteAnalyzer";
import type { IFiscalProvider } from "../../domain/ports/IFiscalProvider";
import type { IMessagingProvider, InboundMessage } from "../../domain/ports/IMessagingProvider";
import type {
  IContactRepository, IConversationRepository,
  IEmissionIntentRepository, IServiceRepository,
} from "../../domain/ports/repositories";
import { randomUUID } from "node:crypto";

export interface StateMachineDeps {
  brain: IAgentBrain;
  cpf: ICpfProvider;
  comprovante: IComprovanteAnalyzer;
  fiscal: IFiscalProvider;
  messaging: IMessagingProvider;
  contacts: IContactRepository;
  conversations: IConversationRepository;
  emissions: IEmissionIntentRepository;
  services: IServiceRepository;
  config: { cpfMaxAttempts: number; comprovanteMinConfidence: number };
}

export class ConversationStateMachine {
  private readonly attempts = new Map<string, number>();
  constructor(private readonly d: StateMachineDeps) {}

  async advance(
    conversation: Conversation,
    agentConfig: AgentConfig,
    integration: Integration,
    inbound: InboundMessage,
  ): Promise<void> {
    if (conversation.humanHandoff) return; // bot calado

    switch (conversation.state) {
      case ConversationState.New:
        return this.handleChatting(conversation, agentConfig, inbound);
      case ConversationState.CollectingIdentity:
      case ConversationState.ValidatingCpf:
        return this.handleIdentity(conversation, agentConfig, integration, inbound);
      case ConversationState.AwaitingComprovante:
      case ConversationState.VerifyingComprovante:
        return this.handleComprovante(conversation, agentConfig, integration, inbound);
      default:
        return this.send(conversation, ["Um momento, já te respondo."]);
    }
  }

  /** New/Chatting: o cérebro responde e sinaliza intenção de emitir nota. */
  private async handleChatting(conv: Conversation, cfg: AgentConfig, inbound: InboundMessage): Promise<void> {
    const decision = await this.d.brain.decide(await this.context(conv, cfg, inbound));
    await this.send(conv, decision.reply);
    if (decision.action.type === "request_identity") {
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
    }
  }

  /** Coleta nome+CPF, valida dígito + CPF↔nome, cria cliente. */
  private async handleIdentity(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    const decision = await this.d.brain.decide(await this.context(conv, cfg, inbound));
    const fullName = (decision.extracted?.fullName ?? "").trim();
    const cpfRaw = (decision.extracted?.cpf ?? "").trim();
    const cpf = Cpf.tryCreate(cpfRaw);

    if (!fullName || !cpf) {
      await this.send(conv, ["Preciso do seu nome completo e CPF para emitir a nota. Pode mandar?"]);
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
      return;
    }

    const lookup = await this.d.cpf.lookupName(cpf.digits);
    const ok = lookup.found && lookup.name != null && nameMatch(fullName, lookup.name);
    if (!ok) {
      const n = (this.attempts.get(conv.id) ?? 0) + 1;
      this.attempts.set(conv.id, n);
      if (n >= this.d.config.cpfMaxAttempts) {
        await this.handoff(conv, "CPF↔nome não confere após tentativas");
        return;
      }
      await this.send(conv, ["O nome não bateu com o CPF informado. Pode conferir e mandar de novo?"]);
      conv.state = ConversationState.CollectingIdentity;
      await this.d.conversations.save(conv);
      return;
    }

    // OK: cria/dedup o contato e o cliente no backend fiscal.
    this.attempts.delete(conv.id);
    let contact = await this.d.contacts.findByCpf(integration.id, cpf.digits);
    const now = new Date();
    if (!contact) {
      contact = {
        id: randomUUID(), integrationId: integration.id, whatsappNumber: conv.whatsappNumber,
        fullName, cpf: cpf.digits, cpfNameVerified: true, createdAt: now, updatedAt: now,
      };
    } else {
      contact = { ...contact, fullName, cpfNameVerified: true, updatedAt: now };
    }
    await this.d.contacts.save(contact);
    await this.d.fiscal.upsertCustomer({
      integrationRef: integration.fiscalProviderRef, name: fullName, cpf: cpf.digits, whatsapp: conv.whatsappNumber,
    });

    conv.contactId = contact.id;
    conv.state = ConversationState.AwaitingComprovante;
    await this.d.conversations.save(conv);
    await this.send(conv, ["Perfeito! Agora me envia o comprovante de pagamento (foto ou PDF) que eu emito sua nota."]);
  }

  private async handleComprovante(_conv: Conversation, _cfg: AgentConfig, _integration: Integration, _inbound: InboundMessage): Promise<void> {
    throw new Error("handleComprovante: Task 5");
  }

  private async context(conv: Conversation, cfg: AgentConfig, inbound: InboundMessage) {
    const history = await this.d.conversations.getHistory(conv.id, 20);
    return { systemInstructions: cfg.instructions, state: conv.state, history, collected: {}, inboundText: inbound.text ?? "" };
  }

  private async send(conv: Conversation, bubbles: string[]): Promise<void> {
    for (const text of bubbles) {
      await this.d.messaging.sendText({ to: conv.whatsappNumber, text });
    }
  }

  private async handoff(conv: Conversation, reason: string): Promise<void> {
    conv.humanHandoff = true;
    conv.state = ConversationState.HumanHandoff;
    await this.d.conversations.save(conv);
    await this.send(conv, ["Vou te transferir para um atendente humano para finalizar, tá? Já já alguém te responde."]);
    void reason;
  }
}
```

Nota: o `AgentDecision` precisa de um campo `extracted`. Atualize a porta `src/domain/ports/IAgentBrain.ts` adicionando ao `AgentDecision`:
`extracted?: { fullName?: string; cpf?: string; amount?: number };` e à união `AgentProposedAction` o membro `{ type: "request_identity" }` (já existe). Mantém compatível com o stub.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- ConversationStateMachine.identity`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/application/agent/ConversationStateMachine.ts src/domain/ports/IAgentBrain.ts src/infrastructure/config/env.ts tests/application/ConversationStateMachine.identity.test.ts
git commit -m "feat: Kaua state machine — identity collection + CPF validation"
```

---

## Task 5: `ConversationStateMachine` — comprovante, EmissionIntent e emissão

**Files:**
- Modify: `src/application/agent/ConversationStateMachine.ts` (implementar `handleComprovante` + emissão)
- Create: `src/domain/services/sanitizeFiscalText.ts`
- Test: `tests/application/ConversationStateMachine.emission.test.ts`

**Interfaces:**
- Produces: `sanitizeFiscalText(s: string): string` (remove `<>&"'`, colapsa espaços, corta em 200 chars).
- Consumes: `IComprovanteAnalyzer.analyze`, `IFiscalProvider.emitNfse`, `IServiceRepository`, `IMessagingProvider.sendMedia`.

- [ ] **Step 1: Escrever o teste de comprovante→emissão (happy + baixa confiança)**

```ts
import { describe, expect, it, vi } from "vitest";
import { ConversationState } from "../../src/domain/entities/ConversationState";
import { ConversationStateMachine, type StateMachineDeps } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

const integration = { id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000", fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const agentConfig: any = { id: "ag1", integrationId: "int1", name: "Kaua", instructions: "", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() };

function depsWith(repos: InMemoryRepositories): StateMachineDeps {
  return {
    brain: { decide: vi.fn(async () => ({ reply: [], action: { type: "reply" } })) },
    cpf: { lookupName: vi.fn() },
    comprovante: { analyze: vi.fn() },
    fiscal: { upsertCustomer: vi.fn(), emitNfse: vi.fn(async () => ({ success: true, fiscalKey: "MOCK123", pdfUrl: "mock://nfse/MOCK123.pdf", message: null })) },
    messaging: { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(), startTyping: vi.fn(), stopTyping: vi.fn() },
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services,
    config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 },
  };
}

function imageInbound(): InboundMessage {
  return { providerMessageId: "m2", from: "5511988887777", to: "5511999990000", kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() };
}

async function readyConversation(repos: InMemoryRepositories) {
  repos.seed({ integrations: [integration], services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta médica", price: 300, issCode: "0107" }], contacts: [{ id: "ct1", integrationId: "int1", whatsappNumber: "5511988887777", fullName: "João da Silva", cpf: "52998224725", cpfNameVerified: true, createdAt: new Date(), updatedAt: new Date() }] });
  const conv = await repos.conversations.getOrCreate("int1", "ct1", "5511988887777");
  conv.contactId = "ct1";
  conv.state = ConversationState.AwaitingComprovante;
  await repos.conversations.save(conv);
  return conv;
}

describe("ConversationStateMachine — comprovante/emissão", () => {
  it("comprovante confere → emite NFS-e (mock) e envia o PDF", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" });
    const conv = await readyConversation(repos);
    const sm = new ConversationStateMachine(deps);
    await sm.advance(conv, agentConfig, integration, imageInbound());

    expect(deps.fiscal.emitNfse).toHaveBeenCalledOnce();
    expect(deps.messaging.sendMedia).toHaveBeenCalledOnce();
    expect(conv.state).toBe(ConversationState.Done);
  });

  it("baixa confiança → handoff, não emite", async () => {
    const repos = new InMemoryRepositories();
    const deps = depsWith(repos);
    (deps.comprovante.analyze as any).mockResolvedValue({ amount: 300, payerName: "?", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.4, raw: "" });
    const conv = await readyConversation(repos);
    const sm = new ConversationStateMachine(deps);
    await sm.advance(conv, agentConfig, integration, imageInbound());

    expect(deps.fiscal.emitNfse).not.toHaveBeenCalled();
    expect(conv.state).toBe(ConversationState.HumanHandoff);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- ConversationStateMachine.emission`
Expected: FAIL (`handleComprovante: Task 5`).

- [ ] **Step 3: Criar `sanitizeFiscalText`**

```ts
/** Remove caracteres perigosos para XML/fiscal e limita o tamanho. */
export function sanitizeFiscalText(s: string): string {
  return (s ?? "").replace(/[<>&"']/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}
```

- [ ] **Step 4: Implementar `handleComprovante` + emissão no state machine**

Substitua o método `handleComprovante` (que lançava erro) por:

```ts
  private async handleComprovante(conv: Conversation, cfg: AgentConfig, integration: Integration, inbound: InboundMessage): Promise<void> {
    if (inbound.kind === "text" || !inbound.media) {
      await this.send(conv, ["Me envia o comprovante de pagamento como foto ou PDF, por favor."]);
      return;
    }
    conv.state = ConversationState.VerifyingComprovante;
    await this.d.conversations.save(conv);

    const services = await this.d.services.listByIntegration(integration.id);
    const service = services.find((s) => cfg.capabilities.linkedServiceIds.includes(s.id)) ?? services[0];
    if (!service) { await this.handoff(conv, "sem serviço vinculado"); return; }

    const analysis = await this.d.comprovante.analyze({
      media: { mimetype: inbound.media.mimetype, base64: inbound.media.base64, url: inbound.media.url },
      expectedRecipientDoc: integration.fiscalDoc, expectedRecipientName: integration.fiscalName,
    });

    const amountOk = analysis.amount != null && Math.abs(analysis.amount - service.price) < 0.01;
    const ok = analysis.recipientMatches && amountOk && analysis.confidence >= this.d.config.comprovanteMinConfidence;
    if (!ok) { await this.handoff(conv, `comprovante não confere (conf=${analysis.confidence})`); return; }

    const contact = await this.d.contacts.findByWhatsapp(integration.id, conv.whatsappNumber);
    const now = new Date();
    const intent = {
      id: randomUUID(), conversationId: conv.id, contactId: conv.contactId, integrationId: integration.id,
      status: "ready" as const,
      tomadorName: sanitizeFiscalText(contact?.fullName ?? ""), tomadorCpf: contact?.cpf ?? "",
      serviceId: service.id, description: sanitizeFiscalText(service.description), amount: service.price,
      paymentVerified: true, paymentConfidence: analysis.confidence,
      fiscalKey: null, pdfUrl: null, createdAt: now, updatedAt: now,
    };
    await this.d.emissions.save(intent);

    conv.state = ConversationState.Emitting;
    await this.d.conversations.save(conv);

    const result = await this.d.fiscal.emitNfse(intent);
    if (!result.success || !result.pdfUrl) { await this.handoff(conv, result.message ?? "falha na emissão"); return; }

    await this.d.emissions.save({ ...intent, status: "emitted", fiscalKey: result.fiscalKey, pdfUrl: result.pdfUrl, updatedAt: new Date() });
    await this.d.messaging.sendMedia({ to: conv.whatsappNumber, mimetype: "application/pdf", url: result.pdfUrl, filename: "nota-fiscal.pdf", caption: "Sua nota fiscal está pronta! ✅" });

    conv.state = ConversationState.Done;
    await this.d.conversations.save(conv);
  }
```

Adicione no topo do arquivo: `import { sanitizeFiscalText } from "../../domain/services/sanitizeFiscalText";`.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- ConversationStateMachine.emission`
Expected: PASS (2 testes).

- [ ] **Step 6: Commit**

```bash
git add src/application/agent/ConversationStateMachine.ts src/domain/services/sanitizeFiscalText.ts tests/application/ConversationStateMachine.emission.test.ts
git commit -m "feat: Kaua state machine — comprovante check, EmissionIntent + deterministic emit"
```

---

## Task 6: `HandleInboundMessage` — orquestração de entrada

**Files:**
- Modify: `src/application/use-cases/HandleInboundMessage.ts` (substituir stub)
- Test: `tests/application/HandleInboundMessage.test.ts`

**Interfaces:**
- Produces: `class HandleInboundMessage { constructor(deps: { integrations, agentConfigs, conversations, contacts, stateMachine: ConversationStateMachine }); execute(inbound: InboundMessage): Promise<void> }`
- Comportamento: resolve a `Integration` por `inbound.to`; ignora se inexistente/inativa; resolve/cria `Contact` por whatsapp e `Conversation`; persiste a mensagem inbound; delega ao `stateMachine.advance`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, expect, it, vi } from "vitest";
import { HandleInboundMessage } from "../../src/application/use-cases/HandleInboundMessage";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";

const integration = { id: "int1", displayName: "X", whatsappNumber: "5511999990000", fiscalDoc: "1", fiscalName: "X", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() };
const inbound: InboundMessage = { providerMessageId: "m1", from: "5511988887777", to: "5511999990000", kind: "text", text: "oi", media: null, timestamp: new Date() };

describe("HandleInboundMessage", () => {
  it("número desconhecido → não faz nada", async () => {
    const repos = new InMemoryRepositories();
    const sm = { advance: vi.fn() } as any;
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm });
    await uc.execute({ ...inbound, to: "0000" });
    expect(sm.advance).not.toHaveBeenCalled();
  });

  it("número conhecido → cria contato/conversa e chama o state machine", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({ integrations: [integration], agentConfigs: [{ id: "ag1", integrationId: "int1", name: "Kaua", instructions: "", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: [], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() } as any] });
    const sm = { advance: vi.fn() } as any;
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm });
    await uc.execute(inbound);
    expect(sm.advance).toHaveBeenCalledOnce();
    const contact = await repos.contacts.findByWhatsapp("int1", "5511988887777");
    expect(contact).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- HandleInboundMessage`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { ConversationStateMachine } from "../agent/ConversationStateMachine";
import type { InboundMessage } from "../../domain/ports/IMessagingProvider";
import type {
  IAgentConfigRepository, IContactRepository, IConversationRepository, IIntegrationRepository,
} from "../../domain/ports/repositories";
import { randomUUID } from "node:crypto";

export interface HandleInboundDeps {
  integrations: IIntegrationRepository;
  agentConfigs: IAgentConfigRepository;
  conversations: IConversationRepository;
  contacts: IContactRepository;
  stateMachine: ConversationStateMachine;
}

export class HandleInboundMessage {
  constructor(private readonly d: HandleInboundDeps) {}

  async execute(inbound: InboundMessage): Promise<void> {
    const integration = await this.d.integrations.getByWhatsappNumber(inbound.to);
    if (!integration || !integration.active) return;

    const agentConfig = await this.d.agentConfigs.getByIntegrationId(integration.id);
    if (!agentConfig) return;

    let contact = await this.d.contacts.findByWhatsapp(integration.id, inbound.from);
    const now = new Date();
    if (!contact) {
      contact = {
        id: randomUUID(), integrationId: integration.id, whatsappNumber: inbound.from,
        fullName: null, cpf: null, cpfNameVerified: false, createdAt: now, updatedAt: now,
      };
      await this.d.contacts.save(contact);
    }

    const conv = await this.d.conversations.getOrCreate(integration.id, contact.id, inbound.from);
    conv.lastInboundAt = now;
    await this.d.conversations.appendMessage({
      id: randomUUID(), conversationId: conv.id, direction: "inbound", author: "contact",
      kind: inbound.kind, body: inbound.text ?? `[${inbound.kind}]`, mediaUrl: inbound.media?.url ?? null, createdAt: now,
    });
    await this.d.conversations.save(conv);

    await this.d.stateMachine.advance(conv, agentConfig, integration, inbound);
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- HandleInboundMessage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/use-cases/HandleInboundMessage.ts tests/application/HandleInboundMessage.test.ts
git commit -m "feat: HandleInboundMessage orchestration"
```

---

## Task 7: Teste de aceite end-to-end (caminho feliz §7) contra mocks

**Files:**
- Test: `tests/acceptance/happyPath.test.ts`

**Interfaces:**
- Consumes: `HandleInboundMessage`, `ConversationStateMachine`, `InMemoryRepositories`, `MockFiscalProvider`, `MockCpfProvider`, fakes de `IAgentBrain`/`IComprovanteAnalyzer`/`IMessagingProvider`.

- [ ] **Step 1: Escrever o teste de aceite (a história do §7)**

```ts
import { describe, expect, it, vi } from "vitest";
import { HandleInboundMessage } from "../../src/application/use-cases/HandleInboundMessage";
import { ConversationStateMachine } from "../../src/application/agent/ConversationStateMachine";
import { InMemoryRepositories } from "../../src/infrastructure/persistence/memory/InMemoryRepositories";
import { MockFiscalProvider } from "../../src/infrastructure/fiscal/MockFiscalProvider";
import { MockCpfProvider } from "../../src/infrastructure/cpf/MockCpfProvider";
import type { InboundMessage } from "../../src/domain/ports/IMessagingProvider";
import { ConversationState } from "../../src/domain/entities/ConversationState";

describe("Aceite: caminho feliz do piloto (§7)", () => {
  it("conversa → coleta → valida → comprovante → emite → envia PDF", async () => {
    const repos = new InMemoryRepositories();
    repos.seed({
      integrations: [{ id: "int1", displayName: "Consultório X", whatsappNumber: "5511999990000", fiscalDoc: "12345678000199", fiscalName: "Consultório X LTDA", fiscalProviderRef: null, active: true, createdAt: new Date(), updatedAt: new Date() }],
      agentConfigs: [{ id: "ag1", integrationId: "int1", name: "Kaua", instructions: "Você é a secretária do consultório.", capabilities: { chat: true, fiscal: true, fiscalDocType: "nfse", linkedServiceIds: ["svc1"], agenda: false, agendaLink: null }, knowledgeFiles: [], fewShotDialogs: [], segment: "saude", tone: "equilibrado", emojis: true, lang: "pt", createdAt: new Date(), updatedAt: new Date() } as any],
      services: [{ id: "svc1", integrationId: "int1", code: "0107", description: "Consulta médica", price: 300, issCode: "0107" }],
    });

    const sentMedia: any[] = [];
    const messaging: any = { start: vi.fn(), getConnectionStatus: () => "connected", getQrCode: vi.fn(), onInboundMessage: vi.fn(), sendText: vi.fn(), sendMedia: vi.fn(async (m: any) => { sentMedia.push(m); }), startTyping: vi.fn(), stopTyping: vi.fn() };

    // cérebro determinístico: 1ª msg → request_identity; depois extrai nome+cpf
    const brain: any = { decide: vi.fn()
      .mockResolvedValueOnce({ reply: ["Oi! Posso emitir sua nota. Me manda nome completo e CPF?"], action: { type: "request_identity" } })
      .mockResolvedValue({ reply: ["Obrigado!"], action: { type: "reply" }, extracted: { fullName: "João da Silva", cpf: "529.982.247-25" } }) };
    const comprovante: any = { analyze: vi.fn(async () => ({ amount: 300, payerName: "João da Silva", recipientDoc: "12345678000199", recipientMatches: true, confidence: 0.95, raw: "" })) };
    const cpf = new MockCpfProvider({ "52998224725": "João da Silva" });
    const fiscal = new MockFiscalProvider();

    const sm = new ConversationStateMachine({ brain, cpf, comprovante, fiscal, messaging, contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services, config: { cpfMaxAttempts: 2, comprovanteMinConfidence: 0.8 } });
    const uc = new HandleInboundMessage({ integrations: repos.integrations, agentConfigs: repos.agentConfigs, conversations: repos.conversations, contacts: repos.contacts, stateMachine: sm });

    const from = "5511988887777"; const to = "5511999990000";
    const text = (t: string): InboundMessage => ({ providerMessageId: "x", from, to, kind: "text", text: t, media: null, timestamp: new Date() });

    await uc.execute(text("agendei e já paguei, e a nota?")); // → request_identity
    await uc.execute(text("João da Silva, 529.982.247-25")); // valida + cria cliente
    await uc.execute({ providerMessageId: "img", from, to, kind: "image", text: null, media: { mimetype: "image/jpeg", base64: "AAAA" }, timestamp: new Date() }); // comprovante → emite

    expect(sentMedia).toHaveLength(1);
    expect(sentMedia[0].mimetype).toBe("application/pdf");
    const conv = await repos.conversations.getOrCreate("int1", "x", from);
    expect(conv.state).toBe(ConversationState.Done);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npm test -- happyPath`
Expected: PASS. (Se falhar, é bug real de integração das tarefas 3-6 — corrigir antes de seguir.)

- [ ] **Step 3: Rodar a suíte inteira + typecheck**

Run: `npm test` e `npm run typecheck`
Expected: tudo PASS, zero erro de tipo.

- [ ] **Step 4: Commit**

```bash
git add tests/acceptance/happyPath.test.ts
git commit -m "test: end-to-end happy path acceptance (spec §7)"
```

---

> ⚠️ **ATUALIZAÇÃO pós-spec (IA agnóstica de provedor):** o esqueleto JÁ tem a estrutura nova — `src/domain/ports/IAIProvider.ts`, `src/infrastructure/ai/OpenAIProvider.ts` (ÚNICO acoplado à OpenAI), `AgentBrain.ts` e `ComprovanteAnalyzer.ts` (dependem de `IAIProvider`, não do SDK). O modelo vem de `env.AI_MODEL_CHAT` / `env.AI_MODEL_VISION`. As Tasks 8 e 9 abaixo estão na versão ANTIGA (cliente OpenAI embutido) — **execute-as assim:** (8) testar `OpenAIProvider` com um cliente OpenAI fake + testar `AgentBrain` com um `IAIProvider` fake; (9) testar `ComprovanteAnalyzer` com `IAIProvider` fake. A lógica de tool-calling/visão já está implementada no esqueleto; aqui é só cobrir com teste.

## Task 8: Adapter OpenAI — `OpenAiAgentBrain`

**Files:**
- Modify: `src/infrastructure/ai/OpenAiAgentBrain.ts` (substituir stub)
- Test: `tests/infrastructure/ai/OpenAiAgentBrain.test.ts`

**Interfaces:**
- Produces: `OpenAiAgentBrain implements IAgentBrain`. Usa OpenAI Chat Completions com uma **tool** `propose_next` cujos argumentos retornam `{ reply: string[], action, extracted? }`. O cliente OpenAI é injetado (testável).
- Consumes: `AgentContext`, `AgentDecision` de `IAgentBrain`.

- [ ] **Step 1: Escrever o teste (cliente OpenAI mockado)**

```ts
import { describe, expect, it, vi } from "vitest";
import { OpenAiAgentBrain } from "../../../src/infrastructure/ai/OpenAiAgentBrain";

describe("OpenAiAgentBrain", () => {
  it("traduz tool_call em AgentDecision", async () => {
    const fakeClient: any = { chat: { completions: { create: vi.fn(async () => ({
      choices: [{ message: { tool_calls: [{ function: { name: "propose_next", arguments: JSON.stringify({ reply: ["Me manda nome e CPF"], action: { type: "request_identity" }, extracted: {} }) } }] } }],
    })) } } };
    const brain = new OpenAiAgentBrain(fakeClient, "gpt-4o");
    const decision = await brain.decide({ systemInstructions: "x", state: "new", history: [], collected: {} } as any);
    expect(decision.reply).toEqual(["Me manda nome e CPF"]);
    expect(decision.action).toEqual({ type: "request_identity" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- OpenAiAgentBrain`
Expected: FAIL (stub lança "não implementado").

- [ ] **Step 3: Implementar (cliente injetado; sem instanciar SDK no construtor)**

```ts
import type { AgentContext, AgentDecision, IAgentBrain } from "../../domain/ports/IAgentBrain";

/** Interface mínima do cliente OpenAI que usamos (facilita teste). */
export interface OpenAiChatClient {
  chat: { completions: { create(args: unknown): Promise<{ choices: { message: { tool_calls?: { function: { name: string; arguments: string } }[]; content?: string | null } }[] }> } };
}

const TOOL = {
  type: "function",
  function: {
    name: "propose_next",
    description: "Responde o cliente e propõe a próxima ação. NUNCA emite nota — só propõe.",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "array", items: { type: "string" }, description: "Bolhas de texto em PT-BR para enviar ao cliente." },
        action: { type: "object", properties: { type: { type: "string", enum: ["reply", "request_identity", "request_comprovante", "ready_to_emit", "handoff"] }, reason: { type: "string" } }, required: ["type"] },
        extracted: { type: "object", properties: { fullName: { type: "string" }, cpf: { type: "string" }, amount: { type: "number" } } },
      },
      required: ["reply", "action"],
    },
  },
} as const;

export class OpenAiAgentBrain implements IAgentBrain {
  constructor(private readonly client: OpenAiChatClient, private readonly model: string) {}

  async decide(context: AgentContext): Promise<AgentDecision> {
    const system = `${context.systemInstructions}\nVocê é o Kaua, atendente de WhatsApp. Estado atual: ${context.state}. Responda em PT-BR, curto. Quando o cliente quiser a nota, use action request_identity e peça nome completo + CPF. Ao receber nome e CPF, devolva-os em "extracted". NUNCA diga que emitiu a nota — quem emite é o sistema.`;
    const messages = [
      { role: "system", content: system },
      ...context.history.map((m) => ({ role: m.author === "contact" ? "user" : "assistant", content: m.body })),
    ];
    const res = await this.client.chat.completions.create({ model: this.model, messages, tools: [TOOL], tool_choice: { type: "function", function: { name: "propose_next" } } });
    const call = res.choices[0]?.message.tool_calls?.[0];
    if (!call) return { reply: [res.choices[0]?.message.content ?? "Pode repetir?"], action: { type: "reply" } };
    const args = JSON.parse(call.function.arguments) as AgentDecision;
    return { reply: args.reply ?? [], action: args.action ?? { type: "reply" }, extracted: args.extracted };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- OpenAiAgentBrain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/ai/OpenAiAgentBrain.ts tests/infrastructure/ai/OpenAiAgentBrain.test.ts
git commit -m "feat: OpenAI agent brain adapter (tool-calling, injected client)"
```

---

## Task 9: Adapter OpenAI — `OpenAiComprovanteAnalyzer` (visão)

**Files:**
- Modify: `src/infrastructure/ai/OpenAiComprovanteAnalyzer.ts` (substituir stub)
- Test: `tests/infrastructure/ai/OpenAiComprovanteAnalyzer.test.ts`

**Interfaces:**
- Produces: `OpenAiComprovanteAnalyzer implements IComprovanteAnalyzer`, cliente injetado, usa visão (imagem via data URL base64) + tool `extract_receipt` → `ComprovanteAnalysis`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, expect, it, vi } from "vitest";
import { OpenAiComprovanteAnalyzer } from "../../../src/infrastructure/ai/OpenAiComprovanteAnalyzer";

describe("OpenAiComprovanteAnalyzer", () => {
  it("traduz tool_call em ComprovanteAnalysis e cruza recebedor", async () => {
    const client: any = { chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { tool_calls: [{ function: { name: "extract_receipt", arguments: JSON.stringify({ amount: 300, payerName: "João", recipientDoc: "12345678000199", confidence: 0.9 }) } }] } }] })) } } };
    const a = new OpenAiComprovanteAnalyzer(client, "gpt-4o");
    const r = await a.analyze({ media: { mimetype: "image/jpeg", base64: "AAAA" }, expectedRecipientDoc: "12.345.678/0001-99", expectedRecipientName: "Consultório X" });
    expect(r.amount).toBe(300);
    expect(r.recipientMatches).toBe(true); // dígitos batem
    expect(r.confidence).toBe(0.9);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- OpenAiComprovanteAnalyzer`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { ComprovanteAnalysis, ComprovanteInput, IComprovanteAnalyzer } from "../../domain/ports/IComprovanteAnalyzer";
import type { OpenAiChatClient } from "./OpenAiAgentBrain";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const TOOL = {
  type: "function",
  function: {
    name: "extract_receipt",
    description: "Extrai dados do comprovante de pagamento.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Valor pago em BRL" },
        payerName: { type: "string" },
        recipientDoc: { type: "string", description: "CNPJ/CPF do recebedor (só dígitos)" },
        confidence: { type: "number", description: "0 a 1, sua confiança na leitura" },
      },
      required: ["confidence"],
    },
  },
} as const;

export class OpenAiComprovanteAnalyzer implements IComprovanteAnalyzer {
  constructor(private readonly client: OpenAiChatClient, private readonly model: string) {}

  async analyze(input: ComprovanteInput): Promise<ComprovanteAnalysis> {
    const dataUrl = input.media.url ?? `data:${input.media.mimetype};base64,${input.media.base64}`;
    const messages = [
      { role: "system", content: "Você lê comprovantes de pagamento (PIX/transferência) e extrai valor, pagador e recebedor. Seja conservador na confiança." },
      { role: "user", content: [
        { type: "text", text: `Recebedor esperado: ${input.expectedRecipientName} (${input.expectedRecipientDoc}). Extraia os dados.` },
        { type: "image_url", image_url: { url: dataUrl } },
      ] },
    ];
    const res = await this.client.chat.completions.create({ model: this.model, messages, tools: [TOOL], tool_choice: { type: "function", function: { name: "extract_receipt" } } });
    const call = res.choices[0]?.message.tool_calls?.[0];
    if (!call) return { amount: null, payerName: null, recipientDoc: null, recipientMatches: false, confidence: 0, raw: res.choices[0]?.message.content ?? "" };
    const a = JSON.parse(call.function.arguments) as { amount?: number; payerName?: string; recipientDoc?: string; confidence?: number };
    const recipientMatches = onlyDigits(a.recipientDoc) === onlyDigits(input.expectedRecipientDoc) && onlyDigits(a.recipientDoc).length > 0;
    return { amount: a.amount ?? null, payerName: a.payerName ?? null, recipientDoc: a.recipientDoc ?? null, recipientMatches, confidence: a.confidence ?? 0, raw: call.function.arguments };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- OpenAiComprovanteAnalyzer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/ai/OpenAiComprovanteAnalyzer.ts tests/infrastructure/ai/OpenAiComprovanteAnalyzer.test.ts
git commit -m "feat: OpenAI comprovante (vision) analyzer adapter"
```

---

## Task 10: Adapter Evolution — mapper de webhook + `EvolutionMessagingProvider`

**Files:**
- Create: `src/infrastructure/messaging/evolution/webhookMapper.ts`
- Create: `src/infrastructure/messaging/evolution/EvolutionMessagingProvider.ts`
- Modify: `src/infrastructure/config/env.ts` (vars do Evolution)
- Test: `tests/infrastructure/messaging/webhookMapper.test.ts`, `tests/infrastructure/messaging/EvolutionMessagingProvider.test.ts`

**Interfaces:**
- Produces:
  - `mapEvolutionWebhook(body: unknown): InboundMessage | null` — converte evento `messages.upsert` do Evolution v2 em `InboundMessage`; retorna null para eventos irrelevantes (fromMe, sem mensagem).
  - `EvolutionMessagingProvider implements IMessagingProvider` — `sendText`/`sendMedia` via `POST {base}/message/sendText/{instance}` e `/message/sendMedia/{instance}` com header `apikey`; `getQrCode` via `GET {base}/instance/connect/{instance}`; `onInboundMessage` registra handler (chamado pelo servidor HTTP no webhook); `start` é no-op (instância já criada no Evolution).
- **Verificação:** os nomes de campo do payload Evolution v2 (`event`, `data.key.remoteJid`, `data.key.fromMe`, `data.message.conversation`, `data.messageType`) devem ser confirmados contra a doc da instância Evolution em uso (https://doc.evolution-api.com) — ver Step 1.

- [ ] **Step 1: Confirmar o shape do webhook do Evolution v2**

Suba/abra a instância Evolution alvo e dispare uma mensagem de teste com `WEBHOOK` apontando para um endpoint de captura (ex.: webhook.site). Anote o JSON real do evento `messages.upsert`. O mapper abaixo assume o shape padrão v2; ajuste os caminhos se a sua versão divergir. (Sem instância à mão, prossiga com o shape padrão e valide no Task 12.)

- [ ] **Step 2: Escrever o teste do mapper**

```ts
import { describe, expect, it } from "vitest";
import { mapEvolutionWebhook } from "../../../src/infrastructure/messaging/evolution/webhookMapper";

const sample = {
  event: "messages.upsert",
  instance: "megus",
  data: { key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "ABC" }, pushName: "João", messageType: "conversation", message: { conversation: "oi" } },
  sender: "5511999990000@s.whatsapp.net",
};

describe("mapEvolutionWebhook", () => {
  it("mapeia texto inbound", () => {
    const m = mapEvolutionWebhook(sample);
    expect(m).not.toBeNull();
    expect(m?.from).toBe("5511988887777");
    expect(m?.to).toBe("5511999990000");
    expect(m?.kind).toBe("text");
    expect(m?.text).toBe("oi");
  });
  it("ignora fromMe", () => {
    expect(mapEvolutionWebhook({ ...sample, data: { ...sample.data, key: { ...sample.data.key, fromMe: true } } })).toBeNull();
  });
  it("ignora evento não-mensagem", () => {
    expect(mapEvolutionWebhook({ event: "connection.update", data: {} })).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- webhookMapper`
Expected: FAIL.

- [ ] **Step 4: Implementar o mapper**

```ts
import type { InboundKind, InboundMessage } from "../../../domain/ports/IMessagingProvider";

const jidToNumber = (jid: string | undefined): string => (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";

const KIND: Record<string, InboundKind> = {
  conversation: "text", extendedTextMessage: "text",
  imageMessage: "image", audioMessage: "audio", documentMessage: "document",
};

export function mapEvolutionWebhook(body: unknown): InboundMessage | null {
  const b = body as any;
  if (!b || b.event !== "messages.upsert" || !b.data) return null;
  const data = b.data;
  if (data.key?.fromMe) return null;

  const type = data.messageType as string | undefined;
  const kind = (type && KIND[type]) ?? "text";
  const msg = data.message ?? {};
  const text: string | null =
    msg.conversation ?? msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ?? msg.documentMessage?.caption ?? null;

  const mediaB64: string | undefined = data.message?.base64 ?? data.base64;
  const mimetype: string | undefined =
    msg.imageMessage?.mimetype ?? msg.audioMessage?.mimetype ?? msg.documentMessage?.mimetype;

  return {
    providerMessageId: String(data.key?.id ?? ""),
    from: jidToNumber(data.key?.remoteJid),
    to: jidToNumber(b.sender ?? b.instanceNumber),
    kind,
    text: kind === "text" ? text : text,
    media: kind === "text" ? null : { mimetype: mimetype ?? "application/octet-stream", base64: mediaB64 },
    timestamp: new Date(),
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- webhookMapper`
Expected: PASS (3 testes).

- [ ] **Step 6: Adicionar env do Evolution**

Em `src/infrastructure/config/env.ts` adicione: `EVOLUTION_BASE_URL: z.string().optional()`, `EVOLUTION_API_KEY: z.string().optional()`, `EVOLUTION_INSTANCE: z.string().default("megus")`.

- [ ] **Step 7: Escrever o teste do provider (fetch mockado)**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EvolutionMessagingProvider } from "../../../src/infrastructure/messaging/evolution/EvolutionMessagingProvider";

describe("EvolutionMessagingProvider", () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it("sendText faz POST no endpoint certo com apikey", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" })) as any;
    vi.stubGlobal("fetch", fetchMock);
    const p = new EvolutionMessagingProvider({ baseUrl: "http://evo:8080", apiKey: "k", instance: "megus" });
    await p.sendText({ to: "5511988887777", text: "oi" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://evo:8080/message/sendText/megus");
    expect((opts as any).headers.apikey).toBe("k");
    expect(JSON.parse((opts as any).body).text).toBe("oi");
  });
});
```

- [ ] **Step 8: Implementar o provider**

```ts
import type {
  ConnectionStatus, IMessagingProvider, InboundMessage, OutboundMedia, OutboundText,
} from "../../../domain/ports/IMessagingProvider";

export interface EvolutionConfig { baseUrl: string; apiKey: string; instance: string }

export class EvolutionMessagingProvider implements IMessagingProvider {
  private handler: ((m: InboundMessage) => Promise<void>) | null = null;
  constructor(private readonly cfg: EvolutionConfig) {}

  async start(): Promise<void> { /* instância criada/conectada no Evolution; no-op */ }
  getConnectionStatus(): ConnectionStatus { return "connected"; }

  async getQrCode(): Promise<string | null> {
    const res = await this.req(`/instance/connect/${this.cfg.instance}`, "GET");
    return (res?.base64 as string) ?? (res?.qrcode?.base64 as string) ?? null;
  }

  onInboundMessage(handler: (m: InboundMessage) => Promise<void>): void { this.handler = handler; }
  /** chamado pelo servidor HTTP quando o webhook do Evolution chega. */
  async dispatchInbound(m: InboundMessage): Promise<void> { await this.handler?.(m); }

  async sendText(msg: OutboundText): Promise<void> {
    await this.req(`/message/sendText/${this.cfg.instance}`, "POST", { number: msg.to, text: msg.text });
  }
  async sendMedia(msg: OutboundMedia): Promise<void> {
    await this.req(`/message/sendMedia/${this.cfg.instance}`, "POST", {
      number: msg.to,
      mediatype: msg.mimetype.startsWith("image") ? "image" : "document",
      mimetype: msg.mimetype, media: msg.url ?? msg.base64, fileName: msg.filename, caption: msg.caption,
    });
  }
  async startTyping(_to: string): Promise<void> { /* opcional no Evolution */ }
  async stopTyping(_to: string): Promise<void> { /* opcional */ }

  private async req(path: string, method: "GET" | "POST", body?: unknown): Promise<any> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: this.cfg.apiKey },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Evolution ${method} ${path} → ${res.status}: ${await res.text()}`);
    return res.json().catch(() => ({}));
  }
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `npm test -- EvolutionMessagingProvider`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/infrastructure/messaging/evolution tests/infrastructure/messaging src/infrastructure/config/env.ts
git commit -m "feat: Evolution API messaging adapter + webhook mapper"
```

---

## Task 11: Servidor HTTP — webhook, /qr, /health

**Files:**
- Create: `src/infrastructure/http/server.ts`
- Test: `tests/infrastructure/http/server.test.ts`

**Interfaces:**
- Produces: `createServer(deps: { onWebhook(body): Promise<void>; getQr(): Promise<string|null> }): http.Server`. Rotas: `POST /webhook/evolution` (body JSON → `onWebhook`, responde 200 sempre — o Evolution faz retry em não-2xx), `GET /qr` (HTML/JSON com o QR), `GET /health`.
- Usa apenas `node:http` (sem framework) para minimizar deps.

- [ ] **Step 1: Escrever o teste (sobe o servidor numa porta efêmera)**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../../src/infrastructure/http/server";
import type { Server } from "node:http";

let server: Server;
afterEach(() => server?.close());

function listen(s: Server): Promise<number> {
  return new Promise((res) => s.listen(0, () => res((s.address() as any).port)));
}

describe("http server", () => {
  it("POST /webhook/evolution chama onWebhook e responde 200", async () => {
    const onWebhook = vi.fn(async () => {});
    server = createServer({ onWebhook, getQr: async () => null });
    const port = await listen(server);
    const res = await fetch(`http://localhost:${port}/webhook/evolution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "messages.upsert" }) });
    expect(res.status).toBe(200);
    expect(onWebhook).toHaveBeenCalledOnce();
  });
  it("GET /health responde ok", async () => {
    server = createServer({ onWebhook: async () => {}, getQr: async () => null });
    const port = await listen(server);
    const res = await fetch(`http://localhost:${port}/health`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- http/server`
Expected: FAIL.

- [ ] **Step 3: Implementar o servidor**

```ts
import http, { type Server } from "node:http";

export interface HttpDeps {
  onWebhook(body: unknown): Promise<void>;
  getQr(): Promise<string | null>;
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5_000_000) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}

export function createServer(deps: HttpDeps): Server {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/webhook/evolution") {
        const body = await readJson(req);
        // responde já; processa sem bloquear o ack do Evolution
        res.writeHead(200).end("ok");
        deps.onWebhook(body).catch((e) => console.error("webhook erro:", e));
        return;
      }
      if (req.method === "GET" && req.url === "/qr") {
        const qr = await deps.getQr();
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(qr ? `<img src="${qr}" alt="QR"/>` : "<p>Sem QR (já conectado?)</p>");
        return;
      }
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(404).end("not found");
    } catch (e) {
      console.error(e);
      res.writeHead(500).end("error");
    }
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- http/server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/http/server.ts tests/infrastructure/http/server.test.ts
git commit -m "feat: minimal HTTP server (webhook, qr, health)"
```

---

## Task 11.5: Dev injection (opção 3 — testar o fluxo sem WhatsApp)

**Files:**
- Create: `src/infrastructure/messaging/LogMessagingProvider.ts`
- Modify: `src/infrastructure/http/server.ts` (rota `POST /dev/inbound` + dep `onDevInbound`)
- Test: `tests/infrastructure/messaging/LogMessagingProvider.test.ts`

**Interfaces:**
- `LogMessagingProvider implements IMessagingProvider` — guarda outbound em `sent[]` e faz `console.log` (não envia). `getConnectionStatus()` = "connected".
- `createServer` ganha dep opcional `onDevInbound?(body): Promise<void>`; rota `POST /dev/inbound` body `{ from, to, kind, text?, media? }` → chama `onDevInbound`.

- [ ] **Step 1: Teste do LogMessagingProvider**

```ts
import { describe, expect, it } from "vitest";
import { LogMessagingProvider } from "../../../src/infrastructure/messaging/LogMessagingProvider";

describe("LogMessagingProvider", () => {
  it("guarda o outbound em vez de enviar", async () => {
    const p = new LogMessagingProvider();
    await p.sendText({ to: "5511988887777", text: "oi" });
    expect(p.sent).toHaveLength(1);
    expect(p.getConnectionStatus()).toBe("connected");
  });
});
```

- [ ] **Step 2: Implementar `LogMessagingProvider`**

```ts
import type { ConnectionStatus, IMessagingProvider, InboundMessage, OutboundMedia, OutboundText } from "../../domain/ports/IMessagingProvider";

/** Mensageria de DEV: loga o outbound em vez de enviar (testar o Kaua sem WhatsApp). */
export class LogMessagingProvider implements IMessagingProvider {
  readonly sent: (OutboundText | OutboundMedia)[] = [];
  private handler: ((m: InboundMessage) => Promise<void>) | null = null;
  async start(): Promise<void> {}
  getConnectionStatus(): ConnectionStatus { return "connected"; }
  async getQrCode(): Promise<string | null> { return null; }
  onInboundMessage(handler: (m: InboundMessage) => Promise<void>): void { this.handler = handler; }
  async dispatchInbound(m: InboundMessage): Promise<void> { await this.handler?.(m); }
  async sendText(msg: OutboundText): Promise<void> { this.sent.push(msg); console.log(`[Kaua → ${msg.to}] ${msg.text}`); }
  async sendMedia(msg: OutboundMedia): Promise<void> { this.sent.push(msg); console.log(`[Kaua → ${msg.to}] [mídia ${msg.mimetype}] ${msg.caption ?? ""} ${msg.url ?? ""}`); }
  async startTyping(): Promise<void> {}
  async stopTyping(): Promise<void> {}
}
```

- [ ] **Step 3: Rodar e ver passar.** `npm test -- LogMessagingProvider` → PASS.
- [ ] **Step 4: Adicionar a rota `/dev/inbound`** em `server.ts`: estender `HttpDeps` com `onDevInbound?(body: unknown): Promise<void>` e tratar `POST /dev/inbound` igual ao webhook (lê JSON, responde 200, chama `onDevInbound`). No `main.ts` (Task 12), quando `MESSAGING_PROVIDER=none`/dev, usar `LogMessagingProvider` e cabear `onDevInbound` → `mapDev(body)` → `handle.execute`. Permite: `curl -X POST localhost:3000/dev/inbound -d '{"from":"5511...","to":"<num do piloto>","kind":"text","text":"quero a nota"}'`.
- [ ] **Step 5: Commit.** `git commit -m "feat: dev inbound injection + LogMessagingProvider"`

---

## Task 12: Composition root — wiring real + seed do piloto

**Files:**
- Modify: `src/main.ts`
- Modify: `.env.example` (vars do Evolution + CPF_MAX_ATTEMPTS)
- Modify: `package.json` (dep `openai`) — já presente; confirmar.

**Interfaces:**
- Consumes: tudo das tarefas anteriores. Liga: env → OpenAI client → adapters → `InMemoryRepositories` (seed do piloto) → `ConversationStateMachine` → `HandleInboundMessage` → `EvolutionMessagingProvider` → `createServer`.
- **Nota:** sem teste automatizado (é o root). Verificação é manual (Step 4) + a suíte das tarefas anteriores cobre as unidades.

- [ ] **Step 1: Reescrever `src/main.ts`**

```ts
import OpenAI from "openai";
import pino from "pino";
import { env } from "./infrastructure/config/env";
import { InMemoryRepositories } from "./infrastructure/persistence/memory/InMemoryRepositories";
import { MockCpfProvider } from "./infrastructure/cpf/MockCpfProvider";
import { MockFiscalProvider } from "./infrastructure/fiscal/MockFiscalProvider";
import { OpenAIProvider } from "./infrastructure/ai/OpenAIProvider";
import { AgentBrain } from "./infrastructure/ai/AgentBrain";
import { ComprovanteAnalyzer } from "./infrastructure/ai/ComprovanteAnalyzer";
import { EvolutionMessagingProvider } from "./infrastructure/messaging/evolution/EvolutionMessagingProvider";
import { mapEvolutionWebhook } from "./infrastructure/messaging/evolution/webhookMapper";
import { ConversationStateMachine } from "./application/agent/ConversationStateMachine";
import { HandleInboundMessage } from "./application/use-cases/HandleInboundMessage";
import { createServer } from "./infrastructure/http/server";

async function bootstrap(): Promise<void> {
  const logger = pino({ level: env.LOG_LEVEL });
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY }) as any;

  const repos = new InMemoryRepositories();
  // TODO: seed do piloto (integração + agentConfig + serviço + CPF mock). Ver Step 2.

  const messaging = new EvolutionMessagingProvider({
    baseUrl: env.EVOLUTION_BASE_URL ?? "", apiKey: env.EVOLUTION_API_KEY ?? "", instance: env.EVOLUTION_INSTANCE,
  });

  const ai = new OpenAIProvider(openai);
  const stateMachine = new ConversationStateMachine({
    brain: new AgentBrain(ai, env.AI_MODEL_CHAT),
    cpf: new MockCpfProvider({ "54625255830": "Pietro Augusto Mota Alkmin" }),
    comprovante: new ComprovanteAnalyzer(ai, env.AI_MODEL_VISION),
    fiscal: new MockFiscalProvider(),
    messaging,
    contacts: repos.contacts, conversations: repos.conversations, emissions: repos.emissions, services: repos.services,
    config: { cpfMaxAttempts: env.CPF_MAX_ATTEMPTS, comprovanteMinConfidence: env.COMPROVANTE_MIN_CONFIDENCE },
  });

  const handle = new HandleInboundMessage({
    integrations: repos.integrations, agentConfigs: repos.agentConfigs,
    conversations: repos.conversations, contacts: repos.contacts, stateMachine,
  });

  const server = createServer({
    onWebhook: async (body) => {
      const inbound = mapEvolutionWebhook(body);
      if (inbound) await handle.execute(inbound);
    },
    getQr: () => messaging.getQrCode(),
  });
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, "Megus AI no ar — webhook /webhook/evolution, QR em /qr"));
}

bootstrap().catch((err) => { console.error("Falha no boot:", err); process.exit(1); });
```

- [ ] **Step 2: Adicionar o seed do piloto**

Substitua o comentário `// TODO: seed do piloto` por `repos.seed({...})` com os **dados reais do piloto**:
- `Integration`: `fiscalDoc: "66008326000173"`, `fiscalName: "Kapty (consultório)"`, `whatsappNumber: <número do WhatsApp do piloto>`, `active: true`.
- `Service`: `{ description: "Massagem", price: 180, code/issCode conforme cadastro }`.
- `AgentConfig`: `name: "Kaua"`, `capabilities.fiscal: true`, `fiscalDocType: "nfse"`, `linkedServiceIds: [<id do serviço>]`, `instructions` da secretária do consultório.
- `MockCpfProvider({ "54625255830": "Pietro Augusto Mota Alkmin" })` (CPF de teste já no wiring do Step 1).

- [ ] **Step 3: Atualizar `.env.example`**

Adicione: `EVOLUTION_BASE_URL=`, `EVOLUTION_API_KEY=`, `EVOLUTION_INSTANCE=megus`, `CPF_MAX_ATTEMPTS=2`.

- [ ] **Step 4: Verificação manual (smoke)**

Run: `npm run typecheck` (deve passar). Depois, com `OPENAI_API_KEY` e o Evolution no ar apontando o webhook para `http://<host>:<PORT>/webhook/evolution`: rode `npm run dev`, abra `/qr`, pareie o número, e mande "quero a nota" pelo WhatsApp → confirme que o Kaua responde pedindo nome+CPF. (Sem Evolution à mão, o `npm run typecheck` + a suíte de testes são o gate; o smoke fica para quando a instância subir.)

- [ ] **Step 5: Commit**

```bash
git add src/main.ts .env.example
git commit -m "feat: composition root wiring (Evolution + OpenAI + mocks + HTTP)"
```

---

## Task 13 (pós-demo): Persistência Azure SQL

> Só após o caminho feliz demonstrável (Tasks 1-12). Troca os repos in-memory por **Azure SQL** (free tier, já criado: `megusdata.database.windows.net` / `megusDB`) sem tocar em Domain/Application.

**Files:**
- Create: `src/infrastructure/persistence/azuresql/*` (schema + repos implementando as mesmas interfaces de `repositories.ts`)
- Modify: `src/main.ts` (escolher repos por env: in-memory vs Azure SQL quando `DATABASE_URL` presente)
- Modify: `package.json` (`mssql` / node-mssql, OU Prisma provider `sqlserver`)
- Test: testes de integração contra o Azure SQL

- [ ] **Step 1:** Traduzir a connection string ADO.NET do Azure pro formato Node (`mssql`: objeto `{ server, database, user, password, options: { encrypt: true } }`; Prisma: `sqlserver://...;encrypt=true`). Liberar o **IP de saída do VPS + IP de dev** no firewall do Azure SQL. ⚠️ Free tier serverless tem **auto-pause** → cold-start na 1ª query; habilitar retry/connection-timeout.
- [ ] **Step 2:** Modelar as tabelas espelhando `Integration, AgentConfig, Service, Contact, Conversation, Message, EmissionIntent`.
- [ ] **Step 3:** Implementar cada repositório Azure SQL com os MESMOS contratos das interfaces (TDD contra o banco).
- [ ] **Step 4:** No `main.ts`, selecionar `InMemoryRepositories` vs Azure SQL por `env.DATABASE_URL` presente.
- [ ] **Step 5:** `npm test` + smoke. Commit.

---

## Self-Review (preenchido)

**1. Cobertura do spec:**
- §2 inbound-only, coleta/validação, comprovante, emissão mock, PDF, handoff → Tasks 4-7, 10-12. ✓
- §4.1 determinístico + LLM-helper → state machine (4,5) decide; brain (8) só propõe/extrai. ✓
- §4.2 estados/transições → Tasks 4,5 (New→...→Done, HumanHandoff). ✓
- §4.3 portões (CPF dígito+nome 2 tentativas; comprovante recebedor+valor+confiança; sanitização) → Tasks 2,4,5. ✓
- §4.4 EmissionIntent + disparo (LLM fora) → Task 5. ✓
- §4.5 dedup por CPF, handoff → Tasks 3,4,5,6. ✓
- §3 mensageria Evolution dual-mode, fiscal/CPF mock → Tasks 8-12. ✓
- §7 aceite → Task 7. ✓
- **Gap conhecido (consciente):** "coalescer turno" (§4.5) e a fila assíncrona de emissão (§4.4) estão SIMPLIFICADOS no MVP (emissão inline; sem buffer de turno) — aceitável para o caminho feliz da demo; anotar como dívida pós-demo. Áudio→Whisper não está no caminho feliz (comprovante é imagem/PDF); adicionar depois se o cliente mandar áudio.

**2. Placeholders:** nenhum "TBD/TODO" em passo de código; o único `// TODO` é o seed do piloto (Task 12 Step 2), que tem instrução explícita de preenchimento com dados reais.

**3. Consistência de tipos:** `ConversationStateMachine`/`StateMachineDeps`, `HandleInboundDeps`, `OpenAiChatClient`, `EvolutionConfig`, `mapEvolutionWebhook` e os contratos de porta (`IAgentBrain.decide` com `extracted`, `IComprovanteAnalyzer.analyze`, `IFiscalProvider.emitNfse/upsertCustomer`) batem entre as tarefas. `AgentDecision.extracted` foi adicionado na Task 4 e consumido nas Tasks 4,5,8.

**Risco principal:** o shape do webhook do Evolution v2 (Task 10) — mitigado pelo Step 1 de captura real e pela verificação no smoke (Task 12).
