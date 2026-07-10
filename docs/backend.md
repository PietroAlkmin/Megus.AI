# Megus AI — Backend

Documentação técnica do backend do Megus AI: o atendente virtual de WhatsApp
"Kaua", que conversa com o cliente, coleta e valida os dados dele, confere o
comprovante de pagamento e emite a NFS-e correspondente. Produto multi-tenant:
várias empresas usam a mesma instalação, cada uma com seu próprio número de
WhatsApp, sua própria persona de agente e seus próprios dados.

Este documento cobre o estado real do código na branch `feat/kaua-cerebro`
(backend em `src/`, fora de `src/frontend/`). Onde o código diverge de alguma
decisão registrada em algum momento do projeto, vale o código — e isso é
sinalizado explicitamente abaixo.

## 1. Visão geral

Fluxo de ponta a ponta: o cliente manda uma mensagem no WhatsApp → a Evolution
API entrega isso via webhook → o backend identifica de qual empresa é aquele
número → um LLM ("o cérebro") decide o que responder e propõe uma ação → um
conjunto de regras determinísticas em código valida CPF, confere o
comprovante de pagamento e, só então, aciona a emissão da nota fiscal. O PDF
da nota volta pro cliente pelo mesmo WhatsApp.

Ponto central de design do projeto: **o LLM nunca comete o ato fiscal**. Ele
só propõe texto e uma ação; todo o código de validação e emissão é
determinístico e não passa por nenhum modelo de IA. Isso é detalhado na
seção 4.

Hoje o backend fiscal (quem realmente emitiria a NFS-e) e a validação de
CPF↔nome são **mocks** — a startup ainda não está integrada a nenhum ERP ou
fonte de dados fiscal real. A conferência de comprovante de pagamento, por
outro lado, já usa visão computacional real (GPT) por padrão. Ver seção 12.

## 2. Arquitetura

Clean Architecture com portas e adaptadores (ports & adapters). Três camadas:

```
src/
  domain/          regra de negócio pura — entidades, value objects, PORTAS (interfaces), erros
  application/      casos de uso + o "cérebro" da conversa (máquina de estados)
  infrastructure/   adapters — mensageria (Evolution), IA (OpenAI), persistência (Prisma/SQL Server),
                     CPF, fiscal, API REST (Express), config
  main.ts           composition root — DI manual, monta tudo e sobe o servidor
```

Regra de dependência: `domain` não importa nada de `application`/`infrastructure`;
`application` só depende de `domain` (portas); `infrastructure` implementa as
portas de `domain` e é o único lugar acoplado a SDKs externos (OpenAI, Prisma,
Express, `fetch` pra Evolution). Trocar de provedor (mensageria, IA, fiscal,
CPF) é escrever uma nova classe que implementa a porta correspondente — zero
mudança em `domain`/`application`.

### 2.1 Portas (interfaces de domínio)

| Porta | Arquivo | Papel |
|---|---|---|
| `IMessagingProvider` | `src/domain/ports/IMessagingProvider.ts` | Abstrai o WhatsApp (inbound/outbound, QR, status de conexão) |
| `IWhatsAppProvisioner` | `src/domain/ports/IWhatsAppProvisioner.ts` | Provisiona uma instância de WhatsApp por empresa (admin API do provedor de mensageria) |
| `IAIProvider` | `src/domain/ports/IAIProvider.ts` | Abstrai o provedor de LLM (`completeWithTool`, tool forçada = saída estruturada) |
| `IAgentBrain` | `src/domain/ports/IAgentBrain.ts` | O "cérebro": recebe um `AgentContext` rico e devolve uma `AgentDecision` (texto + ação proposta) |
| `IComprovanteAnalyzer` | `src/domain/ports/IComprovanteAnalyzer.ts` | Extrai valor/pagador/recebedor de um comprovante de pagamento (visão) |
| `ICpfProvider` | `src/domain/ports/ICpfProvider.ts` | Valida CPF↔nome numa fonte externa |
| `IFiscalProvider` | `src/domain/ports/IFiscalProvider.ts` | Emite a NFS-e e cadastra o cliente no backend fiscal — **único** ponto que "faz o ato fiscal" |
| `repositories.ts` | `src/domain/ports/repositories.ts` | Repositórios do banco próprio do Megus (User, CompanyProfile, Integration, AgentConfig, Contact, Conversation, EmissionIntent, Service, CompanyService) |

Cada porta tem hoje um adapter mock e, para mensageria/IA, um adapter real
(Evolution e OpenAI). A tabela da seção 12 lista o que é mock vs real hoje.

### 2.2 Entidades de domínio

`src/domain/entities/`: `AgentConfig` (persona do Kaua), `CompanyProfile`
(dados cadastrais/Pix da empresa — espelha a tabela `Company`), `Contact`
(quem conversa pelo WhatsApp), `Conversation` (+ `ConversationState`, o enum
de estados), `EmissionIntent` (dados validados prontos pra emissão), `Integration`
(o vínculo "1 número de WhatsApp = 1 cliente Megus"), `Message`, `Service`
(catálogo NFS-e), `User`.

Duas peças de domínio sem estado, puramente funcionais:
- `Cpf` (`src/domain/value-objects/Cpf.ts`) — valida dígito verificador (algoritmo
  portado e conferido do utilitário de documentos brasileiros usado nos demais
  produtos da empresa). Só isso: **não** confere CPF↔nome, isso é a porta
  `ICpfProvider`.
- `nameMatch` (`src/domain/services/nameMatch.ts`) — compara o nome digitado
  pelo cliente com o nome oficial devolvido pelo `ICpfProvider`, tolerando
  ausência de nome do meio (exige que todos os tokens digitados apareçam, na
  ordem, dentro do nome oficial).
- `sanitizeFiscalText` (`src/domain/services/sanitizeFiscalText.ts`) — remove
  caracteres perigosos para XML/fiscal (`< > & " '`) e limita tamanho, usado
  nos campos de texto livre que vão para o `EmissionIntent`.

## 3. Fluxo principal (inbound → emissão)

