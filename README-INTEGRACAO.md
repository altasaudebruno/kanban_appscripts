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

---

## 2. Primeiro uso (2 minutos, pela planilha)

1. Abrir a planilha do Kanban.
2. Menu **Kanban → Carregar planejamento Docfinance**.
   Cria o projeto `DF` e as 70 tarefas. Rodar de novo nunca duplica — se a
   mensagem disser que faltaram tarefas por tempo de execução, é só repetir.
3. Menu **Kanban → Abrir Quadro Kanban** e selecionar o projeto **DF**.

Diário: **Kanban → Meu dia — o que fazer e testar**.

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

# Dar leitura ao gestor
clasp run-function darAcessoAoGestor --params '["geovane@altaservicosmedicos.com.br"]'
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

A visão é **somente leitura por construção**: o papel `VIEWER` faz o servidor
recusar qualquer escrita, e a página não tem nenhum controle de edição.

**Opção A — pela planilha (imediata, nenhuma configuração):**
compartilhar a planilha com o Geovane como *Leitor*, e ele usa
**Kanban → Visão do gestor**.

**Opção B — por link próprio (recomendada):**

1. No editor do Apps Script: **Implantar → Nova implantação → App da Web**
   - Executar como: **Usuário que acessa**
   - Quem tem acesso: **Qualquer pessoa do domínio**
2. Enviar ao gestor a URL terminada em `/exec?view=gestor&projeto=DF`.
3. Rodar `darAcessoAoGestor` (ou o item de menu) com o e-mail dele.
4. Compartilhar a planilha com ele como *Leitor* — a implantação roda como o
   usuário que acessa, então ele precisa conseguir ler a planilha.

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

**5.5 — Decisões que dependem de você**
- E-mail do Geovane para `darAcessoAoGestor` (não foi assumido nenhum).
- Se quer a Opção B da seção 4 (implantação com link próprio).

---

## 6. Estrutura do repositório

| Arquivo | Conteúdo |
|---|---|
| `Config.js` | constantes: colunas, status, cores, listas |
| `Api.js` | domínio: CRUD, versão, bloqueios, UAT, projetos, auditoria |
| `Plano.js` | agenda, visão do gestor, resumo do dia, motor do seed |
| `PlanoDocfinance.js` | as 70 tarefas B00–B07 do MVP |
| `CliPlano.js` | comandos de terminal de alto nível |
| `CliApi.js` | `cliDispatch`, contrato estrito com versão |
| `Kanban.html` | quadro de operação |
| `Gestor.html` | visão somente-leitura do gestor |
| `WebApp.js` | roteamento do app da web |
| `Menu.js` | menu da planilha |
| `Setup.js` | montagem das abas, fórmulas e auditoria da fundação |
| `Search.js`, `Inbox.js`, `Automation.js`, `Triggers.js` | busca, captura e automações |
| `Data.js` | as 28 tarefas originais do projeto `AG` |

Histórico do git: o commit `baseline` é o clone original, intocado. Toda
alteração veio depois dele.
