# Fase 6 — Frontend (Task 4) — Report

Branch: `feat/kaua-cerebro`. Plano: `docs/superpowers/plans/2026-07-05-kaua-fase6-personalizacao.md` (`### Task 4`).
Backend (Tasks 1-3) já estava pronto e testado — ver `.superpowers/sdd/p6-backend-report.md`. Confirmei o contrato lendo `src/infrastructure/http/api/routes/agente.routes.ts` direto: `GET/PUT /api/agente` devolvem/aceitam `{ name, segment, tone (formal|equilibrado|descontraido), emojis: bool, lang (pt|en|es), instructions, fewShotDialogs: {q,a}[] }` + `integrationId` (só leitura); o `PUT` faz spread sobre o `AgentConfig` existente, preservando `capabilities`/`knowledgeFiles`.

## Arquivos tocados

- **Criado** `src/frontend/Megus Wireframe/src/agente/agenteService.js` — `window.MegusAgente = { carregar(), salvar(persona) }`, no molde de `empresaService.js` (usa `window.MegusApi.get/put`, registra em `window.API_ROUTES.agente`).
- **Modificado** `src/frontend/Megus Wireframe/src/whatsapp/AtendenteVirtualModal.jsx`:
  - `MegusAtendenteModal` aceita prop `initial` (persona do backend). `isEdit = !!initial`.
  - `mapPersonaParaCfg(p)` (função de módulo, usada no `useState` inicial de `cfg`) faz o prefill.
  - `handleSalvar()`: se `!isEdit`, comportamento 100% original (`(onSaved||onClose)(cfg)` → abre o QR). Se `isEdit`, chama `window.MegusAgente.salvar(...)`, mostra mensagem de sucesso/erro no rodapé (`salvarMsg`), e em caso de sucesso fecha o modal ~900ms depois (dá tempo do usuário ver a confirmação) chamando `(onSaved||onClose)(cfg)`; em erro, mantém o modal aberto com a mensagem e permite tentar de novo.
  - Header (breadcrumb/título) e footer (texto de ajuda/label do botão) mudam de texto conforme `isEdit`, só cosmético — não muda nenhum branch de código do fluxo de onboarding.
- **Modificado** `src/frontend/Megus Wireframe/src/agente/AgentePage.jsx`:
  - Novo estado `personaInitial/personaOpen/personaErro` + `abrirConfigurarAgente()` (`await window.MegusAgente.carregar()` → se `success`, abre `<window.MegusAtendenteModal initial={...} onClose/onSaved={() => setPersonaOpen(false)} />` direto, sem passar pelo `MegusWhatsAppFlow`/QR).
  - Novo botão de header **"Configurar agente"** (ícone `robot`), ao lado do botão de onboarding existente.
  - O botão de onboarding existente foi **renomeado** de "Configurar" para **"Reconectar"** (só o label + `title`, o `onClick={() => setFlowOpen(true)}` e o `MegusWhatsAppFlow` continuam idênticos) — evita dois botões chamados "Configurar" fazendo coisas diferentes lado a lado.
  - A aba "Configuração" (que já existia como `Placeholder` com CTA "Abrir configuração" → antes chamava o mesmo `setFlowOpen(true)` do onboarding, o que estava semanticamente errado) agora chama `abrirConfigurarAgente` e o CTA virou "Configurar agente".
- **Modificado** `src/frontend/Megus Wireframe/app.html` e `auth.html`: `window.MEGUS_API_BASE` trocado de `http://localhost:3000` → `http://187.77.253.134:3000` (VPS); adicionado `<script src="src/agente/agenteService.js"></script>` na lista de services (depois de `conversasService.js` no app.html; depois de `authService.js` no auth.html — não há tela de agente lá, mas o arquivo só define `window.MegusAgente` e não faz nada sozinho, então é inofensivo incluir por consistência com o pedido).

## Onde fica o botão "Configurar agente"

No header da `MegusAgentePage` (`src/agente/AgentePage.jsx`), ao lado do botão "Pausar/Retomar agente" — é o lugar mais simples porque a página já representa "workspace de UM agente específico" (tem `agente.id`/nome/número), então não precisa resolver qual agente editar. Também troquei o CTA da aba "Configuração" (mesma página) para o mesmo fluxo, já que ele estava incorretamente apontando pro onboarding.

