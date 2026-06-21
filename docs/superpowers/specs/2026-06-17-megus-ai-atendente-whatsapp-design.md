# Megus AI — Atendente Virtual de WhatsApp ("Kaua") — Design

**Data:** 2026-06-17 · **Status:** design aprovado (Seções 1 e 2), pendente revisão do spec.

## 1. Contexto e objetivo

Produto **standalone** (startup à parte da Kapty): um atendente de WhatsApp com IA
("Kaua") que conversa com clientes 24/7, **coleta e valida** dados do cliente
(nome + CPF), **confere** o comprovante de pagamento e **dispara** a emissão de uma
NFS-e correta, devolvendo o PDF ao cliente.

**Piloto:** consultório médico em Alphaville. Dor concreta da cliente: a secretária
erra CPF/CNPJ na emissão da nota, não atende 24/7 e tem limitações. Entregar o mais
próximo do final até segunda (testável e iterável na semana).

**Decisão estratégica (time Kapty):** a Kapty **não** fornece esse serviço (fora do
roadmap). A startup trata a Kapty — e qualquer ERP — como **provedor fiscal externo**
atrás de uma porta. **Por ora a startup NÃO fala com a Kapty**: o fiscal é mockado.

## 2. Escopo

**No MVP:**
- Modo **Atendente Virtual** (o único "ligado" no wireframe). Kaua responde dúvidas
  gerais (config do agente + base de conhecimento) e conduz o fluxo fiscal.
- **Inbound-only**: Kaua só responde quem chama. A arquitetura deixa a porta aberta
  para iniciar mensagens depois (não implementado agora).
- Coleta + validação de identidade (nome + CPF), conferência de comprovante, montagem
  do `EmissionIntent` e disparo da emissão (mockada), envio do PDF.
- Handoff humano (bot cala, humano assume).

**Fora do MVP:** modos broadcast / respostas automáticas / inbox humano do wireframe;
migração para Meta; provider fiscal/CPF reais; multi-tenant além do modelo de dados;
tela de gestão/inbox.

## 3. Arquitetura (Seção 1 — aprovada)

Serviço único **Node/TypeScript, Clean Architecture + DDD, banco próprio**, repo
standalone (`Megus.AI`, pacote `megus-ai`). **Agnóstico de provedor em 3 dimensões**:

- **Mensageria** (`IMessagingProvider`): **Evolution API em modo Baileys** (não-oficial) hoje → **Meta Cloud API** depois. O Evolution é dual-mode (Baileys ⇄ Cloud API na mesma REST API), então a migração é **flip do campo `integration`**, não reescrita.
- **Backend fiscal** (`IFiscalProvider`): mock hoje → Kapty (X-API-KEY/ThirdPartyIntegration) ou outro ERP.
- **CPF↔nome** (`ICpfProvider`): mock hoje → SERPRO / serviço pago.
- **IA/LLM** (`IAIProvider`): OpenAI hoje → Anthropic/Gemini/outro com **1 implementação**. O **modelo vem por env** (`AI_MODEL_CHAT`/`AI_MODEL_VISION`, família GPT-5.x), sem hardcode. `AgentBrain`/`ComprovanteAnalyzer` dependem da porta, não do SDK.

```
Ports (HTTP front/config, inbound de mensagem, SSE)
        │
Application  ── loop do Kaua (máquina de estados) · buffer de turno · handoff
        │  (só conhece PORTAS)
Domain       ── entidades · value objects (Cpf, Phone) · PORTAS · erros
        │
Infrastructure ── adapters: WPP/Meta · OpenAI · CPF · Fiscal · Postgres · Redis · config
        │
main.ts      ── composition root (DI manual)
```

**Regra dura de segurança:** a camada de IA (LLM/visão) **nunca** comete o ato fiscal.
Ela só monta um `EmissionIntent` validado; quem emite é o `IFiscalProvider`
(determinístico, server-side). A parte probabilística prepara; o ato fiscal é código.