```
WhatsApp do cliente
   │  (Evolution API — webhook)
   ▼
POST /webhook/evolution  (src/infrastructure/http/server.ts)
   │  mapEvolutionWebhook()  (src/infrastructure/messaging/evolution/webhookMapper.ts)
   ▼
HandleInboundMessage.execute()  (src/application/use-cases/HandleInboundMessage.ts)
   │  resolve a Integration pelo número "to"; ignora se não houver integração ativa
   │  cria/recupera o Contact (por whatsappNumber) e a Conversation (getOrCreate)
   │  grava a mensagem inbound no histórico ANTES de decidir (o cérebro lê o histórico)
   ▼
ConversationStateMachine.advance()  (src/application/agent/ConversationStateMachine.ts)
   │  dispatcher-com-guarda por estado da conversa (ver seção 4.4)
   ├─ handleChatting   → roda o cérebro, conversa livre, só ACIONA os portões
   ├─ handleIdentity   → PORTÃO A: valida CPF + CPF↔nome
   └─ handleComprovante → PORTÃO B: confere comprovante; PORTÃO C: emite
   ▼
IFiscalProvider.emitNfse()  (único caller no código inteiro)
   ▼
IMessagingProvider.sendMedia()  → devolve o PDF da nota pro cliente
```

`HandleInboundMessage` não conhece o cérebro nem os portões: ele só resolve
tenant/contato/conversa e delega para a `ConversationStateMachine`. Isso
mantém o multi-tenant e a persistência isolados da lógica de conversa.

## 4. O cérebro do Kaua

### 4.1 Montagem de contexto — `ContextAssembler` + `PromptComposer`

Duas funções **puras** (sem I/O, 100% testáveis sem mock de rede) em
`src/application/agent/`:

- **`ContextAssembler.assembleContext()`** monta um `AgentContext` a partir do
  que a `ConversationStateMachine` já carregou (conversa, `AgentConfig`,
  `Integration`, serviços da integração, contato, histórico). Cada campo do
  contexto só existe se há dado real — nada de placeholder. Duas funções de
  mascaramento exportadas e testadas: `maskCpf` (`"529.***.**7-25"`) e
  `maskName` (1º nome + inicial do sobrenome, ex. `"João S."`). **O LLM nunca
  vê o CPF nem o nome completo crus** — o portão de validação (seção 4.4) usa
  o dado cru do `Contact`, não o que foi ao prompt.
- **`PromptComposer.composePrompt()`** transforma o `AgentContext` em
  `AIMessage[]` (1 mensagem `system` montada em blocos + os pares few-shot do
  `AgentConfig` + o histórico da conversa). Cada bloco do `system` só entra se
  houver dado: identidade/persona (nome, tom, emojis, idioma, segmento),
  briefing livre do cliente (`AgentConfig.instructions`), catálogo de serviços
  com preço (instrução explícita de "não invente valores"), a regra fiscal
  (nunca dizer que emitiu a nota), o que já se sabe do cliente (mascarado), a
  data corrente.

`AgentContext` (`src/domain/ports/IAgentBrain.ts`):

```ts
interface AgentContext {
  persona: AgentPersona;      // do AgentConfig: name/segment/tone/emojis/lang/instructions/fewShotDialogs
  business: AgentBusiness;    // companyName + services (description/price/emissivel)
  state: string;               // ConversationState atual
  history: Message[];
  collected: AgentCollected;  // cpfNameVerified, fullNameMasked, cpfMasked, emissionStatus
  today: string;               // data PT-BR, America/Sao_Paulo
}
```

### 4.2 `AgentBrain` — o adapter que fala com o LLM

`src/infrastructure/ai/AgentBrain.ts` implementa `IAgentBrain`. Monta as
mensagens via `composePrompt` e roda um **loop de tools** atrás da porta
`IAgentEngine` (`VercelAgentEngine`, adapter do Vercel AI SDK, teto de passos
em `AI_MAX_STEPS`): o modelo pode chamar tools de negócio no loop e **encerra
chamando a tool terminal `propose_next`**, com um schema JSON (reply, action,
extracted). A tool terminal é o que garante saída estruturada em vez de texto
livre — o `AgentBrain` nunca faz parsing de linguagem natural. O modelo vem por
variável de ambiente (`AI_MODEL_CHAT`), não hardcoded.

O trilho fiscal (seção 4.4) segue determinístico **fora** desse loop, e a tool
`get_current_datetime` hoje registrada é temporária, prova do loop ponta-a-ponta
até a agenda real entrar (Fase B).

`propose_next` (schema completo em `AgentBrain.ts`): devolve
- `reply: string[]` — bolhas de texto pro cliente;
- `action` — um enum de roteamento: `reply | answer_question | quote_price |
  smalltalk | provide_identity | intent_emit | request_comprovante | handoff`;
- `extracted?: { fullName?, cpf?, amount? }` — dados que o cliente forneceu na
  mensagem, se houver.

**Nenhuma dessas ações emite nota.** `intent_emit` só sinaliza "o cliente quer
emitir" — o código então move a conversa para o estado de coleta de
identidade. É o código, não o modelo, que decide se e quando emitir.

### 4.3 `IAIProvider` / `OpenAIProvider` — a camada mais baixa

`src/infrastructure/ai/OpenAIProvider.ts` é o **único arquivo acoplado ao SDK
da OpenAI** no projeto inteiro. Implementa `completeWithTool` chamando
`chat.completions.create` com `tool_choice` fixo na tool pedida e faz o parse
do `arguments` (JSON) da tool call. Suporta conteúdo multimodal (texto +
imagem em base64/URL) — hoje usado pelo `ComprovanteAnalyzer` (imagem do
comprovante); a conversa do `AgentBrain` passou a rodar pelo motor de loop de
tools (`IAgentEngine`, seção 4.2), não mais por esta porta.

Trocar de provedor de LLM (Anthropic, Gemini, etc.) é escrever uma nova
classe `XProvider implements IAIProvider` — nenhuma outra camada do projeto
conhece a OpenAI.

**Decisão de arquitetura registrada no design do cérebro:** `IAIProvider`
(uma chamada, tool forçada) **não** foi reescrita para o loop de tools — o loop
mora numa porta separada, `IAgentEngine` (seção 4.2), e o `IAIProvider` segue
enxuto para a visão/comprovante. Os dados de negócio que o modelo consultaria
(catálogo, empresa) continuam entrando prontos no prompt ("seed-in-prompt"),
então "quanto custa?" se resolve sem round-trips. O loop de tools existe para
**ações externas** que precisam de round-trip de verdade (agenda na Fase B) —
sempre fora do caminho fiscal.

### 4.4 A máquina de estados — `ConversationStateMachine`

`src/application/agent/ConversationStateMachine.ts` é o coração do produto:
onde a proposta da IA vira (ou não) uma transição de estado real.

