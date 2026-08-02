# v4 — o que mudou

Continuação da v3 (contratos do 1º dia com cliente real). Esta rodada é de
**simplificação**: o produto perdeu uma camada inteira e a tela de Conversas foi
redesenhada.

Aplique na ordem — os itens 1 e 2 mexem em arquivos que os outros importam.

---

## 1 · O onboarding foi removido

**Apague:**

```
src/components/onboarding/          (CardAtivacao, DicaContextual, SimulacaoKaua)
src/pages/BoasVindas.tsx
src/hooks/useDicas.ts
src/lib/simulacao.ts
```

**Por quê:** a clínica-piloto foi ativada junto do fundador. Quatro camadas de
explicação (boas-vindas → cartão de ativação → simulação → dicas) custavam mais
manutenção do que entregavam, e o produto tem uma tela por assunto.

**O que sobreviveu:** `lib/ativacao.ts` + `hooks/useAtivacao.ts`. Eles derivam
quais conexões faltam sem flag nova no backend, e hoje servem o rodapé de
Integrações. O passo `simulou` saiu da lista (não havia mais o que assistir), e
com ele o `localStorage` — a ativação agora é **100% derivada do servidor**.

**Ramificações mortas que saíram junto** (esta é a parte que dá trabalho se você
só apagar os arquivos):

| Onde | O que sai |
|---|---|
| `App.tsx` | rota `/boas-vindas`, import de `BoasVindas`, redirect legado |
| `pages/Cadastro.tsx` | redirect para `/boas-vindas` → agora vai para `/` |
| `pages/Hoje.tsx` | prop `vazio`, `<CardAtivacao>`, `<SimulacaoKaua>`, `<DicaContextual>` |
| `pages/Financeiro.tsx` · `Conversas.tsx` · `Agentes.tsx` | `<DicaContextual>` |
| `components/hoje/SecoesHoje.tsx` | parâmetro `vazio` de `Resposta`, `Ciclo`, `TrilhaKaua`, `VazioOk` |

O `vazio` existia para o painel ficar honestamente zerado *enquanto a ativação não
terminava*. Sem cartão de ativação, ele não tem mais função — o que ficou é o
`pronto`, que é outra coisa (carregando ≠ vazio).

---

## 2 · Conversas: o cabeçalho de documento saiu

Arquivo: `src/pages/Conversas.tsx` (**substituir**) · `src/index.css` (novos
keyframes) · `tailwind.config.ts` (keyframe `megus-entra`)

**O diagnóstico:** Hoje e Financeiro são páginas que se **leem**. Conversas é uma
**caixa de entrada**, que se **navega**. O bloco de título com parágrafo consumia
96px para dizer o que a tela já diz sozinha.

| Antes | Depois |
|---|---|
| Título + subtítulo + `<TituloPagina>` | direto na lista |
| 4 chips com frase inteira (overflow em 292px) | **barra segmentada** de 4 células: número em cima, rótulo embaixo |
| "Precisa de você" · "Conduzidas pelo Kaua" … | **Travadas · Kaua · Humano · Todas** |
| Painel de raciocínio: `aside` fixo de 296px | **dobrado dentro do chat**, colapsável |
| Vazio: caixa cinza com texto | ilustração + frase que distingue os casos |

**O painel de raciocínio** era o diferencial do produto pagando caro por isso:
296px permanentes, ~80% de ar, repetindo o que a conversa já dizia. Agora vive
**dentro do chat**, recolhido por padrão e mostrando o essencial na própria linha
recolhida ("CPF não confere", por exemplo). Abre com um clique. Em telas estreitas
ele não desaparece mais — acompanha a conversa.

**Dois defeitos corrigidos no caminho:**

- **A busca mentia.** A conversa aberta era fixada na lista ignorando *tudo*,
  inclusive o texto digitado — buscar `zzzz` mostrava "Nada encontrado" com uma
  conversa visível embaixo. Agora `passaBusca` é extraído, e a fixação só ignora o
  filtro de status.
