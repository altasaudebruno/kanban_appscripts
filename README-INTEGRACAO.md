# Kanban no Apps Script — integração com o terminal

Repositório local do projeto Apps Script `Controle Ágil / Kanban`, sincronizado
por `clasp`. Serve dois propósitos:

1. operar o quadro pelo terminal (criar, mover, finalizar tarefas e anotar);
2. hospedar o planejamento do MVP **Consultoria Docfinance** (blocos B00–B07,
   com checkpoints da agenda e o teste que prova cada entrega).

- Script ID: `1hjcfvfnXBSPSI89wBEk0vJWgXyeAIfZPvi8obuw7VD7DmQzwlyFd-Lub`
- Pasta local: `C:\Users\admin\kanban-gas` (fora do OneDrive, de propósito)
- Conta autenticada: `bruno@altaservicosmedicos.com.br`

---

## 1. O que o quadro é hoje

Os dados vivem na **planilha** ligada ao script, não em PropertiesService.
Cada aba é uma tabela:

| Aba | Papel |
|---|---|
| `BASE DE TAREFAS` | a tabela de tarefas (uma linha por tarefa) |
| `PROJECTS` / `PROJECT_MEMBERS` | projetos e quem acessa cada um, com papel |
| `COMMENTS` | notas com autor e timestamp |
| `BLOCKERS` | bloqueios transversais (a tarefa não muda de coluna) |
| `UAT_RUNS` | ciclos de validação, com aprovação/reprovação |
| `ACTIVITY_EVENTS` | trilha de auditoria de toda mutação |
| `INBOX_ITEMS` / `ATTACHMENTS` | captura rápida a classificar depois |
| `KANBAN` / `RESUMO` / `CALC` | derivadas, só fórmulas — não editar |

**Colunas de uma tarefa** (`BASE DE TAREFAS`, A..V):

```
A ID   B Tarefa   C Descrição   D Subtarefas e critérios de aceite
E Prioridade (1–5)   F Dificuldade   G Pontuação (fórmula)
H Status   I Responsável   J Dependências   K Observações
L Criação   M Início   N Conclusão   O % concluído   P Versão
Q Excluído em   R Excluído por   S Prazo   T Project ID
U Bloco   V O que testar          ← NOVAS
```

**Colunas do quadro (status):** `BACKLOG → NÃO-INICIADO → DEV → DEVMERGE →
UAT → PRODUÇÃO`. Sair de UAT exige decisão explícita: aprovar manda para
PRODUÇÃO, reprovar volta para DEV com feedback obrigatório.

Garantias que o código já tinha e que continuam valendo: toda mutação passa
por `LockService`, exige a **versão** esperada (controle otimista), a exclusão
é lógica e reversível, e tudo gera evento em `ACTIVITY_EVENTS`.

### O que foi acrescentado

- **`Bloco` (U) e `O que testar` (V)** na tarefa. A migração é automática: a
  primeira leitura da base já cria as colunas na planilha legada, sem precisar
  rodar "Reconstruir". Um chamador antigo que não envie esses campos **não
  apaga** o que já está lá.
- **Agenda por checkpoints** (`Plano.js`): os 11 dias de 21/09 a 01/10, cada um
  com os blocos que precisam estar prontos e a meta daquele dia.
- **Visão do gestor** somente-leitura (`Gestor.html`): % por bloco, onde o
  Bruno está hoje, o que está em andamento, bloqueios e última movimentação.
- **Resumo do dia**: foco, atrasadas, em UAT e "o que testar hoje".
- **Seed do planejamento**: 70 tarefas B00–B07 com critérios de aceite e teste
  do dia, idempotente por título.
- **Relatório por e-mail ao gestor**, em um clique (seção 4.1).
- **Filtro por bloco** no quadro, que aparece só quando o projeto usa blocos.

---

## 2. Primeiro uso (2 minutos, pela planilha)

1. Abrir a planilha do Kanban.
2. Menu **Kanban → Carregar planejamento Docfinance**.
   Cria o projeto `DF` e as 70 tarefas. Rodar de novo nunca duplica — se a
   mensagem disser que faltaram tarefas por tempo de execução, é só repetir.