Estados (`ConversationState`, `src/domain/entities/ConversationState.ts`):
`New → CollectingIdentity → ValidatingCpf → AwaitingComprovante →
VerifyingComprovante → ReadyToEmit → Emitting → Done`, mais `HumanHandoff`
(bot calado, atendimento humano assumiu).

`advance()` é um **dispatcher-com-guarda**, não um funil rígido:

```
if (conversation.humanHandoff) return;                       // bot calado

// regra dura: mídia chegando em estado de comprovante SEMPRE vai pro portão B,
// nunca passa pelo cérebro — evita que uma "conversa" acidentalmente
// atropele a conferência de pagamento.
if (inbound.media && estado ∈ {AwaitingComprovante, VerifyingComprovante})
    → handleComprovante

switch (estado):
  CollectingIdentity | ValidatingCpf        → handleIdentity     (PORTÃO A)
  AwaitingComprovante | VerifyingComprovante → handleComprovante  (PORTÕES B e C)
  qualquer outro (New, ReadyToEmit, Done…)   → handleChatting     (conversa livre)
```

O `default` deixa de ser uma frase morta ("Um momento, já te respondo.") — em
qualquer estado que não seja fiscal, o cliente pode conversar normalmente
(perguntar preço, tirar dúvida, bater papo), e o cérebro só aciona o funil
fiscal quando há intenção real (`intent_emit`) ou quando o cliente já
forneceu nome+CPF no meio da conversa (extração eager em `handleChatting`,
para não deixar o dado fornecido "no ar" esperando o próximo turno).

**A invariante fiscal, na prática:** `AgentBrain`, `PromptComposer` e
`ContextAssembler` — toda a parte que fala com o LLM — **não recebem**
`ICpfProvider`, `IComprovanteAnalyzer` nem `IFiscalProvider` como dependência.
Não há como a IA disparar o ato fiscal mesmo que um cliente tente convencê-la
via prompt injection a "dizer que já emitiu" — o único jeito de a nota sair é
o código passar pelos três portões abaixo.

**Os três portões** (todos dentro de `ConversationStateMachine`, métodos
`processIdentity` e `handleComprovante`):

- **Portão A — identidade** (`processIdentity`): `Cpf.tryCreate(cpfRaw)`
  valida o dígito verificador; se válido, `ICpfProvider.lookupName` busca o
  nome oficial; `nameMatch(fullName, lookup.name)` confere se o nome digitado
  bate com o oficial. Falhando `CPF_MAX_ATTEMPTS` vezes seguidas (default 2)
  → `handoff` para atendimento humano. Só depois de passar aqui o `Contact` é
  marcado `cpfNameVerified = true` e o cliente é cadastrado no backend fiscal
  (`IFiscalProvider.upsertCustomer`, dedup por CPF).
- **Portão B — comprovante** (`handleComprovante`): exige mídia (texto sem
  anexo pede o comprovante de novo); `IComprovanteAnalyzer.analyze` extrai
  valor/recebedor/confiança; aprova só com **AND triplo**:
  `recipientMatches && amountOk (diferença < 1 centavo do preço do serviço) &&
  confidence >= COMPROVANTE_MIN_CONFIDENCE` (default 0.8). Qualquer um falhando
  → `handoff`. O cruzamento "recebedor bate com o prestador" é feito em
  **código** (`ComprovanteAnalyzer`, comparando dígitos), não delegado ao LLM.
- **Portão C — emissão** (mesmo método, na sequência do B): monta o
  `EmissionIntent` com os campos de texto livre passando por
  `sanitizeFiscalText`, grava-o (`status: "ready"`), e chama
  `IFiscalProvider.emitNfse(intent)` — **o único lugar em todo o código** que
  chama esse método. Sucesso → grava `status: "emitted"` + `fiscalKey`/`pdfUrl`,
  envia o PDF por `sendMedia`, estado vai para `Done`. Falha → `handoff`.

Esses três portões são tratados como "byte-a-byte" no projeto: qualquer
evolução do cérebro (mais contexto, mais ações, conversa mais livre) é feita
sem tocar a lógica desses métodos — só o roteamento em torno deles muda.

## 5. Persistência

Prisma 6 sobre SQL Server (Azure). Schema em `prisma/schema.prisma`: `User`,
`Membership` (User↔Company, com `role`), `Company`, `Integration`,
`AgentConfig`, `Contact`, `Conversation`, `Message`, `EmissionIntent`,
`Service`.

**Liga por `DATABASE_URL`.** Vazio → todos os repositórios caem para
`InMemoryRepositories` (`src/infrastructure/persistence/memory/InMemoryRepositories.ts`),
útil para dev local e para a suíte de testes — dados somem no restart. Com
`DATABASE_URL` setado, **todos** os 9 repositórios em `main.ts` são trocados
para as implementações Prisma (`src/infrastructure/persistence/prisma/Prisma*Repository.ts`).
**O app não roda migration sozinho** — não há `.migrate()`/`EnsureCreated` em
nenhum lugar do boot; aplicar uma migration no Azure é sempre um passo manual.

### 5.1 Escopo por tenant

Todo repositório real (Prisma) filtra por `integrationId` (que por sua vez
pertence a uma `companyId`). O tenant do usuário logado vem sempre do JWT
(nunca de parâmetro de rota ou corpo da requisição) — ver seção 7. Há uma
suíte de contrato reusável (`tests/repositoryContract.ts`,
`assertRepositoryContract`) que roda as mesmas asserções de round-trip **e**
de isolamento entre tenants (IDOR negativo: tenant B não enxerga dado de
tenant A) contra `InMemoryRepositories` (`tests/inMemoryRepositories.contract.test.ts`,
roda sempre) e contra o Prisma real (`tests/prismaRepositories.contract.test.ts`,
`describe.skipIf(!process.env.DATABASE_URL)` — só roda com banco acessível).

### 5.2 O drift Integration ↔ Company

A entidade de domínio `Integration` (`src/domain/entities/Integration.ts`)
carrega `fiscalDoc`, `fiscalName` e `fiscalProviderRef` — mas no schema do
banco esses campos **vivem na tabela `Company`**, não em `Integration`. Isso
é intencional (a identidade fiscal é da empresa, não de cada canal de
WhatsApp dela), mas significa que todo repositório Prisma que lê uma
`Integration` precisa fazer `include: { Company: true }` e reconstruir o
objeto de domínio via `integrationToDomain(integ, company)`
(`src/infrastructure/persistence/prisma/mappers.ts`, função pura e testada
isoladamente em `tests/prismaMappers.test.ts`). Quem for mexer num repositório
Prisma que lida com `Integration` precisa lembrar desse JOIN — esquecê-lo
faz `fiscalDoc`/`fiscalName` virem `undefined` silenciosamente.