- **✓ sobre "Nada encontrado".** O ícone ramificava em `vazioTotal` enquanto o
  texto ramificava em `buscando`. Busca sem resultado caía no ramo "sucesso" e
  ganhava um ✓ de tarefa cumprida — a batida de olho dizia o contrário da frase.
  **Regra:** ícone e texto têm de ramificar na mesma condição.

---

## 3 · Clínica em abas

Arquivo: `src/pages/Clinica.tsx` (**substituir**)

Era uma coluna longa: dados fiscais, catálogo de serviços e régua de cobrança
competindo na mesma rolagem, sem prioridade. Virou **três abas** — *Dados* ·
*Serviços* · *Cobrança* — na ordem em que o **agente lê**: prestador que vai na
nota → valor que ele cobra → para onde o dinheiro vai.

Duas decisões que não são óbvias:

- **O rascunho é compartilhado entre as abas.** Trocar de aba não perde o que foi
  digitado, e o rodapé "Salvar" salva tudo junto. Serviços são a exceção — têm
  CRUD próprio e salvam na hora.
- **A aba Serviços mostra a contagem** no próprio rótulo. Sem isso você precisa
  entrar na aba para saber se há catálogo — e catálogo vazio é a causa nº 1 de o
  Kaua não saber quanto cobrar.

---

## 4 · Integrações vira diretório

Arquivos: `src/pages/Integracoes.tsx` (**substituir**) ·
`src/services/ferramentas.ts` (remove `conectar()`)

Padrão de diretório (LangChain, Mailchimp): **busca no topo**, **filtro por
categoria** (Todas · Mensageria · Agenda · Fiscal) e cada conexão como **linha**
com marca, nome, descrição e ação à direita. A grade de dois cartões fazia quatro
conexões ocuparem meia tela sem dizer mais — e piora conforme a lista crescer.

**Sobre os logos:** o resto do produto não usa logo de terceiro (sujam a paleta).
Aqui a exceção se justifica — a tela é literalmente sobre serviços de terceiros, e
você acha o WhatsApp pelo verde antes de ler a palavra. Ficam contidos num
quadrado de 36px com fundo a 10%, para identificar sem competir.

**`conectar()` foi removido do service.** Apontava para
`POST /api/integracoes/:id/conectar`, que não existe — o botão principal da tela
dava 404. Quem roteia agora é a página: QR para o WhatsApp, OAuth em nova aba para
a agenda, navegar para `/clinica` em serviços.

**O contador do cabeçalho vem de `useAtivacao`**, não do tamanho da lista. Clínica
que emite nota por fora não tem passo fiscal — contar "3 de 4" nela seria a mesma
mentira que travava a barra de ativação em 80%.

Mantido da v3: `Desconectar` ao lado de `Gerenciar` (só onde há fluxo real),
confirmação que **mostra o alvo**, e o aviso "conectada, mas o agente não usa a
agenda" quando `capabilities.agenda === false`.

---

## 5 · Os traços ficaram menos rígidos

Arquivos: `src/index.css` · `tailwind.config.ts` · `components/ui/button.tsx` ·
`components/Shell.tsx` · `components/hoje/SecoesHoje.tsx` ·
`components/financeiro/KanbanFinanceiro.tsx`

O desenho estava correto mas duro: tudo aparecia de uma vez, nada respondia ao
toque. O que entrou é **movimento curto e discreto**, não animação:

- `.entra-item` — entrada escalonada por `--i` em listas (conversas, raciocínio)
- `active:scale-[.98]` nos botões e cards — o clique tem peso
- `transition-all` na navegação do Shell
- keyframe `megus-entra` no Tailwind, para os `.tsx` usarem `animate-*`

