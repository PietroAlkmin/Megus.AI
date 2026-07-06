# Megus AI — Frontend

Documentação técnica do painel web do Megus AI: onde o dono da empresa
cadastra os dados dela, configura a persona do agente "Kaua" e conecta o
número de WhatsApp que vai atender pelos clientes.

Este documento cobre o front **novo**, em `frontend/` (Vite + React + TS),
que é o que deve receber trabalho novo daqui pra frente. Existe também uma
versão **antiga**, em `src/frontend/Megus Wireframe/`, mantida em paralelo
por enquanto — ver seção 8 sobre quando e como aposentá-la.

## 1. Visão geral

Stack: **Vite + React 18 + TypeScript strict**, Tailwind CSS + shadcn/ui,
`react-router-dom` v6, `@tanstack/react-query` para todo estado de servidor,
`react-hook-form` + `zod` para formulários. É o mesmo padrão já usado no
`Kapty.WebStatic` (outro produto do mesmo grupo) — escolhido deliberadamente
para reaproveitar know-how e configuração, não porque o Megus precise de algo
idêntico ao Kapty visualmente. O **look e os tokens de cor da marca Megus**
foram preservados 1:1 a partir do wireframe antigo (`tokens.js`) — a
re-plataforma trocou a stack técnica, não o design.

O backend não mudou nada para viabilizar este front: os mesmos endpoints já
existentes (`/api/auth/*`, `/api/empresa*`, `/api/agente`,
`/api/agente/whatsapp/*`) documentados em `docs/backend.md` são consumidos
como estão.

## 2. Estrutura de pastas

```
frontend/
  index.html                fontes Google (Inter/Sora/JetBrains Mono) via <link>
  vite.config.ts             plugin react-swc, alias "@" → src/, porta 5173
  tailwind.config.ts         mapeia as CSS vars HSL da marca pros tokens shadcn
  components.json            config do shadcn/ui
  .env / .env.example        VITE_API_URL
  src/
    main.tsx                  entrypoint — monta <App/>
    App.tsx                   QueryClientProvider + BrowserRouter + Toaster + rotas
    index.css                 @tailwind + tokens HSL da marca + fontes
    vite-env.d.ts
    lib/
      api.ts                  cliente HTTP único (apiFetch) — desembrulha ResultResponse
      utils.ts                cn() (clsx + tailwind-merge)
    services/                 1 arquivo por recurso de backend: auth, empresa, agente, whatsapp
    context/AuthContext.tsx   estado do usuário logado
    hooks/
      useAuth.ts               consome o AuthContext
      useOnboardingStatus.ts   deriva o progresso do onboarding a partir dos próprios dados
    components/
      ui/                      primitivos shadcn (button, input, card, form, select, switch, tabs, textarea, accordion, sonner, label)
      RequireAuth.tsx          guarda de rota
      Shell.tsx                layout autenticado (topbar + sidebar + <Outlet/>)
      Brand.tsx, AuthBackdrop.tsx
      agente/AgenteForm.tsx
      empresa/EmpresaForm.tsx
      whatsapp/WhatsAppConnectPanel.tsx
    pages/
      Login.tsx, Cadastro.tsx           público
      Home.tsx                          dashboard + entrada do onboarding
      Empresa.tsx, Agente.tsx, ConectarWhatsApp.tsx   telas de edição (pós-onboarding)
      Onboarding.tsx                    wizard 3 passos
```

## 3. Configuração

`VITE_API_URL` é a única variável de ambiente do front (`.env.example`):
aponta para a base do backend (ex.: o IP/porta do VPS em produção,
`http://localhost:3000` em dev local contra o backend rodando na máquina).

### 3.1 Cliente HTTP — `lib/api.ts`

Uma função única, `apiFetch<T>(method, path, body?)`, concentra toda chamada
HTTP do front:
- injeta `Authorization: Bearer <token>` lendo o token de `localStorage`
  (`localStorage.getItem("megus_token")`, ver `getToken`/`setToken`/`clearToken`
  no mesmo arquivo);
- desembrulha o envelope `ResultResponse<T>` do backend (`{ success, data,
  message, errors, correlationId, statusCode }` — ver `docs/backend.md` §7) e
  devolve só `data`;
- em qualquer falha (rede, JSON inválido, `success: false`), lança
  `ApiError` (com `message`/`errors`/`statusCode`) — quem chama trata via
  `try/catch` em formulários ou deixa o `@tanstack/react-query` capturar
  (`isError`/`error` nos hooks de query/mutation).