### 5.3 "Integration Padrão" — cadastro sem ordem obrigatória

Uma empresa nova não tem `Integration` até que algo a crie. Duas rotas
independentes precisam disso e cada uma resolve à sua maneira:
- `PrismaCompanyServiceRepository.ensureDefaultIntegration` (privado) — cria
  a integração "Padrão" quando a empresa salva o 1º serviço.
- `IIntegrationRepository.ensureDefaultForCompany` (público, na porta) — usado
  por `PUT /api/agente` e por `POST /api/agente/whatsapp/connect`: acha a 1ª
  integração da empresa ou cria uma "Padrão" (`displayName: "Padrão"`,
  `whatsappNumber: ""`, `evolutionInstance: ""`).

Isso existe porque a ordem em que o cliente configura empresa/agente/WhatsApp
não deveria importar (bug corrigido: configurar a persona do agente antes de
cadastrar um serviço quebrava com 404). **Duas implementações praticamente
idênticas** do mesmo "ache ou crie a Integration padrão" existem hoje lado a
lado — não foram unificadas porque têm assinaturas e escopos de classe
diferentes; se aparecer uma terceira necessidade do mesmo padrão, vale
extrair um helper compartilhado antes que as duas divirjam (ex.: um mudar o
valor default de `evolutionInstance` e o outro não).

No `InMemoryRepositories`, `getFirstByCompanyId`/`ensureDefaultForCompany`
**ignoram o `companyId`** recebido — como o modelo in-memory não representa
`companyId` em `Integration`, sempre devolvem/reusam a única integração
seedada. Isso é documentado inline no código como simplificação válida
enquanto os testes só seedam 1 integração por vez; isolamento de tenant real
só é garantido pelo Prisma.

### 5.4 Seeds do piloto

Dois seeds idempotentes rodam no boot quando há `DATABASE_URL`
(`src/main.ts`):
- **`seedPilot`** (`src/infrastructure/persistence/seedPilot.ts`) — garante
  `Company` (`id: "co-piloto"`), `Integration` (`id: "int-piloto"`), `Service`
  (`svc-massagem`) e `AgentConfig` (`ag-piloto`, persona "Kaua"). Upsert por
  ID fixo — numa re-execução, só o `whatsappNumber`/`evolutionInstance` são
  atualizados (para apontar ao número real do chip); identidade fiscal,
  serviço e persona já existentes não são sobrescritos.
- **`seedPilotAdmin`** (`src/infrastructure/persistence/seedPilotAdmin.ts`) —
  garante o usuário `piloto@megus.ai` (senha `megus123`, bcrypt) com
  **exatamente uma** `Membership`, em `co-piloto`: remove memberships em
  qualquer outra empresa antes de garantir a de `co-piloto`. Isso existe para
  que o login resolva `companyId=co-piloto` de forma determinística — sem
  isso, o painel podia logar num tenant vazio. Efeito colateral a saber: a
  senha do usuário piloto é **resetada para `megus123` a cada boot** (idempotência
  por design; se alguém trocar essa senha manualmente em produção, o próximo
  deploy reverte).

Sem `DATABASE_URL` (dev local/sandbox), `main.ts` usa outro caminho:
semeia uma integração/agente/serviço fixos em memória e registra um usuário
de teste (`piloto@megus.ai` / `megus123`) sob um `companyId` **diferente**
(`"company-piloto"`, só existe nesse branch in-memory) — os dois caminhos
não se misturam porque um só roda com `DATABASE_URL` vazio e o outro só com
`DATABASE_URL` presente.

## 6. Mensageria multi-tenant (Evolution API)

Transporte = **Evolution API** (Baileys) — não o WPPConnect nem a Cloud API
oficial da Meta (essa última está prevista na porta `IMessagingProvider` mas
sem implementação; `MESSAGING_PROVIDER=meta` está declarado no schema de env
mas faz `main.ts` lançar erro no boot, "ainda não implementado").

Duas responsabilidades distintas, duas classes:

- **`EvolutionMessagingProvider`** (`src/infrastructure/messaging/evolution/EvolutionMessagingProvider.ts`)
  implementa `IMessagingProvider`: `sendText`/`sendMedia` batem em
  `/message/sendText/{instance}` e `/message/sendMedia/{instance}` do Evolution.
  Cada empresa tem sua própria `instance` (nome da instância Evolution) — o
  envio é **sempre por-tenant**: `OutboundText`/`OutboundMedia` carregam um
  campo `instance?`, e a `ConversationStateMachine` sempre manda
  `integration.evolutionInstance || undefined` (string vazia normalizada
  para `undefined` na origem, para cair no fallback correto). Só cai no
  `instance` global do `.env` (`EVOLUTION_INSTANCE`) se a integração ainda
  não tiver a sua — compatibilidade com o piloto original.
- **`EvolutionProvisioner`** (`src/infrastructure/messaging/evolution/EvolutionProvisioner.ts`)
  implementa `IWhatsAppProvisioner`, a API **administrativa** do Evolution:
  `provision(instanceName)` cria a instância (`POST /instance/create`,
  idempotente — 403/409 é tratado como "já existe" e segue o fluxo), sempre
  reconfigura o webhook (`POST /webhook/set/{instance}`, aponta pra
  `PUBLIC_WEBHOOK_URL`) e devolve o QR code em base64 (da resposta do create
  ou de `GET /instance/connect/{instance}`); `status(instanceName)` lê
  `GET /instance/connectionState/{instance}` e, se `open`, cruza com
  `GET /instance/fetchInstances` para achar o `ownerJid` real (o número só é
  gravado a partir daí — **nunca** de input do usuário).

Uma instância por empresa; o nome nunca vem de input do usuário — vem de
`integration.evolutionInstance` já gravado, ou é derivado do `integrationId`
(`megus-{id}`) na primeira conexão. Isso está encapsulado nas rotas
`/api/agente/whatsapp/*` (seção 7).