⚠️ **`.entra-pagina` continua animando só opacidade.** Um `transform` no wrapper
de transição de página (mesmo identidade, mesmo só durante a animação) torna o
elemento *containing block* de todo `position: fixed` das telas — a barra de ações
em lote do Financeiro saía 146px do centro e as gavetas ficavam confinadas.

---

## 6 · Duas regressões que o pacote causaria

Encontradas numa auditoria arquivo a arquivo do pacote contra **produção** — não
contra o wireframe. As duas features existem em produção hoje e **não estavam no
pacote**: aplicá-lo apagaria as duas.

### "Agendar envio" (Financeiro)

Novo: `src/components/financeiro/Agendador.tsx`.
Alterados: `pages/Financeiro.tsx`, `components/financeiro/KanbanFinanceiro.tsx`.

Produção já tinha o botão e a rota (`cobrarCharge(id, quando)`). O pacote trazia
um `Financeiro.tsx` sem nada disso. Portado com os três refinamentos do wireframe:

- **Cobrança agendada sai do lote.** "Cobrar todos" ignora quem tem
  `agendadaPara` — incluí-la mandaria a mensagem **duas vezes** ao mesmo paciente,
  e a clínica só descobriria pela reclamação dele. O botão mostra o número real
  ("Cobrar 3") e a barra explica o resto ("2 já agendadas").
- **"Cobrar agora" vence o agendamento.** O botão muda de rótulo quando há envio
  marcado, e o backend limpa `agendadaPara` — senão o card seguiria dizendo
  "envio 04/08" para algo já enviado.
- **Grade de 30min, 7h–20h.** `naGrade()` arredonda a hidratação: um
  `agendadaPara` com minuto quebrado (13:34) fazia o `<select>` mostrar 07:00
  enquanto o estado guardava 13:34 — a pessoa via um horário e gravava outro.

Sobre o `datetime-local` nativo, descartado: oferece precisão que não existe no
problema (clínica agenda "amanhã de manhã", não "03:47"), aceita madrugada, e é
azul #1A73E8 fixo fora da paleta. Nenhuma referência usa — Mailchimp, Loops e
Basecamp têm o próprio.

### Painel de QR do WhatsApp (Integrações)

Produção renderiza `<WhatsAppConnectPanel>` dentro de Integrações — é ele que
gera o QR, faz o polling e some ao conectar. O pacote substituía o arquivo **sem
renderizar o painel**, e ainda roteava para `/agentes` com um toast "leia o QR
lá". `/agentes` não tem painel de QR: **o fluxo de conectar WhatsApp morria no
meio**. Agora o painel volta a montar abaixo da lista (não em modal — ler QR exige
a tela parada e o celular na mão).

**A lição:** portar tela por tela do wireframe funciona para o que é novo, mas
apaga o que produção ganhou no intervalo. Antes de aplicar qualquer arquivo
marcado **substituir**, vale um diff contra o arquivo real.

---

## Verificar antes de subir

```bash
npx tsc -p tsconfig.app.json --noEmit && npm run build
```

`frontend/tsconfig.json` é arquivo de *project references* com `"files": []` —
`npx tsc --noEmit` compila zero arquivos e sempre passa.

---

## Ainda aberto no backend

Nada mudou desde a v3. Os fallbacks seguem cobrindo:

| Rota | Fallback atual |
|---|---|
| `GET /api/hoje` | `hooks/useHoje.ts` compõe de `/api/cobrancas` + `/api/empresa` + `/api/agente` |
| `GET /api/integracoes` | `listFerramentasFallback()` |
| `POST /api/cobrancas/:id/etapa` | só `cobrar` e `nota-emitida` têm rota própria |
| `GET /api/conversas/:id/raciocinio` | painel recolhido fica vazio |

Detalhe que a v4 acentua: com o painel de raciocínio agora **dentro** do chat, a
rota `/raciocinio` passou de "enfeite lateral" a conteúdo que o usuário abre de
propósito. Vale priorizar — é o que troca desconfiança por auditoria.