3. Menu **Kanban → Limpar dados antigos…**
   Remove o que sobrou da planilha copiada (projeto `AG` e qualquer outro que
   não seja o `DF`). **Mostra as contagens e pede confirmação antes de apagar**
   — nada sai sem você ver o número. Não tem desfazer.
4. Menu **Kanban → Dar acesso de leitura ao gestor…**
5. Menu **Kanban → Enviar relatório de TESTE para mim** — confere como o
   relatório chega antes de mandar ao Geovane.
6. Menu **Kanban → Abrir Quadro Kanban** e selecionar o projeto **DF**.

Diário: **Kanban → Meu dia — o que fazer e testar**.

> O passo 3 é definitivo e foi autorizado pelo Bruno: esta planilha é cópia de
> um controle anterior. O seed legado (`Data.js`) foi neutralizado e o item
> "Recarregar dados originais" saiu do menu, para que nenhum caminho de
> instalação regrave o que acabou de ser apagado.

---

## 3. Comandos pelo terminal (`clasp run`)

> Requer a configuração da seção 5. Sem ela, o comando responde
> *"Unable to run script function"* — é o estado atual do projeto.

Todos os comandos rodam a partir de `C:\Users\admin\kanban-gas` e assumem o
projeto `DF` por padrão.

```bash
# O que fazer e testar hoje
clasp run-function resumoDia

# Fila de um bloco
clasp run-function listarTarefas --params '["DF","B01"]'

# Criar tarefa
clasp run-function criarTarefa --params '[{
  "tarefa": "B01-T11 · Ajustar timeout do health check",
  "descricao": "O /api/health estoura em cold start.",
  "bloco": "B01",
  "dueDate": "2026-09-22",
  "prioridade": 4,
  "dificuldade": 2,
  "subtarefas": "• Responde em menos de 2s no cold start",
  "oQueTestar": "curl no /api/health logo apos um deploy novo"
}]'

# Mover de coluna (BACKLOG, NÃO-INICIADO, DEV, DEVMERGE, UAT)
clasp run-function moverTarefa --params '["DF-001","DEV"]'

# Anotar (autor e timestamp automáticos)
clasp run-function adicionarNota --params '["DF-001","Decidi usar Postgres 16; Prisma 5 ainda nao suporta X."]'

# Finalizar: leva ate PRODUÇÃO passando pelo UAT e registra a validação
clasp run-function finalizarTarefa --params '["DF-001","Rodei o docker compose em clone limpo, subiu com seed."]'

# Retrato do gestor em JSON
clasp run-function visaoGestor

# Recarregar/completar o planejamento
clasp run-function carregarPlanejamentoDocfinance

# Dar leitura ao gestor (papel VIEWER + leitor da planilha)
clasp run-function darAcessoAoGestor

# Enviar o relatório de acompanhamento por e-mail ao gestor
clasp run-function enviarRelatorioAoGestorPadrao

# Mesmo relatório, só para você conferir (assunto "[TESTE] ")
clasp run-function enviarRelatorioTeste

# Prévia do que a limpeza removeria — somente leitura, não apaga nada
clasp run-function analisarDadosLegados

# Remover os dados legados (o segundo parâmetro true é a confirmação)
clasp run-function limparDadosLegados --params '["DF",true]'
```

**Por que `finalizarTarefa` não é só "mover para PRODUÇÃO":** o domínio só
deixa entrar em PRODUÇÃO pela aprovação de um ciclo de UAT. O comando faz os
dois passos e usa o texto que você passar como registro da validação. Se a
tarefa não tiver critérios de aceite preenchidos, ele recusa — de propósito.

### Contrato estrito (para outro agente ou script)

`cliDispatch` continua disponível e **exige a versão** da tarefa, arbitrando
edições simultâneas:

```bash
clasp run-function cliDispatch --params '[{"action":"context","taskId":"DF-001","projectId":"DF"}]'
clasp run-function cliDispatch --params '[{"action":"status","taskId":"DF-001","version":3,"projectId":"DF","payload":{"status":"DEV"}}]'
clasp run-function cliDispatch --params '[{"action":"today","projectId":"DF"}]'
clasp run-function cliDispatch --params '[{"action":"manager","projectId":"DF"}]'
clasp run-function cliDispatch --params '[{"action":"list","projectId":"DF","payload":{"bloco":"B04"}}]'
```