**Ponto de risco sinalizado no código, não confirmado contra o Evolution real
em produção:** o formato exato das respostas de `connectionState` e
`fetchInstances` varia entre versões/documentações do Evolution 2.x (`{state}`
plano vs. `{instance:{state}}` aninhado; array flat vs. aninhado). O parsing
em `EvolutionProvisioner` cobre defensivamente os dois formatos mais
prováveis, mas se nenhum bater, `status()` falha silenciosamente para
`{connected: false, number: null}` (sem lançar exceção). Vale logar a
resposta crua na primeira depuração real contra uma instância nova.

### 6.1 Inbound (webhook)

`mapEvolutionWebhook` (`src/infrastructure/messaging/evolution/webhookMapper.ts`)
traduz o payload cru do evento `messages.upsert` do Evolution para o
`InboundMessage` de domínio: ignora mensagens `fromMe`, resolve `kind`
(texto/imagem/áudio/documento), extrai texto e mídia (base64/URL/mimetype) —
com parsing defensivo (comentário `⚠️` explícito no código) porque o formato
de mídia (`url` vs `base64`) não foi validado contra uma instância real ainda;
uma mídia sem `base64` quebra o Portão B (comprovante) silenciosamente. O
roteamento pra qual empresa a mensagem pertence usa o campo `to` = número da
instância que recebeu — funciona automaticamente com múltiplas instâncias,
nada precisa mudar aqui ao adicionar tenants.

O endpoint `POST /webhook/evolution` (rota HTTP nativa, não Express — ver
`src/infrastructure/http/server.ts`) responde `200 ok` **imediatamente** e só
depois processa a mensagem de forma assíncrona (o Evolution reenvia em caso
de resposta não-2xx; processar depois evita reprocessamento duplicado por
timeout).

## 7. API REST (`/api`)

Montada como um app Express dentro do mesmo servidor HTTP nativo
(`src/infrastructure/http/api/app.ts`, montado em `server.ts` — tudo que
começa com `/api` é delegado ao Express; o resto — `/webhook/evolution`,
`/qr`, `/health`, `/dev/inbound`, `/nota-demo.pdf` — continua em HTTP puro).

**Autenticação:** JWT Bearer (`jsonwebtoken`), emitido em
`POST /api/auth/login` (payload `{ sub: userId, companyId, email }`, TTL 1h
por padrão). `makeAuthMiddleware` (`src/infrastructure/http/api/authMiddleware.ts`)
lê `Authorization: Bearer <token>`, valida e injeta `req.auth = { userId,
companyId, email }`. **Toda rota protegida resolve o tenant a partir de
`req.auth.companyId` — nunca de parâmetro de rota ou corpo da requisição.**
Isso é o que impede um usuário de uma empresa de ler/escrever dado de outra
(IDOR) nas rotas novas.

**Envelope de resposta**, igual em toda rota (`src/infrastructure/http/api/result.ts`):

```ts
interface ResultResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  errors: string[] | null;
  correlationId: string | null;
  statusCode: number;
}
```

### 7.1 Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| POST | `/api/auth/register` | não | Cria conta (e-mail único, senha ≥6, gera `companyId` novo) |
| POST | `/api/auth/login` | não | Autentica, devolve JWT |
| GET | `/api/auth/me` | sim | Dados do usuário logado |
| PUT | `/api/auth/perfil` | sim | Edita `displayName` |
| PUT | `/api/auth/senha` | sim | Troca senha (confere a atual) |
| GET / PUT | `/api/empresa` | sim | Dados cadastrais + Pix da empresa (tabela `Company`) |
| GET / POST / DELETE | `/api/empresa/servicos[/:id]` | sim | Catálogo de serviços NFS-e |
| GET / PUT | `/api/agente` | sim | Persona do Kaua (name/segment/tone/emojis/lang/instructions/fewShotDialogs) — PUT preserva `capabilities`/`knowledgeFiles` existentes; cria a integração "Padrão" se a empresa ainda não tiver nenhuma |
| GET | `/api/agentes` | sim | Lista de agentes/atendimentos da empresa (hoje mock — ver 7.2) |
| GET | `/api/agentes/metricas` | sim | Métricas agregadas (hoje mock) |
| GET | `/api/agentes/:agentId/conversas` | sim | Conversas de um agente (hoje mock) |
| GET | `/api/conversas/:convId/mensagens` | sim | Mensagens de uma conversa (hoje mock) |
| POST | `/api/conversas/:convId/assumir` | sim | Marca a conversa como assumida por humano (hoje só confirma, sem persistir) |
| GET | `/api/cobrancas` | sim | Clientes com status pagamento/nota/cobrança (hoje mock) |
| GET | `/api/cobrancas/metricas` | sim | Resumo agregado (hoje mock) |
| POST | `/api/cobrancas/:id/cobrar` | sim | Dispara cobrança via WhatsApp (hoje só confirma, sem enfileirar nada) |
| POST | `/api/agente/whatsapp/connect` | sim | Cria/reusa a instância Evolution da empresa, devolve QR |
| GET | `/api/agente/whatsapp/status` | sim | Estado da conexão + número real (do `ownerJid`) |

Fora do prefixo `/api` (HTTP nativo, sem autenticação):

| Método | Rota | Descrição |
|---|---|---|
| POST | `/webhook/evolution` | Webhook do Evolution — entrada real das mensagens do WhatsApp |
| GET | `/qr` | QR da instância global (`EVOLUTION_INSTANCE`), como `<img>` HTML — usado só no piloto original, pré-multi-tenant |
| GET | `/health` | Liveness check |
| GET | `/nota-demo.pdf` | PDF de demonstração gerado em runtime, servido para o `MockFiscalProvider` devolver uma URL real baixável |
| POST | `/dev/inbound` | Injeta uma mensagem inbound fake — harness de teste manual (ver seção 9) |

**`/dev/inbound` fica sempre montado, sem autenticação nem checagem de
ambiente** — `main.ts` sempre passa `onDevInbound` para `createServer`,
independente de `NODE_ENV` ou de qualquer flag. Isso é intencional para o
piloto (permite testar o loop completo sem WhatsApp real), mas é uma
superfície real: qualquer um que alcance a porta pode simular uma mensagem
de "qualquer número" para "qualquer integração", inclusive disparando o
fluxo de emissão. Antes de expor essa porta publicamente sem um proxy que a
bloqueie, vale gatear esse endpoint por ambiente ou removê-lo do build de
produção.