### Reuso da Vereda (referência `Kapty.Chat/CódigoContexto/api-whatsapp`)
Aproveitar **apenas a mecânica de WhatsApp**: ciclo WPPConnect/QR, `safeSendText`
(migração LID), buffer/detecção de turno, e o **pipeline de mídia** (áudio→Whisper,
imagem, PDF) — central para "conferir comprovante". **Descartar** todo o domínio da
Vereda (alertas/SLA/snooze/inatividade, `mongo.ts` morto, keywords/seed específicos).

## 4. O loop do Kaua (Seção 2 — aprovada)

### 4.1 Princípio de controle
**Máquina de estados determinística (código) + LLM como ajudante com coleira.** O
código é dono do fluxo, transições, validações e disparo. O LLM faz só: (1) escrever
a resposta em linguagem natural do passo atual; (2) extrair dados estruturados de
texto/mídia. O LLM **propõe**; o código **valida e decide**. O LLM nunca muda de
estado sozinho nem dispara emissão. (LLM-driven-agent foi descartado para o MVP por
não garantir ordenação/invariantes em terreno fiscal.)

### 4.2 Estados e transições
`New/Chatting → CollectingIdentity → ValidatingCpf → AwaitingComprovante →
VerifyingComprovante → ReadyToEmit → Emitting → Done` (volta a Chatting). `HumanHandoff`
alcançável de qualquer estado.

| Estado | Gatilho / o que o Kaua faz | Validação | Transição |
|---|---|---|---|
| New/Chatting | Responde dúvidas gerais (instructions + conhecimento). Detecta intenção "quero a nota / já paguei". | — | → CollectingIdentity |
| CollectingIdentity | Pede nome + sobrenome + CPF; extrai (LLM). | — | → ValidatingCpf |
| ValidatingCpf | Dígito verificador (VO `Cpf`, local) + `ICpfProvider.lookupName` e match normalizado com o nome digitado. | inválido/não bate → pede de novo (**N tentativas** → handoff) | OK → `upsertCustomer` (dedup) → AwaitingComprovante |
| AwaitingComprovante | Confirma o **valor esperado** (preço do serviço; confirma com o paciente se ambíguo) e pede o comprovante. | — | → VerifyingComprovante |
| VerifyingComprovante | `IComprovanteAnalyzer` (visão) extrai valor/pagador/recebedor; código cruza. | recebedor == prestador **E** valor == esperado (tolerância) **E** `confidence ≥ limiar` | falha/baixa confiança → handoff; OK → ReadyToEmit |
| ReadyToEmit | Monta `EmissionIntent` (tomador validado + serviço/valor + flags). | sanitiza texto livre (anti-injeção) | → Emitting (dispara async) |
| Emitting | `IFiscalProvider.emitNfse` (determinístico; mock agora; async/fila pro real). | — | → Done |
| Done | Envia o PDF (DANFSe) ao paciente; confirma. | — | → Chatting |
| HumanHandoff | Bot calado; humano assume (interrupt/resume). | — | retomável |

### 4.3 Portões de validação (onde mora a segurança)
- **CPF:** dígito (local, `Cpf` VO) → `ICpfProvider` + comparação **normalizada** (sem
  acento/caixa, tolerante a nome do meio). 2 tentativas → handoff (configurável).
- **Comprovante:** recebedor == prestador **E** valor == esperado (tolerância de
  centavos) **E** `confidence ≥ COMPROVANTE_MIN_CONFIDENCE` (0.8). Abaixo → humano.
- **Sanitização:** nome/descrição do paciente são escapados/limitados antes de entrar
  no `EmissionIntent` (fecha o risco de injeção de XML observado na emissão real).

### 4.4 EmissionIntent + disparo determinístico
Passando tudo, o código monta o `EmissionIntent` (`status: ready`) e **despacha** a
emissão como ação **assíncrona** (fila/worker — desenhado assim porque emitir + gerar
PDF é IO pesado). Retorna `chave + PDF`; Kaua envia o PDF. O LLM não participa.