### Sincronizar código

```bash
clasp push     # envia o que está na pasta
clasp pull     # traz o que foi editado no navegador
clasp status   # o que seria enviado
```

Editou pelo navegador? Rode `clasp pull` **antes** de `clasp push`, senão o
push sobrescreve a edição feita lá.

---

## 4. Como o gestor acompanha

Gestor configurado: **geovane.barbosa@altaservicosmedicos.com.br**.

A visão é **somente leitura por construção**: o papel `VIEWER` faz o servidor
recusar qualquer escrita, e a página não tem nenhum controle de edição.

### 4.1 Relatório por e-mail (o caminho mais simples)

No quadro, botão **"Relatório ao gestor"** (ou menu **Kanban → Enviar
relatório ao gestor por e-mail**). Pede confirmação e envia na hora.

O e-mail é escrito para quem **não** abre o Kanban: percentual do plano,
o que está previsto para hoje, como está cada etapa com barra de progresso,
em que ele está trabalhando agora, o que está travado e o calendário até o
piloto. Vai em HTML e também em texto puro.

Pelo terminal: `clasp run-function enviarRelatorioAoGestorPadrao`

**Antes de mandar ao gestor, teste em você:** menu **Kanban → Enviar relatório
de TESTE para mim**. Envia o mesmo relatório para a conta que clicou, com
assunto prefixado `[TESTE]` e uma tarja no topo dizendo que o gestor não
recebeu aquela cópia. O destinatário padrão não é alterado e a trilha registra
`report.test_sent`, não um envio ao gestor.

Pelo terminal: `clasp run-function enviarRelatorioTeste`

> O envio é **sempre manual**. Não foi criado nenhum gatilho automático de
> e-mail: relatório que sai sozinho é relatório que um dia sai errado sem
> ninguém perceber. Se quiser um envio diário, peça — são duas linhas, mas
> é uma decisão sua.

### 4.2 Acesso para ele ver o quadro

O Geovane já está cadastrado como `VIEWER` do projeto `DF` no código, então a
permissão nasce sozinha na primeira execução. Falta só a leitura da planilha:

**Menu Kanban → Dar acesso de leitura ao gestor…** (aceitar o e-mail sugerido).
Isso concede o papel `VIEWER` **e** adiciona ele como Leitor da planilha.

Pelo terminal: `clasp run-function darAcessoAoGestor`

**Link próprio para ele (opcional, mais confortável que abrir a planilha):**

1. No editor do Apps Script: **Implantar → Nova implantação → App da Web**
   - Executar como: **Usuário que acessa**
   - Quem tem acesso: **Qualquer pessoa do domínio**
2. Enviar a ele a URL terminada em `/exec?view=gestor&projeto=DF`.

> O acesso da implantação é `DOMAIN` (`appsscript.json`): **só abre para contas
> `@altaservicosmedicos.com.br`**. O Geovane está nesse domínio, então funciona.
> Um gestor de fora do domínio receberia 401 mesmo com o papel `VIEWER`.

### 4.3 Qual projeto essas telas mostram

Quando nenhum projeto é informado, a visão do gestor, o relatório e o "Meu dia"
assumem **`DF`**. Se `DF` ainda não existir, eles mostram o primeiro projeto
acessível **com um aviso em vermelho dizendo isso** — em vez de exibir os
números do projeto errado em silêncio. Para trocar o padrão, defina a
propriedade de script `PLAN_DEFAULT_PROJECT`.

> Não publique como **"Qualquer pessoa"**: o mesmo deployment serve o quadro de
> operação completo, então abrir o link ao público daria acesso de escrita ao
> Kanban a quem tivesse a URL. Por isso também não foi criado um endpoint
> `doPost` com token para `curl`: no estado atual do script ele exigiria essa
> exposição. O caminho seguro é `clasp run` (seção 5).

---

## 5. Passos manuais pendentes (só o Bruno pode fazer)