### 7.2 `USE_MOCK_DATA` — dado de exemplo nas telas de painel

Um switch (`env.USE_MOCK_DATA`, default `true`) decide se
`atendimentos.routes.ts`, `conversas.routes.ts` e `cobrancas.routes.ts`
devolvem dados de exemplo (`src/infrastructure/http/api/mockData.ts`,
centralizados num único arquivo, propositalmente, para não espalhar mock
pelo código) ou o ramo "real" — que hoje devolve listas/objetos vazios/zerados,
já com o comentário de onde plugar a query real quando ela existir (ex.:
`atendimentosRoutes` comenta explicitamente que a lista real viria de
`Integration`+`Conversation`+`EmissionIntent` por `companyId`). Isso é
diferente dos mocks de domínio (fiscal/CPF/comprovante, seção 12): aqui é
puramente dado de exibição de telas que ainda não têm uma consulta real
implementada, não uma regra de negócio.

## 8. Configuração (variáveis de ambiente)

Validadas e tipadas com Zod em `src/infrastructure/config/env.ts` — falha
cedo no boot (`schema.parse(process.env)`) se algo obrigatório estiver
malformado. Nenhuma tem valor obrigatório sem default hoje (ver ressalva do
`JWT_SECRET` na seção 11).

| Variável | Default | Papel |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `LOG_LEVEL` | `info` | Nível do `pino` |
| `JWT_SECRET` | `"dev-secret-trocar-em-producao"` | Chave de assinatura do JWT — **trocar em produção, ver seção 11** |
| `CORS_ORIGINS` | `"*"` | Origens permitidas na API `/api` (lista separada por vírgula, ou `*`) |
| `USE_MOCK_DATA` | `true` | Liga dado de exemplo nas telas de painel (seção 7.2) |
| `AI_PROVIDER` | `openai` | Só `openai` implementado |
| `OPENAI_API_KEY` | — | Chave da OpenAI |
| `AI_MODEL_CHAT` | `gpt-5.4-mini` | Modelo do cérebro (conversa) |
| `AI_MODEL_VISION` | `gpt-5.4-mini` | Modelo da análise de comprovante (visão) |
| `AI_MAX_STEPS` | `4` | Teto de passos do loop de tools do cérebro |
| `MESSAGING_PROVIDER` | `evolution` | `none` (log) / `evolution` (real) / `meta` (declarado, **não implementado** — lança erro no boot) |
| `EVOLUTION_BASE_URL` | — | URL base da API Evolution |
| `EVOLUTION_API_KEY` | — | Chave de API do Evolution |
| `EVOLUTION_INSTANCE` | `megus` | Instância global (fallback do piloto pré-multi-tenant) |
| `PUBLIC_WEBHOOK_URL` | `http://megus-app:3000/webhook/evolution` | URL que o `EvolutionProvisioner` registra como webhook de toda instância nova — hostname do serviço dentro da rede Docker |
| `FISCAL_PROVIDER` | `mock` | Declarado (`mock`/`erp`), **mas não lido em `main.ts`** — ver seção 12 |
| `CPF_PROVIDER` | `mock` | Declarado (`mock`/`serpro`), **mas não lido em `main.ts`** — ver seção 12 |
| `COMPROVANTE_PROVIDER` | `openai` | Este SIM é lido: `mock` (auto-aprova, só demo) vs `openai` (visão real) |
| `MOCK_NOTA_PDF_URL` | — | URL do PDF que o `MockFiscalProvider` devolve (para o WhatsApp conseguir baixar de verdade) |
| `COMPROVANTE_MIN_CONFIDENCE` | `0.8` | Limiar do Portão B |
| `CPF_MAX_ATTEMPTS` | `2` | Tentativas antes do handoff no Portão A |
| `PILOT_WHATSAPP_NUMBER` | — | Número (E.164 sem `+`) da integração seed do piloto |
| `DATABASE_URL` | — | String de conexão SQL Server (formato `mssql`/mssql driver). Vazio = tudo in-memory |

## 9. Como rodar e testar

### 9.1 Rodar localmente

```bash
npm install
cp .env.example .env      # preencher OPENAI_API_KEY; deixar DATABASE_URL vazio p/ in-memory
npm run dev                # tsx watch src/main.ts
```

Harness sem WhatsApp real (`MESSAGING_PROVIDER=none` no `.env` usa
`LogMessagingProvider`, que só loga a resposta do Kaua no console em vez de
enviar): injete mensagens via `POST /dev/inbound` ou pelo script
`dev-chat.ps1` da raiz do repo:

```powershell
.\dev-chat.ps1 "oi, agendei massagem e já paguei, como pego a nota?"
.\dev-chat.ps1 "Pietro Augusto Mota Alkmin, CPF 546.252.558-30"
.\dev-chat.ps1 -Kind image -MediaUrl "http://x/comprovante.jpg" "manda o comprovante"
```

As respostas aparecem no terminal onde `npm run dev` está rodando.

Dois scripts na raiz (`test.ts`, `analyze-db.ts`) são utilitários ad hoc de
introspecção do Azure SQL (listam tabelas/colunas via `mssql` direto,
fora do Prisma) — não fazem parte do runtime do app nem têm script no
`package.json`; servem só para depurar o schema real do banco a partir da
`DATABASE_URL`.

### 9.2 Rodar a suíte automatizada

```bash
npm run typecheck       # tsc --noEmit
npm run typecheck:test  # idem, para tests/
npm test                # vitest run
```

Estado atual (confirmado rodando a suíte): **87 testes passando + 2 pulados**
(em 28 arquivos). Os 2 pulados só rodam com credencial:
`tests/prismaRepositories.contract.test.ts` exige `DATABASE_URL` (contra o
Azure real) e `tests/infrastructure/ai/VercelAgentEngine.live.test.ts` exige
`OPENAI_API_KEY` (o smoke ao vivo do loop de tools) — ambos fora do alcance de
um ambiente sandbox comum. Todos os demais rodam contra `InMemoryRepositories`
e providers mockados (`vi.fn()`), sem rede nem chave de API real — inclusive
os testes do `OpenAIProvider`/`AgentBrain`/`ComprovanteAnalyzer` usam um
cliente OpenAI fake injetado.

O que a suíte cobre, por camada:

- **Gates fiscais** (`tests/application/ConversationStateMachine.identity.test.ts`,
  `.emission.test.ts`, `tests/acceptance/happyPath.test.ts`): CPF válido +
  nome batendo → avança; nome não batendo 2x → handoff; comprovante com
  confiança baixa → handoff, nunca emite; caminho feliz completo (conversa →
  coleta → validação → comprovante → emissão mock → PDF enviado).
- **Invariante fiscal e des-engessamento** (`ConversationStateMachine.chat.test.ts`):
  para cada ação de conversa (`reply`, `answer_question`, `quote_price`,
  `smalltalk`, `intent_emit`), `fiscal.emitNfse` **nunca** é chamado; mídia
  chegando em estado de comprovante vai direto pro Portão B, nunca passa
  pelo cérebro; envio por-tenant usa `integration.evolutionInstance`.
- **Contrato de repositórios** (`tests/repositoryContract.ts` +
  `tests/inMemoryRepositories.contract.test.ts` /
  `tests/prismaRepositories.contract.test.ts`): round-trip de cada entidade
  e isolamento negativo entre tenants (um tenant não lê dado do outro).
- **Mapeadores puros** (`tests/prismaMappers.test.ts`): reconstrução de
  `Integration` a partir de `Integration+Company` (o drift da seção 5.2);
  parse dos campos `*Json` do `AgentConfig`.
- **Cérebro** (`tests/application/agent/ContextAssembler.test.ts`,
  `PromptComposer.test.ts`, `tests/infrastructure/ai/AgentBrain.test.ts`):
  mascaramento de CPF/nome; blocos do prompt aparecem/somem conforme o
  contexto; tom/emojis/idioma mudam o texto do `system`; repasse correto de
  `reply`/`action`/`extracted`.
- **API REST** (`tests/application/agente.routes.test.ts`,
  `whatsapp.routes.test.ts`): tenant sempre do JWT; PUT preserva
  `capabilities`/`knowledgeFiles`; 401 sem token; 404/auto-criação da
  integração "Padrão"; `GET /status` não regride um número já gravado.
- **Adapters de infraestrutura**: `EvolutionMessagingProvider`,
  `webhookMapper`, `LogMessagingProvider`, `MockFiscalProvider`,
  `MockComprovanteAnalyzer`, `ComprovanteAnalyzer`, `OpenAIProvider`,
  `notaPdf`, `server` (rotas HTTP nativas).

Testes que **exigem infraestrutura real** e por isso ficam fora do sandbox
comum: `tests/prismaRepositories.contract.test.ts` (Azure SQL acessível —
firewall por IP) e a validação end-to-end contra uma instância Evolution
real (sem teste automatizado; validado manualmente no VPS).

## 10. Deploy

**Imagem Docker** (`Dockerfile`, raiz do repo): `node:22-slim`. Roda via
`tsx` diretamente (não faz bundling nem `tsc build` — resolve imports ESM
sem extensão, o que o `tsc` puro compilado não faz sem ajuste; suficiente
para o piloto, bundling fica para depois). Pontos que a imagem resolve
explicitamente:
- Instala `openssl` + `ca-certificates` — o `node:22-slim` não os traz, e o
  Prisma precisa deles tanto para escolher o binary engine certo quanto para
  TLS com o Azure SQL (sem isso, o boot falha com `certificate verify
  failed`).
- `npm ci` roda **sem** `NODE_ENV=production`, de propósito, para instalar o
  `tsx` (que é dev-dependency — o `CMD` da imagem depende dele).
- `npx prisma generate` roda **depois** de copiar o código (não só no
  `postinstall` do `npm ci`, que rodaria antes do `COPY . .` e geraria um
  client stub sem o schema presente).

Não há `docker-compose.yml` versionado neste repositório — o compose vive no
VPS (`/opt/megus/docker-compose.yml`), fora deste código-fonte. O que se sabe
dele pelo próprio código: o serviço da aplicação é referenciado como
`megus_app` (nome do serviço no compose) e `megus-app` (hostname interno na
rede Docker, usado no default de `PUBLIC_WEBHOOK_URL`); o Evolution roda como
outro serviço na mesma rede, acessível via `EVOLUTION_BASE_URL`. Deploy =
publicar o código no VPS e `docker compose up -d --build`.

Checklist de produção — itens conhecidos e ainda pendentes, ver seção 11.

## 11. Decisões-chave (com o porquê)

- **A IA nunca emite — só propõe.** Decisão de segurança de base do produto:
  o LLM é probabilístico, o ato fiscal não pode ser. Estruturalmente
  garantido por não injetar `IFiscalProvider`/`ICpfProvider`/`IComprovanteAnalyzer`
  nas classes que falam com o LLM (seção 4.4), não só por instrução de prompt.
- **`propose_next` como tool terminal (answer tool) do loop** em vez de deixar
  o modelo responder em texto livre — elimina parsing de linguagem natural e
  torna a extração de `reply`/`action`/`extracted` determinística no código.
- **Seed-in-prompt para os dados de negócio.** Latência: preço/catálogo entram
  prontos no `system`, então isso se resolve sem round-trip — o loop de tools
  fica reservado para ações externas (agenda) que de fato precisam de
  ida-e-volta. Reduz custo e chamadas ao vivo desnecessárias numa conversa de
  WhatsApp.
- **CPF/nome mascarados no prompt, crus só no portão.** Minimiza PII que sai
  para o provedor de LLM sem enfraquecer a validação (que sempre usa o dado
  bruto do `Contact`, nunca o que foi ao prompt).
- **Dispatcher-com-guarda em vez de funil rígido.** Produto anterior só sabia
  responder dentro do fluxo fiscal; fora dele, respondia uma frase morta. A
  mudança maximiza conversa útil sem abrir brecha fiscal — todo estado de
  chat cai em `handleChatting`, que só consegue **acionar** os portões
  (`intent_emit` → pede identidade), nunca pular ou emitir sozinho.
- **Escopo por `integrationId`→`companyId` em toda leitura/escrita real,
  tenant sempre do JWT.** Único jeito confiável de impedir uma empresa de
  enxergar dado de outra num produto multi-tenant desde o dia 1.
- **App nunca migra sozinho.** Migration de schema é sempre passo manual e
  verificado — evita boot corrompendo dados em produção por engano.
- **Mensageria/fiscal/CPF atrás de portas desde o início**, mesmo com só um
  adapter real (Evolution) e dois mocks (fiscal, CPF): o produto nasceu
  citando explicitamente "hoje X, amanhã Y" (WPP não-oficial → Meta Cloud
  API; mock → um ERP externo; mock → SERPRO ou serviço pago) — a
  abstração existe para essa troca não exigir tocar em domínio/aplicação.