### 4.5 Bordas
Paciente recorrente (dedup por CPF, pula coleta) · mensagem fora de contexto (Kaua
reconduz) · **coalescer turno** (junta a rajada de bolhas antes de chamar o LLM) ·
handoff a qualquer momento · timeouts/retry nas chamadas de LLM/provider.

## 5. Decisões registradas
1. Produto é **startup à parte**; Kapty = provedor fiscal externo; **sem falar com a Kapty por ora** (fiscal mockado).
2. **1 serviço** standalone (não 3): WPP + cérebro + orquestração no mesmo Node/TS, atrás de portas. Kapty.AI (Python) **não** entra no MVP.
3. Controle **determinístico + LLM-helper**.
4. Comprovante exige **recebedor + valor + confiança** (valor esperado = preço do serviço; confirma com paciente se variar).
5. **Inbound-only** agora; outbound é futuro.
6. CPF: dígito local + fonte externa (mock→SERPRO). BrasilAPI **não** tem CPF (verificado).
7. **Mensageria = Evolution API (modo Baileys)** atrás do `IMessagingProvider` (deep-research verificada, jun/2026): leve (sem Chromium, ~dezenas de MB), Node/TS, REST + webhook, e **dual-mode** → flip pra Meta Cloud API é config, não reescrita. Custo piloto ~US$5-10/mês (infra self-host). Risco de ban (não-oficial) aceito no interino — o número é do cliente. Alternativa zero-ban/zero-migração era ir direto oficial via 360dialog (EUR49/nº, mensageria in-window R$0), mas depende da Meta Business Verification, que **ainda não saiu**.
8. **IA agnóstica de provedor** (`IAIProvider`): OpenAI hoje → swap com 1 implementação; **modelo por env** (`AI_MODEL_CHAT`/`AI_MODEL_VISION`, GPT-5.x), sem hardcode (gpt-4o era default preguiçoso, descartado).
9. **Deploy**: Megus **co-locado** com o Evolution no MESMO VPS Hostinger (Docker). **Não Vercel** — serverless perde o estado in-memory e mata o processamento pós-ack do webhook. Escala futura: Render/Railway/Fly ou Azure App Service.
10. **Banco do Megus = Azure SQL free** (já criado: `megusdata`/`megusDB`). O **Evolution** tem **Postgres + Redis próprios** no VPS (estado dele), separados do Azure SQL.

## 6. Pendências / decisões abertas
1. ~~Provedor de mensageria~~ **DECIDIDO: Evolution API (Baileys) → Meta Cloud API depois** (§5.7). Resta: subir a instância do Evolution na Hostinger + apontar o webhook de entrada pro Megus.
2. **Infra**: **Azure SQL free** = banco próprio do Megus (já criado). **Evolution** roda em VPS Hostinger (Docker) com **Postgres + Redis próprios**; o **Megus é co-locado** no mesmo VPS. Redis do Megus não é necessário no MVP (estado in-memory).
3. **Provider fiscal real** (adapter Kapty) e **CPF real** (SERPRO) — depois.
4. **Conhecimento/RAG** (files do wireframe) e **tela de gestão/inbox** — depois.
5. ~~Confirmar na revisão~~ **Resolvido:** valor esperado = **preço do serviço** (Kaua confirma com o paciente se variar); **2 tentativas** de CPF antes do handoff (configurável via env).

## 7. Critério de aceite (caminho feliz do piloto)
Paciente manda "agendei e já paguei, e a nota?" → Kaua pede nome+CPF → valida (dígito
+ CPF↔nome) → cria/dedup cliente → pede comprovante → confere recebedor/valor/confiança
→ emite NFS-e (mock) → envia o PDF ao paciente. Em qualquer incerteza (CPF não bate,
comprovante de baixa confiança), cai para handoff humano.
