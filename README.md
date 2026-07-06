# Megus AI

Atendente virtual de WhatsApp (**"Kaua"**): conversa com clientes 24/7, coleta e
**valida** dados (nome + CPF), **confere** o comprovante de pagamento e **dispara**
a emissão de uma NFS-e correta, devolvendo o PDF ao paciente.

Produto **standalone** (startup à parte). Um ERP externo entra apenas
como um **provedor fiscal externo** atrás de uma porta. Hoje o fiscal é **mockado**
(a startup ainda não fala com um provedor real).

## Princípios de arquitetura

Clean Architecture + DDD, **agnóstico de provedor** em três dimensões:

- **Mensageria** (`IMessagingProvider`): WPP (não-oficial) hoje → **Meta** (Cloud API) depois.
- **Backend fiscal** (`IFiscalProvider`): mock hoje → um ERP (X-API-KEY) depois.
- **CPF↔nome** (`ICpfProvider`): mock hoje → SERPRO / serviço pago depois.

**Regra dura de segurança:** a camada de IA (LLM/visão) **nunca** comete o ato
fiscal. Ela só monta um `EmissionIntent` validado; quem emite é o `IFiscalProvider`
(determinístico, server-side). A parte probabilística prepara; o ato fiscal é código.

## Estrutura

```
src/
  domain/         regra de negócio pura — entidades, value objects, PORTAS, erros
  application/    casos de uso / loop do Kaua (máquina de estados) — Seção 2 (a desenhar)
  infrastructure/ adapters — mensageria, IA (OpenAI), CPF, fiscal, config, persistência
  main.ts         composition root (DI manual)
```

## Estado atual (esqueleto)

| Peça | Estado |
|---|---|
| Domínio + portas | ✅ definido |
| CPF — dígito verificador (`Cpf` VO) | ✅ portado do `brDocuments.ts` (verificado) |
| Fiscal provider | 🟡 MOCK (`MockFiscalProvider`) |
| CPF provider | 🟡 MOCK (`MockCpfProvider`) |
| Cérebro (OpenAI) | ⏳ stub — Seção 2 |
| Conferência de comprovante | ⏳ stub — Seção 2 |
| Loop do Kaua (máquina de estados) | ⏳ Seção 2 (design a aprovar) |
| Mensageria | ⏳ `NullMessagingProvider` — pendente da pesquisa de provider |
| Persistência (Postgres) | ⏳ pendente confirmação de infra |
| Redis (turno/handoff/fila) | ⏳ pendente confirmação de infra |

## Decisões pendentes

1. **Provedor de mensageria** — pesquisa em andamento: WPP self-host vs SaaS gerenciado vs Meta Cloud API.
2. **Banco** (Postgres) e **Redis** na Hostinger.
3. **Seção 2 do design** — o loop do Kaua: transições de estado, prompts, e como o `EmissionIntent` é montado e disparado.

## Rodar (quando preenchido)

```bash
npm install
cp .env.example .env   # configurar OPENAI_API_KEY etc.
npm run dev            # tsx watch
npm run typecheck      # valida os tipos
```