- **`AtendenteVirtualModal`/persona editável sem afetar o onboarding.** O
  modal do painel antigo aceita um modo de edição (`initial` presente) que
  reusa a mesma UI de configuração inicial sem duplicar componente — só o
  `handleSalvar` muda de comportamento (onboarding: só repassa pro estado
  local; edição: chama `PUT /api/agente` de verdade).

## 12. O que ainda é mock — e onde trocar

| Domínio | Estado real | Onde trocar |
|---|---|---|
| **Backend fiscal** (`IFiscalProvider`) | `MockFiscalProvider` sempre — devolve chave/PDF fake. **`main.ts` não lê `env.FISCAL_PROVIDER`** (o enum existe no schema de env, mas não há `if` que troque de implementação — só `AI_PROVIDER`/`MESSAGING_PROVIDER`/`COMPROVANTE_PROVIDER` são de fato branchados). | Escrever `ErpFiscalProvider implements IFiscalProvider` (adapter de um ERP) em `src/infrastructure/fiscal/`, e **adicionar** o branch por `env.FISCAL_PROVIDER` em `main.ts` (hoje inexistente) na hora de trocar. |
| **CPF↔nome** (`ICpfProvider`) | `MockCpfProvider` sempre, com um único CPF seedado no código (`main.ts`). Mesma observação: **`env.CPF_PROVIDER` também não é lido** em lugar nenhum. | Escrever `SerproCpfProvider` (ou serviço pago equivalente — BrasilAPI não tem endpoint de CPF, conferido) em `src/infrastructure/cpf/`, e adicionar o branch por `env.CPF_PROVIDER` em `main.ts`. |
| **Comprovante de pagamento** (`IComprovanteAnalyzer`) | **Já real por padrão** (`COMPROVANTE_PROVIDER=openai`): `ComprovanteAnalyzer` usa visão via `IAIProvider`/OpenAI de verdade. `MockComprovanteAnalyzer` (auto-aprova, confiança 1) só existe atrás de `COMPROVANTE_PROVIDER=mock`, para demonstrar o fluxo completo sem precisar montar um comprovante real que bata com o prestador — **nunca deve rodar assim em produção**. | Nada a implementar; falta validar contra comprovantes reais variados (formatos de banco, qualidade de foto) — ainda não houve smoke real com fotos de comprovante de clientes. |
| **Mensageria** | Evolution API real (`EvolutionMessagingProvider`) é o caminho de produção; `LogMessagingProvider` (`MESSAGING_PROVIDER=none`) só para dev/harness. Meta Cloud API é porta prevista, não implementada. | Escrever `MetaMessagingProvider implements IMessagingProvider` quando fizer sentido migrar de canal. |

## 13. O que falta / próximos passos

- **Fiscal real:** implementar o adapter (um ERP via chave de API) e ligar o
  branch por `env.FISCAL_PROVIDER` em `main.ts` (hoje ausente —
  ver tabela acima).
- **CPF real:** implementar o adapter (SERPRO ou serviço pago) e ligar o
  branch por `env.CPF_PROVIDER` em `main.ts` (idem).
- **Validar o comprovante por visão contra dados reais** — hoje só testado
  com fixtures/mocks; nunca rodou contra fotos reais de comprovante.
- **`JWT_SECRET` forte e obrigatório.** Hoje tem um default público
  (`"dev-secret-trocar-em-producao"`) e nada no código impede subir em
  produção com esse valor (sem checagem fail-fast). Antes de expor a API
  publicamente, definir um `JWT_SECRET` forte no ambiente de produção e,
  idealmente, fazer o boot falhar se ele continuar no default.
- **Proteção de corrida no inbound.** `HandleInboundMessage.execute` faz
  "busca contato → se não achar, cria" e a máquina de estados faz
  "busca conversa → se não achar, cria" sem lock nem transação — duas
  mensagens quase simultâneas do mesmo número (comum em WhatsApp: várias
  bolhas seguidas) podem gerar contato/conversa duplicados. Mitigar com lock
  por `conversationId`/`whatsappNumber` ou com constraint + upsert atômico
  antes de ligar tráfego real intenso.
- **Limpar dados de teste órfãos no banco de produção.** Versões anteriores
  do seed usaram um tenant `company-piloto` (e um usuário de teste próprio)
  que não é mais o alvo canônico (`co-piloto`/`int-piloto`); esses registros
  antigos ficaram no Azure e valem uma limpeza antes de tratar o banco como
  "só dado real".
- **`/dev/inbound` sem proteção nenhuma** (nem flag de ambiente, nem
  autenticação) — ver seção 7.1. Gatear ou remover do build de produção.
- **Camada de conversa (buffer, debounce, detecção de turno, barge-in).**
  Hoje cada mensagem inbound dispara um turno completo do cérebro
  imediatamente; várias bolhas seguidas do mesmo cliente (comum em WhatsApp)
  geram múltiplas respostas em vez de uma resposta consolidada. Isso ainda
  não foi implementado — é a lacuna mais visível entre "funciona no
  `/dev/inbound`" e "soa natural no WhatsApp real".
- **Memória longa da conversa** — histórico hoje é só as últimas mensagens
  brutas (`getHistory(conv.id, 20)`); um resumo rolante persistido (com
  redação determinística de CPF/valor antes de qualquer store/log) ainda não
  existe. Conversas muito longas eventualmente perdem contexto antigo.
- **`getById` de `Service`/`EmissionIntent` sem escopo de tenant** — herdado
  da assinatura da porta (`getById(id)`, sem `integrationId`); hoje não tem
  caller que exponha isso publicamente, mas ao expor qualquer rota nova sobre
  esses repositórios, adicionar o escopo por tenant à assinatura antes de
  ligar ao HTTP.
- **Ramo "real" das rotas de painel** (`atendimentos`, `conversas`,
  `cobrancas`) ainda devolve listas vazias/zeradas fora de `USE_MOCK_DATA`
  (seção 7.2) — falta implementar as consultas reais a partir de
  `Integration`/`Conversation`/`EmissionIntent`.
- **Parsing de mídia do webhook não validado contra uma instância Evolution
  real** (seção 6.1) — risco concreto: comprovante sem `base64` quebra o
  Portão B silenciosamente (vira "sem mídia", pede de novo, indefinidamente).