Cada recurso de backend tem seu próprio arquivo em `services/` (`auth.ts`,
`empresa.ts`, `agente.ts`, `whatsapp.ts`) com tipos TypeScript espelhando
exatamente os schemas Zod das rotas correspondentes no backend — lidos direto
do código das rotas, não inferidos.

## 4. Autenticação

`context/AuthContext.tsx` guarda o usuário logado em estado React. Na carga
da página, se já existe token no `localStorage`, valida contra
`GET /api/auth/me`; token inválido/expirado é limpo automaticamente e a
sessão cai para deslogada — sem isso, um token expirado ficaria "preso" dando
erro 401 silencioso nas primeiras chamadas.

`hooks/useAuth.ts` só expõe o contexto (lança erro claro se usado fora do
`<AuthProvider>`).

`components/RequireAuth.tsx` protege as rotas autenticadas: sem token no
`localStorage` → redireciona para `/login` **imediatamente** (síncrono, sem
esperar rede — evita flash de conteúdo protegido); com token, espera o
`GET /me` resolver antes de liberar a renderização (cobre o caso de token
presente mas inválido/expirado).

Não existe endpoint de logout no backend (JWT é stateless) — `logout()` só
limpa o token local.

## 5. O fluxo do zero (onboarding)

Ponto de entrada: **`pages/Home.tsx`**, primeira tela após login. Usa
`hooks/useOnboardingStatus.ts`, que deriva o progresso a partir dos próprios
dados já cadastrados (não existe flag de "onboarding concluído" no backend):
- `empresaDone` = `GET /api/empresa` tem `name` ou `fiscalName` preenchido;
- `agenteDone` = `GET /api/agente` tem `name` preenchido;
- `whatsappDone` = `GET /api/agente/whatsapp/status` devolve `connected: true`.

Enquanto nem tudo estiver pronto, a Home mostra um card "Configure seu
atendente virtual" com um checklist visual dos 3 passos e um botão
"Continuar configuração" → `/onboarding`. Não há redirect forçado (evita
loop se a heurística de "feito" errar); o card é grande e fica no topo — não
é um fluxo escondido atrás de menu.

**`pages/Onboarding.tsx`** é um wizard de 3 passos com um stepper clicável no
topo (cada passo vira ✓ verde quando concluído):
1. **Empresa** (`components/empresa/EmpresaForm.tsx`) — dados cadastrais
   (razão social, CNPJ, endereço etc.) + forma de cobrança (Pix) +
   CRUD de serviços do catálogo NFS-e, tudo via `GET/PUT /api/empresa` e
   `GET/POST/DELETE /api/empresa/servicos`.
2. **Agente** (`components/agente/AgenteForm.tsx`) — persona do Kaua em
   abas (Identidade, Personalidade, Instruções, Exemplos), via
   `GET/PUT /api/agente`. Campos = exatamente o que a rota aceita
   (`name/segment/tone/emojis/lang/instructions/fewShotDialogs`) — nada de
   campo cosmético sem endpoint por trás.
3. **Conectar WhatsApp** (`components/whatsapp/WhatsAppConnectPanel.tsx`) —
   botão "Conectar" → `POST /api/agente/whatsapp/connect` (devolve o QR real,
   base64, da instância Evolution recém-criada/reusada) → `<img>` com o QR →
   **polling** de `GET /api/agente/whatsapp/status` a cada 3s
   (`refetchInterval` do react-query, condicional: para de pollar assim que
   `connected: true`) → mostra "Conectado!" com o número real (vindo do
   `ownerJid` reportado pela Evolution, nunca de input).

Cada passo, ao salvar/conectar, avança automaticamente para o próximo
(`onSaved`/`onConnected`). As mesmas três telas/componentes são reusadas
depois do onboarding em `pages/Empresa.tsx`, `pages/Agente.tsx` e
`pages/ConectarWhatsApp.tsx` — não há duplicação de formulário entre
"configurar pela 1ª vez" e "editar depois".

## 6. Design system

Fonte única de verdade das cores: `src/frontend/Megus Wireframe/src/shared/tokens.js`
(do front antigo) — qualquer alteração de cor deveria entrar ali primeiro e
ser propagada. No front novo, os tokens viram variáveis CSS em HSL
(`src/index.css`, bloco `:root`), mapeadas para as classes utilitárias do
Tailwind em `tailwind.config.ts` (`--primary`, `--background`, `--accent`,
`--warning` etc., no padrão shadcn/ui de `hsl(var(--x))`).

