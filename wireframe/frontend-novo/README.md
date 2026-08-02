# Megus · frontend novo — guia de aplicação

Adaptação do protótipo aprovado (`Megus Prototipo/app.html`) para a **estrutura,
convenções e linguagem do frontend atual**: Vite + React 18 + TS, Tailwind +
shadcn/ui, `@tanstack/react-query`, `react-router-dom`, `sonner`, alias `@/`.

Nada aqui inventa padrão novo. `lib/api.ts` (`apiFetch` + `ResultResponse`),
`context/AuthContext`, `hooks/useAuth`, `components/RequireAuth`,
`components/ui/*` e o formato dos `services/*.ts` continuam exatamente como
estão no repo.

---

## Ordem de aplicação

> **Fatiado, e nesta ordem** — há cliente real em produção. 1–2 re-vestem tudo
> sem tocar em tela; depois Shell; depois as telas que já funcionam sem backend
> novo; Hoje e Integrações entram por último, agora com fallback próprio.

Aplique **1 e 2 primeiro e rode o app**. Como os componentes existentes já usam
tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`), a troca
da paleta re-veste todas as telas atuais sem tocar nelas.

| # | Arquivo | O que acontece |
|---|---|---|
| 1 | `src/index.css` | **substituir** — paleta nova + 2 temas via `data-theme` + `.entra-pagina` |
| 2 | `tailwind.config.ts` | **substituir** — expõe `menta`/`terra`/`areia`/`gesto` |
| 3 | `src/lib/utils.ts` | **substituir** — ganha `formatarBRL` e `diasParado` |
| 4 | `src/components/Brand.tsx` | **substituir** — marca manuscrita (3 variantes) |
| 5 | `src/components/ui/megus.tsx` | novo — primitivos da marca (`Rotulo`, `Num`, `Avatar`, `Marco`, `Kpi`, `Secao`, `TituloPagina`, `Vazio`, `Campo`) |
| 6 | `src/hooks/useTema.ts` | novo — tema creme/sálvia |
| 7 | `src/components/Shell.tsx` | **substituir** — nav em 2 grupos, trilho de iPad, abas de celular |
| 8 | `src/lib/ativacao.ts` · `src/hooks/useAtivacao.ts` | novos — quais conexões faltam (sem tela própria) |
| 9 | `src/pages/Hoje.tsx` + `src/components/hoje/*` + `src/services/hoje.ts` | substitui `pages/Home.tsx` |
| 10 | `src/pages/Financeiro.tsx` + `src/components/financeiro/*` + `src/services/pipeline.ts` | substitui `pages/Cobrancas.tsx` |
| 11 | `src/pages/Conversas.tsx` + `src/services/raciocinio.ts` | **substituir** |
| 12 | `src/pages/Agentes.tsx` · `Clinica.tsx` · `Conta.tsx` | **substituir** |
| 13 | `src/pages/Integracoes.tsx` + `src/services/ferramentas.ts` | **substituir** (o service ganha `listFerramentas`/`conectar` e mantém o OAuth da agenda) |
| 14 | `src/pages/Login.tsx` · `Cadastro.tsx` + `src/components/auth/PainelMarca.tsx` | **substituir** — split com foto de clínica |
| 15 | `public/img/*.jpg` | novos — as 3 fotos do painel de autenticação |
| 16 | `src/components/ui/button.tsx` | **substituir** — acrescenta a variante `quieto` (link de ação) |
| 17 | `src/hooks/useHoje.ts` | novo — fallback da Hoje sem `GET /api/hoje` |
| 18 | `src/App.tsx` | **substituir** — rotas novas + redirects das antigas |

### Verificar antes de subir

`frontend/tsconfig.json` é arquivo de *project references* com `"files": []` —
`npx tsc --noEmit` compila **zero arquivos** e sempre passa. Use:

```bash
npx tsc -p tsconfig.app.json --noEmit && npm run build
```

### Arquivos a remover depois
- `src/pages/Home.tsx` → `pages/Hoje.tsx`
- `src/pages/Cobrancas.tsx` + `components/cobrancas/` → `pages/Financeiro.tsx`
- `src/pages/Atendimentos.tsx` + `components/atendimentos/` → coberto por Conversas + Agentes
- `src/pages/Onboarding.tsx` + `components/RequireOnboarding.tsx` → não há tela de onboarding
- `src/hooks/useOnboardingStatus.ts` → `hooks/useAtivacao.ts`
- `src/components/AuthBackdrop.tsx` → `components/auth/PainelMarca.tsx`

### Renomes de rota
`/empresa` → `/clinica` · `/agente` → `/agentes` · `/cobrancas` → `/financeiro` ·
`/` continua sendo a home (agora Hoje). `/atendimentos` deixa de existir.

As antigas ficam como **redirect** em `App.tsx` (há cliente em produção e ela pode
ter bookmark) — sem isso caíam no `*` e iam para a home sem explicação.

---

## A paleta, e por que ela tem 3 papéis

Um token, um significado. Se a regra for seguida, ninguém precisa decidir cor
ao escrever tela nova:

- **grafite** (`primary`) — estrutura: sidebar, texto, botão principal. Neutro
  quente, não navy. Foi ele que resolveu o problema de a paleta anterior lembrar
  outra marca.
- **menta** (`menta`, `menta-soft`, `menta-ink`) — **deu certo**: pago, nota
  emitida, agente no ar, passo concluído.
- **terracota** (`terra`, `terra-soft`, `terra-ink`) — **precisa de humano**:
  parado, divergente, bolha de pendência, meta.
- **areia** (`areia`, `areia-soft`) — base quente. É o que tira o ar de fintech
  genérica que menta + cinza teria sozinho.

`--gesto` é o único token que o tema troca. E ele tem **duas variantes por
fundo**, não uma: `--gesto` (sobre fundo claro) e `--gesto-inv` (sobre fundo
escuro). Sem isso a marca desaparecia na sidebar grafite e nos avatares.

| | fundo claro | fundo escuro |
|---|---|---|
| **creme** | grafite `#252826` | creme `#F5F4EF` |
| **sálvia** | sálvia `#3A6B4E` | menta clara `#A8CDB6` |

Não é dark mode — nenhuma outra cor muda. Nunca passe `cor="#fff"` para a marca:
use `fundo="escuro"` e deixe o token resolver.

⚠️ `--accent` voltou à semântica real do shadcn (superfície de hover). Antes era
um azul saturado usado como cor de marca, o que deixava o hover de botão `ghost`
escuro. Se alguma tela usava `text-accent` para dar cor, troque por `text-menta`
ou `text-terra`.

### Gramática visual
Regras que mantêm as telas coerentes sem precisar de revisão:

- **Ícone em quadrado tintado: não.** Use `Rotulo` (micro-caps em mono) ou um fio
  de 2px na margem. Ícone só quando carrega significado (10px na linha de
  raciocínio, seta de botão).
- **Círculo significa pessoa.** Avatar é redondo; status, contador e marcador de
  passo são quadrados em mono.
- **Seção não é cartão.** Cabeçalho com fio embaixo e conteúdo respirando no
  papel. `caixa` só quando a seção é um objeto destacado de verdade.
- **Número em posição de dado usa `Num`** (mono tabular) — é o que alinha coluna.
- `font-bold`, nunca `font-extrabold`; `rounded-[8px]`/`[10px]`, nunca
  `rounded-xl`.

---

## Não há onboarding

Havia: boas-vindas pós-cadastro, cartão de ativação na Hoje, simulação do agente
e dicas contextuais. **Tudo removido.** A clínica-piloto foi ativada junto com o
fundador, e o produto tem uma tela por assunto — o custo de manter quatro camadas
de explicação superou o que elas entregavam.

O que sobrou é o que tem valor sem tela própria: **`useAtivacao`** deriva quais
conexões faltam (WhatsApp, agenda, serviços/Pix e — só se `capabilities.fiscal` —
provedor fiscal), sem flag nova no backend. Hoje ele serve o rodapé de
Integrações; qualquer aviso futuro parte dele.

Ao reintroduzir algo do tipo, duas lições ficaram registradas:

- **Ancore a dica perto do que ela descreve.** Flutuando à direita, a dica da Hoje
  cobria os botões "Resolver"/"Abrir".
- **Ícone e texto têm de ramificar na mesma condição.** Um ✓ sobre "Nada
  encontrado" diz o contrário da frase.

---

## A Hoje: a resposta vem escrita

Quem abre esta tela três vezes por dia não quer navegar — quer saber se está tudo
bem. Então a resposta vem em display, no topo, calculada dos dados: *"3 casos
travados. O resto do dia correu sozinho."*, com quanto está **esperando decisão**
e quanto **já foi recebido**.

Daí decorrem três exigências que valem para qualquer tela futura:

**1 · "Ainda não chegou" é um terceiro estado.** Nunca trate `undefined` como
"carregado e zerado": a manchete afirmaria "Nada travado" e a faixa diria
"faltam R$ 0,00" (que lê como *meta batida*) durante todo o load. Use o
parâmetro `pronto` — a tela **pergunta** ("Verificando o dia…") em vez de
afirmar, com esqueleto no lugar dos números.

**2 · Esqueleto reserva a altura final.** `EsqueletoPendencias` inclui a faixa de
cabeçalho (26px) e usa `h-16` por linha, e o `h1` tem `min-h-[2.3em]`. Sem isso a
página pulava 86px quando os dados chegavam.

**3 · Controle vazio não aparece.** "Ver as 0 ações do Kaua" era um botão vivo
que não oferecia nada — e era exatamente o estado de conta nova. Renderize com
`{trilha.length > 0 && …}`.

A cor de cada linha de pendência vem do **tipo** (`ESTILO_PEND[tipo].cor`),
inclusive no motivo. "Pediu humano" é informação, não erro — pintá-lo de vermelho
contradiz o próprio rótulo da linha.

---

## Carregando não é vazio

A Hoje trata **"ainda não chegou"** como estado próprio (`pronto`), não como
"chegou zerado". Sem isso a manchete afirma "Nada travado" com confiança durante
todo o load — e numa tela cuja tese é a resposta escrita, resposta errada é o pior
defeito possível. Enquanto carrega ela **pergunta**: *"Verificando o dia…"*, com
esqueleto na tabela, no ciclo e na faixa de meta.

Os esqueletos têm a **altura final** (linha de 64px + cabeçalho de 26px; faixa com
`md:min-h-[38px]`; `h1` com `min-h-[2.3em]`). Sem isso a página saltava 86px
quando os dados chegavam. Pelo mesmo motivo "faltam R$ 0,00" não pode aparecer no
load: lê como meta batida.

---

## iPad e celular

Clientes vão usar em tablet e telefone, então o Shell tem **três modos**:

| largura | navegação |
|---|---|
| ≥1024 | barra lateral completa (216px) |
| 768–1023 | **trilho de ícones (68px)** — iPad em retrato não paga menu inteiro |
| <768 | **barra superior + abas embaixo**, no alcance do polegar |

No celular, Operação (Hoje · Conversas · Financeiro) são abas fixas e
Configuração vive numa folha "Mais". Além disso: **Conversas** é mestre-detalhe
com botão de voltar (a grade fixa de 300px espremia o chat), o **kanban** rola na
horizontal com colunas de 268px e `snap`, o funil vira 2×2 e a tabela de
pendências desmonta em blocos empilhados.

⚠️ **Nunca ponha `transform` no wrapper de transição de página.** Um `transform`
ali (mesmo identidade, mesmo só durante a animação com `fill-mode: both`) torna o
elemento *containing block* de todo `position: fixed` das telas — a barra de ações
em lote do Financeiro saía 146px do centro e as gavetas ficavam confinadas. Por isso
`.entra-pagina` anima **só opacidade**. Pelo mesmo motivo, centralize a barra de
lote com `mx-auto w-fit`, não com `left-1/2 -translate-x-1/2`.

---

## Quem emite a nota é a clínica

A descoberta do 1º dia com cliente real mudou o desenho do Financeiro: **o Megus
não emite NFS-e** para quem tem `capabilities.fiscal = false`. Ele pergunta "vai
precisar de nota?", registra a resposta, e a clínica emite no sistema fiscal
dela. `notaEmitida` mudou de sentido no fluxo Charge: hoje significa **"a clínica
marcou que emitiu"**.

Isso criou uma etapa que faltava. O ciclo tem **cinco**, não quatro:

```
agendado → cobrado → pago → nota pedida → nota emitida
```

**"Nota pedida" é a fila de trabalho da clínica** — pagou, pediu nota, ela ainda
não emitiu. Por isso o card dessa coluna tem ação própria ("Já emiti") em vez de
esperar arrastar: é a única coluna onde a pessoa trabalha. Sem ela, a clínica
volta a reler conversa para saber de quem é a nota — o problema que a pergunta
automática resolveu.

`situacaoNota()` distingue quatro casos, e a distinção é proposital:

| situação | o que significa | onde aparece |
|---|---|---|
| `pedida` | fila da clínica | coluna própria + botão |
| `dispensada` | "não quis" — **ciclo fechado** | fica em Pago, nota discreta |
| `aguardando` | o agente ainda perguntando | fica em Pago |
| `emitida` | a clínica emitiu | última coluna |

Fundir `dispensada` com `aguardando` faria a clínica emitir nota de quem não
pediu. Mesma razão pela qual **comprovante rejeitado** ("os dados não conferem")
não pode aparecer como **falha de leitura** ("não consegui ler"): confundir as duas
faz cobrar o paciente errado.

### Ativação depende da capacidade, não do que está conectado

O passo `fiscal` **só entra na lista** quando `capabilities.fiscal === true`
(`passosDe()` em `lib/ativacao.ts`). Clínica que emite por fora nunca vai conectar
provedor — cobrar esse passo dela travava a barra em 80% e tornava "Tudo pronto"
inalcançável. Por isso `useAtivacao` devolve `passos`, e a UI itera sobre ele em
vez da constante.

Mesma distinção em Integrações: **"agenda conectada" ≠ "o agente agenda"**. Se a
conta Google está ligada mas `capabilities.agenda === false`, o cartão diz isso —
senão a pessoa não entende por que o agente não marca nada.

### Desconectar é rotina

Trocar de número ou de conta Google acontece (a ativação da primeira clínica
dependeu disso — o número estava pareado em duas instâncias e a agenda era a
pessoal do fundador). O botão **Desconectar** fica ao lado de "Gerenciar", só
quando conectado, com confirmação que **mostra o alvo**. Erro do provedor não
limpa o estado — a lista é recarregada do servidor.

---

## O dado deliberado manda, o formato não

Cinco dos sete fixes do 1º dia foram o sistema exigindo que a clínica escrevesse
do jeito dele. **Eles estavam certos e o código errado.**

Vale para UI: se uma tela exige que a pessoa digite de um jeito só, ela vai digitar
do jeito dela e a tela vai parecer quebrada. Ao criar campo novo, aceite a forma
que a pessoa escreve e normalize depois — não valide contra uma convenção.

Corolário defensivo já aplicado: `ConversationState` ganhou
`awaiting_nota_answer`, e um status desconhecido derrubava a tela em
`TAG_STATUS[x].cls`. Lookups de rótulo agora têm fallback (`tagDe`, `TAG_TRILHA`)
— o backend evolui, e a UI não pode cair por causa de um rótulo.

---

## Backend: o que falta

Os serviços novos seguem o padrão de sempre (JSDoc apontando a rota). Estas
rotas ainda **não existem** e estão marcadas com `⚠️` no código:

| Rota | Para quê | Enquanto não existe |
|---|---|---|
| `GET /api/hoje` | resumo do dia: pendências, funil, trilha, meta | **`hooks/useHoje.ts` compõe de `/api/cobrancas` + `/api/empresa` + `/api/agente`** — a home não quebra |
| `POST /api/hoje/pendencias/:id/resolver` | tirar caso da fila humana | `catch` resolve no cliente |
| `POST /api/cobrancas/:id/etapa` | arrastar card entre colunas | `cobrar` e `charges/:id/nota-emitida` têm rota própria; as outras avisam via toast |
| `GET /api/conversas/:id/raciocinio` | o que o agente entendeu | painel fica vazio |
| `GET /api/integracoes` | estado das 4 conexões numa lista | **`listFerramentasFallback()`** compõe de agenda + whatsapp + empresa + serviços |
| ~~`POST /api/integracoes/:id/conectar`~~ | — | **descartada**: cada conexão tem fluxo próprio; o botão roteia (QR / OAuth / navegar) |

Os dois fallbacks devolvem **o mesmo tipo** da rota definitiva. Quando ela subir,
a troca é de uma linha (`useHoje()` → `useQuery(getResumoHoje)`,
`listFerramentasFallback` → `listFerramentas`) e o arquivo de fallback é apagado.

**O fallback da Hoje não inventa dado:** pendências e trilha vêm vazias, porque
exigem o motivo do bloqueio e o log de ações — que só existem no backend. O funil
e o recebido são reais, derivados de `/api/cobrancas` pela mesma função do kanban
(`etapaDe`). No fallback de ferramentas, `fiscal` fica sempre pendente: não há
status de provedor, e afirmar "conectado" sem saber seria pior.

O kanban **não** precisa de rota nova: a etapa é derivada das flags que
`/api/cobrancas` já devolve (`services/pipeline.ts` → `etapaDe`). Uma fonte de
verdade só — se o backend muda o significado de `pago`, o kanban acompanha.

Dois campos novos em `GET /api/hoje` sustentam a tabela de pendências:
`valor` (quanto está parado, para somar a manchete) e `motivo: {chave, valor}`
(o dado que decide — "CPF informado: 111.222.333-44"). Sem eles a pessoa precisa
abrir a conversa para saber o que fazer.

`useAtivacao` assume dois campos em `/api/empresa` (`pixKey`, `services[]`) e
dois ids na lista de ferramentas (`agenda`, `fiscal`). Ajuste os seletores se os
nomes diferirem.

O cadastro faz `register` **e depois** `login` com as mesmas credenciais, porque
`POST /api/auth/register` não autentica. Se o backend passar a devolver token,
remova o segundo passo em `pages/Cadastro.tsx`.
