# Fase 6 — Fix A: PUT /api/agente cria a integração "Padrão" se não houver — Report

Branch: `feat/kaua-cerebro`.

## Bug

No fluxo de cadastro do zero, uma empresa nova ainda não tem `Integration` (ela só nasce hoje via `PrismaCompanyServiceRepository.ensureDefaultIntegration`, disparado ao salvar um serviço). Como `PUT /api/agente` dependia de `getFirstByCompanyId` e 404-ava quando não achava nada, configurar a persona do agente **antes** de cadastrar um serviço quebrava com `404 "Nenhuma integração encontrada para esta empresa."`. A ordem de cadastro (agente x serviço x WhatsApp) não deveria importar.

## O que mudou

- `src/domain/ports/repositories.ts` — novo método na interface `IIntegrationRepository`:
  `ensureDefaultForCompany(companyId: string): Promise<Integration>` — devolve a 1ª integração da empresa ou cria uma "Padrão".
- `src/infrastructure/persistence/prisma/PrismaIntegrationRepository.ts` — implementação real: `findFirst({ where: { companyId }, orderBy: { createdAt: "asc" }, include: { Company } })`; se não achar, `prisma.integration.create` com `id: "int_"+randomUUID().slice(0,8)`, `displayName: "Padrão"`, `whatsappNumber: ""`, `evolutionInstance: ""`, `active: true` (mesmo padrão já usado em `PrismaCompanyServiceRepository.ensureDefaultIntegration`, agora duplicado — ver Concerns), retorna via `integrationToDomain` com `include: { Company: true }` (a Company já existe, pois quem chama é sempre um usuário logado com `companyId` no JWT).
- `src/infrastructure/persistence/memory/InMemoryRepositories.ts` — `ensureDefaultForCompany`: como o in-memory **não modela `companyId`** na `Integration` (mesma limitação documentada em `getFirstByCompanyId`), se já existe alguma integração devolve a primeira (nunca duplica); senão cria uma `Integration` "Padrão" com `fiscalDoc: "" `, `fiscalName: ""`, `fiscalProviderRef: null` (defaults vazios, mesmo padrão de `empresa.routes.ts`/`PrismaUserRepository`) e a empurra em `_integrations`. Documentado inline que isso é uma simplificação de piloto — resolução real multi-tenant é só no Prisma.
- `src/infrastructure/http/api/routes/agente.routes.ts` — `PUT /`: trocou o `getFirstByCompanyId` + 404 manual por `const integ = await deps.integrations.ensureDefaultForCompany(companyId);`. O `GET /` **não foi tocado** — continua usando `getFirstByCompanyId` e devolvendo persona vazia quando não há integração (não cria nada, por design — só side-effect ao salvar).
- `tests/application/agente.routes.test.ts` — novo teste: `"empresa SEM integração ainda: PUT /api/agente cria a integração e salva a persona (200, não 404)"`. Usa `new InMemoryRepositories()` **sem seed nenhum** (nem integração, nem agentConfig), chama `PUT /api/agente` com um token de `company-nova`, confirma `200` (não `404`), confirma via `repos.integrations.getFirstByCompanyId(...)` que a integração "Padrão" foi persistida de fato (não é só efeito da resposta HTTP), e confirma que o `GET` seguinte reflete a persona salva.
  - Não havia teste anterior fixado no comportamento 404 — nada precisou de reafirmação, só o teste novo foi adicionado.

## TDD

Rodei o teste novo antes da mudança em `agente.routes.ts` (com `ensureDefaultForCompany` já implementado nos repos, mas a rota ainda chamando `getFirstByCompanyId` + 404): falhou com `404` em vez de `200`, como esperado. Depois de trocar pela chamada a `ensureDefaultForCompany`, passou.

## Gate

- `npm run typecheck` — limpo (0 erros).
- `npm run typecheck:test` — limpo (0 erros).
- `npm test` — **23 arquivos passaram, 1 pulado (24)**; **70 testes passaram, 1 pulado (71)**. Baseline antes desta tarefa (relatório Fase 6 backend): 69 passaram + 1 pulado (70) — o teste novo (`agente.routes.test.ts`, agora 5 testes) soma certo; nada da suíte pré-existente quebrou. O 1 skip continua sendo `tests/prismaRepositories.contract.test.ts` (precisa `DATABASE_URL`), inalterado.

## Commit

`e5f6659` — `fix(agente): PUT /api/agente cria integracao Padrao se a empresa ainda nao tiver` — sem trailer de co-autoria.

## Concerns / pontos em aberto

- **Duplicação do padrão "ensureDefault..."**: agora existem duas implementações quase idênticas do "acha ou cria Integration Padrão" no Prisma — `PrismaCompanyServiceRepository.ensureDefaultIntegration` (privado, retorna só o `id`) e `PrismaIntegrationRepository.ensureDefaultForCompany` (público, retorna o `Integration` de domínio inteiro). Não unifiquei porque têm assinaturas/retornos diferentes e escopos de classe diferentes (um é privado ao repo de serviços); mas se amanhã aparecer um terceiro ponto de "criar integração padrão", vale extrair um helper compartilhado (ex.: em `mappers.ts` ou um novo `defaults.ts`) pra não desalinhar (ex.: um mudar `evolutionInstance` pra outro valor e o outro não).
- **In-memory ignora `companyId`** em `ensureDefaultForCompany` (igual à limitação pré-existente de `getFirstByCompanyId`): se um teste algum dia seedar integrações de tenants diferentes no mesmo `InMemoryRepositories`, `ensureDefaultForCompany("empresa-b")` pode devolver/"reusar" a integração de outra empresa em vez de criar uma nova — só o Prisma isola por tenant de verdade. Documentado inline no código; não é regressão desta mudança (mesma limitação já existia em `getFirstByCompanyId`), só herdada.
- **GET não cria** — decisão deliberada do escopo pedido (idempotência: ler não deve ter side-effect de escrita). Confirma que o comportamento pré-existente do GET ("persona vazia quando não há integração") continua intacto — só verifiquei que os testes de GET existentes continuam passando.
- Não testei a implementação Prisma real (precisa `DATABASE_URL`, fora do alcance do sandbox) — mesma limitação já registrada no relatório da Fase 6 backend para `seedPilotAdmin`. A garantia aqui é `typecheck` limpo + espelhar fielmente o padrão já em produção (`ensureDefaultIntegration`), incluindo o `include: { Company: true }` que os outros métodos do mesmo repositório já usam.