| Token | Hex | Uso |
|---|---|---|
| `brand.primary` | `#2B3A4F` | Cor primária (topbar, botões principais, ícone ativo da sidebar) |
| `brand.primaryDark` / `primaryDarker` | `#1B2736` / `#101A26` | Variações escuras |
| `brand.accent` | `#3E6CA8` | Focus ring, hover de `outline`/`ghost` — mapeado no `--accent` do shadcn (não é o cinza neutro padrão) |
| `status.success` | `#0F6E56` | Estados "feito"/conectado |
| `status.warning` | `#92400E` | Avisos (ex.: "use o número definitivo" no QR) |
| `status.danger` | `#B42318` | Erros, ação destrutiva (sair, excluir) |
| `status.whatsapp` | `#1FA855` | Selo/indicador específico de WhatsApp conectado |
| `surface.page` / `card` / `border` | `#F4F6F8` / `#FFFFFF` / `#E1E6ED` | Fundo, cartões, bordas |

Fontes: **Inter** (texto corrido, `font-sans`), **Sora** (títulos/marca,
`font-brand`), **JetBrains Mono** (`font-mono`) — carregadas via `<link>` do
Google Fonts no `index.html`. Raio de borda: `--radius: 0.875rem` (14px, o
"lg" da marca); `sm`/`md`/`xl` derivam dele por soma/subtração no
`tailwind.config.ts`, reproduzindo a escala original (`sm8/md10/lg14/xl18`)
em vez da fórmula genérica do shadcn CLI.

Os primitivos shadcn/ui (`components/ui/*.tsx`) foram trazidos de duas
formas: os 6 primeiros (`button`, `input`, `label`, `card`, `form`, `sonner`)
foram escritos manualmente a partir do source oficial (ambiente sem acesso
garantido à registry do shadcn no momento do scaffold); os 5 seguintes
(`switch`, `select`, `tabs`, `textarea`, `accordion`) foram instalados via
`npx shadcn@latest add`. `sonner.tsx` não usa `next-themes` (a Megus não tem
modo escuro no design, mesmo padrão do WebStatic).

## 7. Como rodar

```bash
cd frontend
npm install
npm run dev       # Vite, http://localhost:5173
```

`VITE_API_URL` no `.env` decide contra qual backend o front fala (VPS remoto
ou `localhost:3000` local).

**Gate objetivo** (usado como critério de "compila/funciona" antes de
validação visual):

```bash
npm run typecheck   # tsc --noEmit -p tsconfig.app.json (strict completo)
npm run build        # vite build
```

Confirmado rodando neste repositório: os dois passam sem erro (build gera
`dist/` com ~507kB de JS minificado — 1 aviso de chunk grande, não é erro,
apenas sinaliza que dividir em lazy-imports seria uma melhoria futura).
`tsconfig.app.json` está com `strict` completo, incluindo
`noUnusedLocals`/`noUnusedParameters` — mais rígido que o do `Kapty.WebStatic`
(que relaxa esses três por dívida técnica antiga); como projeto novo, não há
dívida herdada a acomodar.

**Validação no navegador ainda não foi feita** neste ambiente de
desenvolvimento (sem acesso a browser) — o que os gates acima garantem é
"compila e tipa certo", não "renderiza e funciona visualmente". Isso é
trabalho pendente explícito antes de considerar o front novo pronto para
substituir o antigo (seção 8).

## 8. Aposentar a versão antiga

`src/frontend/Megus Wireframe/` é o front **anterior**: React carregado via
CDN (sem bundler) com Babel standalone fazendo a transpilação **no
navegador**, em dois pontos de entrada HTML — `app.html` (painel logado) e
`auth.html` (login/cadastro). Organizado por feature em `src/`: `agente/`,
`atendimentos/`, `auth/`, `cobrancas/`, `empresa/`, `integracoes/`, `shared/`,
`shell/`, `whatsapp/` — cada um com sua página `.jsx` e seu `*Service.js`
falando com `window.MegusApi`.

Essa versão está **mantida em paralelo**, de propósito, desde que o front
novo começou a ser construído — não foi apagada nem congelada por acidente,
é uma decisão deliberada de não remover o que ainda funciona antes do
substituto estar validado. Ela deve ser **removida** quando:
1. o front novo (`frontend/`) cobrir o mesmo fluxo funcional (onboarding
   completo + edição de empresa/agente/WhatsApp) — já é o caso hoje, pelo
   gate de compilação; e
2. esse fluxo tiver sido **validado visualmente no navegador**, contra o
   backend real — ainda pendente (seção 7).

