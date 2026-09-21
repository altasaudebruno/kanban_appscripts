# ROADMAP — Kanban no Apps Script

Estado do projeto e o que ficou em aberto. **Leia este arquivo primeiro**; o
`README-INTEGRACAO.md` tem o detalhe operacional (comandos, menus, defeitos).

- Script ID: `1hjcfvfnXBSPSI89wBEk0vJWgXyeAIfZPvi8obuw7VD7DmQzwlyFd-Lub`
- Pasta local: `C:\Users\admin\kanban-gas` (fora do OneDrive, de propósito)
- GitHub: `altasaudebruno/kanban_appscripts` (branch `main`)
- Projeto ativo: **DF** — Consultoria Docfinance (piloto em 01/10/2026)

---

## 1. Estado atual — 21/09/2026

Tudo abaixo está **no ar e validado pelo Bruno**.

### Integração com o terminal
`clasp` clonado, versionado em git (o commit `baseline` é o clone original
intocado) e sincronizado com o GitHub. O login precisa das **duas** flags:

```bash
clasp login --creds caminho/do/client_secret.json --use-project-scopes --include-clasp-scopes
```

Sem `--include-clasp-scopes` o token sai sem `script.projects` e o próprio
`clasp` responde `Insufficient Permission` até em `clone`. O manifesto declara
`oauthScopes` explicitamente (6 escopos, um por serviço usado) — sem isso o
token do `clasp` saía sem permissão de planilha.

### Planejamento do MVP carregado
Projeto **DF** com **80 tarefas** distribuídas em B00–B07
(7 / 10 / 10 / 9 / 12 / 10 / 10 / 12), cada uma com descrição, critérios de
aceite e **"o que testar"** — o teste prático que prova a entrega no dia.
A agenda tem **11 checkpoints**, de 21/09 até o piloto em 01/10.

Campos novos na tarefa: **Bloco** (coluna U) e **O que testar** (coluna V),
com migração automática da planilha legada — não foi preciso reconstruir nada
para eles existirem.

### Limpeza dos dados legados — executada
A planilha era cópia de um controle anterior. Foram removidos **143 registros**
do projeto `AG` e de resíduos sem projeto: tarefas, notas, bloqueios, ciclos de
UAT, itens de inbox, anexos, membros, o projeto em si e a auditoria legada.
Ficou registrado **um** evento `data.legacy_purged` com as contagens.

O retorno dos dados antigos está bloqueado em quatro pontos: `Data.js` com
lista vazia, guarda em `seedTarefas` **antes** de limpar a base, item
"Recarregar dados originais" fora do menu, e entradas do `AG` fora de
`CONFIGURED_PROJECT_MEMBERS` (que é reaplicado a cada setup).
`DEFAULT_PROJECT_ID` passou de `AG` para **`DF`**.

### Acesso do gestor — aplicado
**Geovane** (`geovane.barbosa@altaservicosmedicos.com.br`) com papel `VIEWER`
no projeto DF **e** leitura da planilha. `VIEWER` é recusado em qualquer
escrita por `authorizeProject_` — ele vê, não mexe.

### Relatório por e-mail — aprovado
Botão "Relatório ao gestor" na barra do quadro e item no menu, ambos com
confirmação. Existe também **"Enviar relatório de TESTE para mim"**, que manda
a mesma peça para quem clicou, com assunto `[TESTE]` e tarja avisando que o
gestor não recebeu aquela cópia. O envio é **sempre manual**, por decisão de
projeto.

### Visão do gestor em linguagem de gestor
A página e o e-mail falam português corrente: `DEVMERGE` vira
"Pronto, aguardando validação", `UAT` vira "Em validação final", `BACKLOG`
vira "Na fila". O nome técnico fica só no `title` do chip. O rótulo amigável
é o campo `gestor` em `Config.js` — mesma fonte única das cores.