Necessários **apenas** para os comandos de terminal. Tudo o mais já funciona
pela planilha.

**5.1 — Ligar a Apps Script API na conta** (30 segundos)
https://script.google.com/home/usersettings → ligar *"API do Google Apps Script"*.

**5.2 — Vincular um projeto GCP padrão** (o script hoje usa o projeto oculto)
1. Abrir o editor: `clasp open-script`
2. **Configurações do projeto** (engrenagem) → *Projeto do Google Cloud Platform (GCP)*
3. **Alterar projeto** → informar o **número** de um projeto GCP existente
   (ex.: `pmo-projetos-internos`) ou criar um novo.
4. Nesse projeto GCP, habilitar a **Google Apps Script API**.

**5.3 — Credenciais OAuth próprias para o `clasp`**
1. No projeto GCP: **APIs e serviços → Tela de permissão OAuth** (tipo Interno).
2. **Credenciais → Criar credenciais → ID do cliente OAuth → App para computador**.
3. Baixar o JSON e rodar, na pasta do projeto:
   ```bash
   clasp login --creds caminho/do/client_secret.json --use-project-scopes
   ```
   (não versionar esse arquivo — o `.gitignore` já o ignora)

**5.4 — Conferir que funcionou**
```bash
clasp run-function resumoDia
```
Deve devolver JSON com o checkpoint do dia. Se responder *"Unable to run script
function"*, algum passo de 5.1–5.3 ficou faltando.

**5.5 — Escopos OAuth declarados (leia se `clasp run` der erro de permissão)**

O manifesto passou a declarar `oauthScopes` explicitamente. Antes ele omitia a
lista, e o Google inferia os escopos só para a autorização feita no navegador —
o token gerado pelo `clasp` saía **sem a permissão de planilha**, e qualquer
comando morria em `You do not have permission to call
SpreadsheetApp.getActive. Required: spreadsheets`.

| Escopo | Por que o código precisa |
|---|---|
| `.../auth/spreadsheets` | todo o armazenamento: `SpreadsheetApp.getActive`, leitura e escrita das abas |
| `.../auth/drive` | `addViewer` em "Dar acesso de leitura ao gestor" (compartilhar a planilha) |
| `.../auth/script.container.ui` | menu e caixas de diálogo (`SpreadsheetApp.getUi`) |
| `.../auth/script.scriptapp` | gatilhos da automação (`ScriptApp.newTrigger`, `getProjectTriggers`) |
| `.../auth/script.send_mail` | relatório por e-mail (`MailApp.sendEmail`) |
| `.../auth/userinfo.email` | identificar quem está agindo (`Session.getActiveUser`) — é a base de toda a autorização por papel |

> Só o `.../auth/drive` existe por uma funcionalidade de conveniência. Se
> preferir não conceder acesso amplo ao Drive, remova essa linha do
> `appsscript.json`: o resto continua funcionando e apenas o
> "Dar acesso de leitura ao gestor" deixa de compartilhar sozinho — ele avisa
> para compartilhar a planilha à mão (Compartilhar → Leitor).

**Depois desta mudança, dois passos são obrigatórios:**

1. **Gerar token novo para o `clasp`** — o token atual não tem os escopos:
   ```bash
   clasp login --creds caminho/do/client_secret.json --use-project-scopes
   ```
2. **Reautorizar no navegador** na primeira vez que abrir o quadro ou usar o
   menu. A lista de escopos mudou, então o Google vai pedir a permissão de
   novo. É esperado — aceite.

**5.6 — Autorização de envio de e-mail**
Na primeira vez que você usar o botão "Relatório ao gestor", o Google vai
pedir para autorizar o envio de e-mail em seu nome (escopo novo no script).
Aceitar é obrigatório para o relatório funcionar.

**5.7 — Decisões que dependem de você**
- Se quer a implantação com link próprio para o gestor (seção 4.2).
- Se quer envio recorrente do relatório (hoje é só manual, de propósito).

---

## 6. Defeitos conhecidos (sem correção)