## Mapa de campos (backend ↔ modal)

| Backend (`persona`)         | Modal (`cfg`)     | Observação |
|---|---|---|
| `name`                      | `nome`            | default `'Kaua'` se vazio (backend exige `min(1)` no PUT) |
| `segment`                   | `segmento`        | default `'saude'` se vazio |
| `tone`                      | `tom`             | enum idêntico (`formal\|equilibrado\|descontraido`) |
| `emojis`                    | `emojis`          | boolean direto |
| `lang` (`pt\|en\|es`)       | `idioma` (`pt-BR\|en\|es`) | `pt→'pt-BR'` na leitura; `'pt-BR'→'pt'` na gravação |
| `instructions`              | `instrucoes`      | direto |
| `fewShotDialogs [{q,a}]`    | `exemplos [{cliente,agente}]` | `q→cliente`, `a→agente` (e volta) |
| *(fora do escopo)*          | `emitirNota, tipoDoc, servicos, arquivos` | não vêm do GET nem são enviados no PUT — ficam com os defaults locais da seção 4/5 do modal; o backend preserva o que já tinha |

## Como preservei o onboarding

- `AtendenteVirtualModal` só entra em "modo edição" quando recebe `initial` — o `MegusWhatsAppFlow` (usado por `IntegracoesPage` e pelo botão "Reconectar" da `AgentePage`) continua chamando `<window.MegusAtendenteModal onClose={...} onSaved={(cfg) => {...; setStep('qr')}} />` **sem** `initial`, então `isEdit` é `false` e o botão salvar cai direto no `(onSaved||onClose)(cfg)` original — zero chamada de rede, zero mudança de comportamento.
- Rodei `npm test` (69 passed, 1 skipped — mesmo baseline do report do backend) e `npm run typecheck` (limpo) depois das mudanças; nenhum arquivo de backend foi tocado nesta task.

## Commit

`c481be0` — `feat(agente): painel edita persona via /api/agente (modal modo edicao) + base URL VPS`

## Concerns / só dá pra validar no navegador

- **Fluxo ponta a ponta real**: não rodei o app no navegador (frontend é local, sem build/deploy — a task disse que não precisava). O que valida no código: contrato de campos batendo 1:1 com `agente.routes.ts` (lido direto), `window.MegusApi`/envelope `ResultResponse` usado do mesmo jeito que `empresaService.js`/`MinhaContaModal.jsx`. O que só um teste manual confirma: o `setTimeout(900ms)` antes de fechar não deixa a UI "travada" nem dispara warning de `setState` em componente desmontado (não deveria, já que só chama `onSaved/onClose` depois, sem `setState` posterior) — e o CORS do VPS (`http://187.77.253.134:3000`) aceitando requisições da origem `file://`/`localhost` de quem abrir `app.html` localmente.
- **Seções 4 e 5 (serviços/arquivos) em modo edição**: como o GET de `/api/agente` não devolve `capabilities`/`knowledgeFiles` (fora do escopo desta fase, por design do plano), essas duas seções do modal abrem com os defaults locais (`emitirNota:true, tipoDoc:'NFS-e', servicos:[], arquivos:[]`) mesmo que a empresa já tenha serviços vinculados no backend. Isso é inofensivo pro dado real (o `salvar()` só manda os campos de persona, então o PUT preserva o que já existe no banco), mas é **enganoso na UI**: o admin pode achar que não há serviços cadastrados quando na verdade há. Não mexi nisso porque está explicitamente fora do escopo da Task 4 (Global Constraints do plano), mas é um ponto pra decisão do Pietro/próxima fase — hoje não há dado real pra mostrar ali sem estender o GET.
- **Botão "Reconectar"**: renomeei o botão de onboarding existente (antes "Configurar") pra não colidir com o novo "Configurar agente". Funcionalmente idêntico (mesmo `onClick`), só o texto mudou — mas é uma mudança de UI que vale o Pietro bater o olho.
- Não validei contra o backend real do VPS (sandbox não alcança a rede externa) — a mudança de `MEGUS_API_BASE` assume que a porta 3000 do VPS está exposta e com CORS liberado para quem abrir o wireframe local, o que é responsabilidade da Task 5 (deploy), não desta.