Abre com uma frase que responde onde o projeto está ("B01 quase pronto (88%) ·
3 itens aguardando validação · piloto em 10 dias"), etapas ativas em cartão com
o percentual grande e barra na cor da etapa, etapas que não começaram agrupadas
numa lista discreta, título da tarefa em destaque com o código (B01-T5) como
apoio, e datas relativas ("última atividade: hoje às 19h04").

### Retrabalho visual dos status — no ar
Cada status tem identidade de cor viva na coluna (fundo com tint, faixa de 5px,
ponto e contador) e no card (borda esquerda de 6px + chip de status).
`Config.js` é a **fonte única**: `Gestor.html` e `Relatorio.js` herdam a mesma
paleta. Funciona nos dois temas — `accent` para o claro, `accentDark/tintDark/
onDark` para o escuro.

Validado por `ferramentas/validar-paleta.js` contra o `Config.js` do
repositório: 60 verificações de contraste (texto 4,5:1 e bordas 3:1) nos dois
temas, mais a planilha. **Rode-o sempre que mexer em cor.** O selo de
prioridade **"crítica" não foi tocado**, e status usa fundo suave com borda
enquanto prioridade usa pill sólido — a forma diferencia as duas informações
além da cor.

---

## 2. Pendências e decisões em aberto

Nada aqui bloqueia o uso diário. São escolhas do Bruno.

### 2.1 Reconstruir a planilha para herdar a paleta nova
A formatação condicional da coluna Status e os cabeçalhos da aba KANBAN ainda
usam as cores antigas: elas só são regravadas quando a estrutura é reconstruída.
Até lá, quadro e planilha ficam com cores diferentes.

**Como fazer:** menu **Kanban → Reconstruir formatação/fórmulas**. É idempotente
e não toca em dado de negócio.

### 2.2 Amarelo e laranja próximos no tema CLARO
NÃO-INICIADO (`#A16207`, mostarda) e UAT (`#EA580C`, laranja) ficam a uma
distância RGB de **88**, logo abaixo da referência de 90 que adotei. É no tema
**claro**; no escuro a distância é 91 e não dispara aviso.

Ficou assim porque as duas colunas são separadas por três outras no quadro e o
chip traz o nome escrito — a cor é reforço, não a única pista. Rodar
`node ferramentas/validar-paleta.js` mostra esse aviso; ele não reprova.

**Como fazer, se incomodar — alternativa já testada:** em `Config.js`, no status
`NÃO-INICIADO`, trocar `accent: '#A16207'` por `accent: '#8A5A06'`. Some o
aviso e os 60 contrastes continuam passando — conferi antes de escrever isto.
Depois `clasp push`.

Evite resolver puxando o laranja do UAT para o vermelho: ali moram a cor de
erro, a de atraso e a da prioridade crítica.

### 2.3 Escopo `drive` no manifesto
É o único dos 6 escopos que existe por conveniência: serve ao `addViewer` do
"Dar acesso de leitura ao gestor", que compartilha a planilha sozinho.

**Como fazer, se preferir não conceder Drive amplo:** remover a linha
`"https://www.googleapis.com/auth/drive"` de `appsscript.json`, `clasp push` e
reautorizar. O resto continua funcionando; só o compartilhamento passa a ser
manual (Compartilhar → Leitor), e a função avisa isso em vez de falhar.

### 2.4 Link próprio do Web App para o gestor
Hoje o Geovane acompanha pelo relatório por e-mail e pela planilha. Um link
direto é mais confortável.

**Como fazer:** no editor do Apps Script, **Implantar → Nova implantação → App
da Web**, com **Executar como: Usuário que acessa** e **Quem tem acesso:
Qualquer pessoa do domínio**. Enviar a ele a URL terminada em
`/exec?view=gestor&projeto=DF`.

**Atenção:** como a implantação roda como o usuário que acessa, o Geovane vai
precisar autorizar o script na conta dele. Se a tela de consentimento OAuth do
projeto GCP estiver como **Externo em modo Teste**, ele só consegue autorizar
se estiver na lista de **usuários de teste** — adicione o e-mail dele lá antes
de mandar o link. Se a tela for **Interna**, não precisa.

### 2.5 Envio recorrente do relatório
Hoje o envio é manual de propósito: relatório que sai sozinho é relatório que um
dia sai errado sem ninguém perceber.

**Como fazer, se quiser diário:** criar um gatilho de tempo chamando
`enviarRelatorioAoGestorPadrao`. Antes disso, decidir o horário e o que fazer
quando não houver movimentação no dia (mandar assim mesmo ou pular).

---

## 3. Defeitos conhecidos

Dois, ambos por decisão consciente, detalhados na **seção 6 do
`README-INTEGRACAO.md`**:

- **C1** — o link da visão do gestor só abre para contas do domínio
  (`webapp.access: "DOMAIN"`). Sem impacto hoje: o Geovane está no domínio.
- **C2** — o seed pode parar em ~4 min e deixar tarefas para uma segunda
  execução. Falha visível e idempotente: rodar de novo completa sem duplicar.

Dos 9 achados da revisão de código deste ciclo, **7 foram corrigidos**.

---

## 4. Mapa do código

Tabela completa na **seção 7 do `README-INTEGRACAO.md`**. Os arquivos que
nasceram neste ciclo:

| Arquivo | Papel |
|---|---|
| `Plano.js` | agenda, visão do gestor, resumo do dia, motor do seed |
| `PlanoDocfinance.js` | as 80 tarefas B00–B07 |
| `CliPlano.js` | comandos de terminal de alto nível |
| `Relatorio.js` | relatório por e-mail (gestor e teste) |
| `Limpeza.js` | prévia e remoção dos dados legados, em blocos contíguos |
| `Gestor.html` | visão somente-leitura do gestor |
| `ferramentas/validar-paleta.js` | confere o contraste das cores de status (Node, fora do `clasp push`) |

`Config.js` é a fonte única de status, cores e colunas — mexer nele reflete na
planilha, no quadro, na visão do gestor e no relatório.

---

## 5. Como retomar

**Ordem de leitura:** este `ROADMAP.md` → `README-INTEGRACAO.md` (seção 2 para
o fluxo de menus, seção 3 para os comandos, seção 5 para configuração).

**No dia a dia, pela planilha:** menu **Kanban → Meu dia — o que fazer e
testar**.

**Os três comandos mais usados:**

```bash
# 1. O que fazer e testar hoje
clasp run-function resumoDia

# 2. Mover de coluna (BACKLOG, NÃO-INICIADO, DEV, DEVMERGE, UAT)
clasp run-function moverTarefa --params '["DF-001","DEV"]'

# 3. Concluir: passa pelo UAT e registra a validação
clasp run-function finalizarTarefa --params '["DF-001","o que foi validado"]'
```

`finalizarTarefa` não é "mover para PRODUÇÃO": o domínio só aceita essa coluna
pela aprovação de um ciclo de UAT, e o texto que você passa vira o registro da
validação. Se a tarefa não tiver critérios de aceite, ele recusa — de propósito.

**Regra que evita perder trabalho:** se você editou o código **pelo navegador**
(editor do Apps Script), rode `clasp pull` **antes** de qualquer `clasp push`.
O push sobrescreve o que está no servidor, sem avisar que havia algo mais novo lá.

**Antes de mandar relatório ao gestor:** teste em você primeiro
(**Kanban → Enviar relatório de TESTE para mim**).