A revisão de código apontou 9 achados. **7 foram corrigidos** — seis no commit
`2cf23bc` e um (`criarTarefa` ecoando a tarefa errada) no commit anterior
`48ec686`, feito antes da revisão chegar. Os **2 abaixo continuam abertos**, por
decisão consciente.

### C1 — A visão do gestor por link só abre para contas do domínio

- **Onde:** `appsscript.json`, `webapp.access: "DOMAIN"` com
  `executeAs: "USER_ACCESSING"`.
- **Sintoma:** um gestor fora de `@altaservicosmedicos.com.br` bate em tela de
  login ou 401 ao abrir `/exec?view=gestor`, **mesmo tendo papel `VIEWER`** em
  `PROJECT_MEMBERS`. O papel não é o que barra: é o acesso da implantação.
- **Por que não corrigi:** as duas saídas são piores que o defeito. Abrir para
  `ANYONE` exporia o **mesmo deployment que serve o quadro de operação**, dando
  escrita no Kanban a quem tiver a URL. Trocar `executeAs` para
  `USER_DEPLOYING` faria o Kanban inteiro rodar como o Bruno, anulando a
  autorização por membro que o sistema já tem.
- **Risco prático para o Bruno:** **nenhum hoje.** O Geovane está no domínio, e
  tanto o relatório por e-mail quanto o acesso pela planilha independem disso.
  Só aparece se um dia quiser mostrar o quadro a alguém de fora do domínio ou
  numa conta pessoal — aí o caminho é o relatório por e-mail, que funciona para
  qualquer destinatário.

### C2 — O seed pode não carregar as 70 tarefas numa execução só

- **Onde:** `Plano.js`, função `seedPlano` — cada tarefa entra por
  `insertTaskLocked_`, que faz várias gravações na planilha mais uma linha de
  auditoria.
- **Sintoma:** em planilha lenta, a execução para em ~4 minutos (guarda
  deliberada, antes do limite de 6 do Apps Script) e informa quantas tarefas
  faltaram. O planejamento fica incompleto até rodar de novo.
- **Por que não corrigi:** a correção real é inserir em lote e agrupar a
  auditoria, o que exige reescrever `insertTaskLocked_` — o caminho usado por
  **todas** as criações de tarefa do sistema, inclusive pelo quadro e pela
  Inbox. Alto risco de quebrar a criação normal por um ganho que a guarda já
  cobre.
- **Risco prático para o Bruno:** **baixo e visível, nunca silencioso.** A
  mensagem diz exatamente quantas faltaram, e rodar o item de menu de novo
  completa a carga sem duplicar nada (idempotente por título). No pior caso,
  dois cliques em vez de um, só no dia da carga inicial.

> Não são defeitos, mas limitam o uso e estão documentados em outras seções:
> os comandos `clasp run` exigem a configuração de GCP/OAuth da **seção 5**, e
> não existe endpoint `curl` por decisão de segurança explicada na **seção 4.2**.

## 7. Estrutura do repositório

| Arquivo | Conteúdo |
|---|---|
| `Config.js` | constantes: colunas, status, cores, listas |
| `Api.js` | domínio: CRUD, versão, bloqueios, UAT, projetos, auditoria |
| `Plano.js` | agenda, visão do gestor, resumo do dia, motor do seed |
| `Relatorio.js` | relatório de acompanhamento por e-mail (gestor e teste) |
| `Limpeza.js` | prévia e remoção dos dados legados, em blocos contíguos |
| `PlanoDocfinance.js` | as 70 tarefas B00–B07 do MVP |
| `CliPlano.js` | comandos de terminal de alto nível |
| `CliApi.js` | `cliDispatch`, contrato estrito com versão |
| `Kanban.html` | quadro de operação |
| `Gestor.html` | visão somente-leitura do gestor |
| `WebApp.js` | roteamento do app da web |
| `Menu.js` | menu da planilha |
| `Setup.js` | montagem das abas, fórmulas e auditoria da fundação |
| `Search.js`, `Inbox.js`, `Automation.js`, `Triggers.js` | busca, captura e automações |
| `Data.js` | seed legado do projeto `AG` — **neutralizado** (lista vazia) |

Histórico do git: o commit `baseline` é o clone original, intocado. Toda
alteração veio depois dele.