Até lá, qualquer correção de bug ou pedido pequeno que só afete o painel
antigo pode continuar indo para `Megus Wireframe/`, mas nenhuma tela nova
deveria nascer ali.

## 9. Decisões (com o porquê)

- **Core-first:** a re-plataforma entregou primeiro o fluxo que faz o
  cliente sair do zero e chegar a "atendente configurado e WhatsApp
  conectado" — não uma paridade 1:1 de todas as telas do painel antigo de
  uma vez. Telas secundárias (seção 10) ficaram para depois de propósito.
- **Manter o look, trocar só a stack.** O objetivo da re-plataforma era
  ganhar tipagem, tooling e componentização — não redesenhar o produto. Os
  tokens de cor/fonte/raio são os mesmos do wireframe, só reimplementados em
  Tailwind/CSS vars.
- **shadcn "manual" onde a rede era incerta.** Os primitivos usados no
  scaffold inicial foram copiados do source oficial em vez de instalados via
  CLI, para não depender de acesso à registry num ambiente que podia não
  ter — os componentes adicionados depois (quando a rede estava disponível)
  já vieram via `npx shadcn add` normalmente.
- **Sem flag de onboarding no backend — heurística no front.** Em vez de
  pedir uma mudança de schema só para marcar "onboarding concluído", o front
  deriva isso dos próprios dados (nome preenchido, WhatsApp conectado). Mais
  simples, mas é uma heurística: não valida completude "de verdade" (ex.: não
  exige nenhum serviço cadastrado antes de liberar a conexão do WhatsApp).
- **Um `apiFetch` só, sem camada de geração de cliente.** Consistente com o
  padrão do `Kapty.WebStatic`; qualquer endpoint novo só precisa de uma
  função em `services/`, sem gerar tipos a partir de OpenAPI/Swagger (que o
  backend também não expõe hoje).

## 10. O que falta

- **Telas secundárias ainda não portadas** do painel antigo: atendimentos ao
  vivo (lista de conversas em andamento, assumir conversa do bot), cobranças
  (status de pagamento/nota/cobrança por cliente), integrações (canais além
  do WhatsApp). Hoje essas rotas de backend existem e devolvem dado de
  exemplo (`USE_MOCK_DATA`, ver `docs/backend.md` §7.2), mas não há tela
  nova para elas — só a versão antiga (`Megus Wireframe/AtendimentosPage.jsx`,
  `CobrancasPage.jsx`, `IntegracoesPage.jsx`) as implementa hoje.
- **Polling do QR reseta ao sair da tela.** O `enabled: started` do
  `useQuery` de status (`WhatsAppConnectPanel.tsx`) depende de um estado
  local (`started`) que volta a `false` se o componente desmonta antes de
  conectar (ex.: usuário navega para outra aba do wizard e volta) — o QR já
  gerado se perde e é preciso clicar "Conectar" de novo. Comportamento
  aceitável (o QR expira de qualquer forma), mas vale confirmar se é o
  esperado ou se merece persistir o estado num nível acima (contexto/URL).
- **QR sem auto-refresh.** O QR devolvido por `POST /connect` não é renovado
  automaticamente enquanto a tela espera o pareamento — se o QR da Evolution
  expirar (comportamento típico de QR de WhatsApp, tipicamente ~60s), a
  imagem fica "morta" na tela sem indicação, e só um novo clique em
  "Conectar" busca um QR novo. Falta decidir entre recarregar
  periodicamente (ex.: a cada ~55s enquanto não conectado) ou pelo menos
  sinalizar visualmente que o QR pode ter expirado.
- **Validação visual no navegador pendente** (seção 7) — todo o trabalho até
  aqui foi validado só por `typecheck`/`build`; abrir o app de verdade contra
  o backend (local ou VPS) e conferir os fluxos, especialmente o tamanho e a
  legibilidade do QR real e o comportamento do polling, ainda não foi feito.
- **Acessibilidade dos cards de seleção do Agente** (segmento/tom, em
  `AgenteForm.tsx`): são `<button>` fora de `FormControl` do
  react-hook-form (não dá pra usar `Slot` num grid de vários botões) —
  funcionam via `field.onChange` direto, mas sem o `aria-*` wiring que um
  input nativo teria.
- **Code-splitting:** o build gera um único chunk de ~507kB (aviso do Vite
  no build) — dividir rotas pesadas via `import()` dinâmico é uma melhoria
  de performance futura, não bloqueante hoje.
