/**
 * CliPlano.js — comandos de alto nível para uso direto do terminal.
 *
 *   clasp run-function criarTarefa     --params '[{...}]'
 *   clasp run-function moverTarefa     --params '["DF-001","DEV"]'
 *   clasp run-function finalizarTarefa --params '["DF-001","validado em dev"]'
 *   clasp run-function adicionarNota   --params '["DF-001","texto da nota"]'
 *   clasp run-function resumoDia       --params '["DF"]'
 *
 * Diferença deliberada em relação a cliDispatch: aqui a versão da tarefa é
 * lida no servidor em vez de exigida do chamador. O controle otimista existe
 * para arbitrar duas telas editando ao mesmo tempo; num comando de terminal
 * ele só produziria um vaivém de leitura antes de cada escrita. Quem precisa
 * da garantia forte continua usando cliDispatch, que exige `version`.
 */

var CLI_DEFAULT_PROJECT = 'DF';

function cliProjectId_(value) {
  var raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) {
    var stored = PropertiesService.getScriptProperties().getProperty('PLAN_DEFAULT_PROJECT');
    raw = stored || CLI_DEFAULT_PROJECT;
  }
  return normalizeProjectId_(raw);
}

function cliArgs_(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') {
    var text = value.trim();
    if (!text) return {};
    if (text.charAt(0) === '{') {
      try { return JSON.parse(text); } catch (error) {
        throw new Error('JSON inválido no parâmetro: ' + error.message);
      }
    }
    return { tarefa: text };
  }
  return value;
}

function cliMeta_(projectId, action) {
  var requestId = Utilities.getUuid();
  return {
    source: 'cli:terminal',
    requestId: requestId,
    correlationId: action + ':' + requestId,
    projectId: projectId
  };
}

function cliTaskNumber_(id) {
  return Number((String(id).match(/(\d+)$/) || [0, 0])[1]);
}

function cliTask_(projectId, taskId) {
  var context = getTaskContext(String(taskId || '').trim(), projectId);
  return context.task;
}

/** Resposta enxuta: o terminal não precisa do quadro inteiro de volta. */
function cliOk_(action, projectId, task, extra) {
  var out = {
    ok: true,
    action: action,
    projectId: projectId,
    task: task ? {
      id: task.id, titulo: task.tarefa, status: task.status, bloco: task.bloco,
      responsavel: task.responsavel, prazo: task.dueDate, pct: task.pct,
      version: task.version, oQueTestar: task.oQueTestar
    } : null
  };
  if (extra) Object.keys(extra).forEach(function (key) { out[key] = extra[key]; });
  return out;
}

// --------------------------------------------------------------- comandos ----

/**
 * criarTarefa({ tarefa, descricao, bloco, oQueTestar, dueDate, prioridade,
 *               dificuldade, status, responsavel, subtarefas, projectId })
 * Também aceita só o título como string.
 */
function criarTarefa(payload, projectId) {
  var args = cliArgs_(payload);
  var project = cliProjectId_(projectId || args.projectId);
  var meta = cliMeta_(project, 'criarTarefa');
  args.projectId = project;
  if (!args.status) args.status = 'NÃO-INICIADO';
  var board = createTask(args, meta);
  // A tarefa nova ocupa a primeira linha livre, que não é necessariamente a
  // última do array: entre as de mesmo título, a recém-criada é a de maior ID.
  var created = board.tasks.filter(function (task) {
    return planTitleKey_(task.tarefa) === planTitleKey_(args.tarefa);
  }).sort(function (a, b) {
    return cliTaskNumber_(a.id) - cliTaskNumber_(b.id);
  }).pop() || null;
  return cliOk_('criarTarefa', project, created);
}

/** moverTarefa('DF-001', 'DEV') — move de coluna respeitando o fluxo. */
function moverTarefa(taskId, status, projectId) {
  var project = cliProjectId_(projectId);
  var current = cliTask_(project, taskId);
  var target = String(status || '').trim().toUpperCase();
  if (target === 'NAO-INICIADO') target = 'NÃO-INICIADO';
  if (target === 'PRODUCAO') target = 'PRODUÇÃO';
  if (statusNames_().indexOf(target) === -1) {
    throw new Error('Status inválido: ' + status + '. Use um de: ' + statusNames_().join(', '));
  }
  if (target === 'PRODUÇÃO') {
    throw new Error('Para concluir, use finalizarTarefa — PRODUÇÃO só é atingida pela aprovação de UAT.');
  }
  var meta = cliMeta_(project, 'moverTarefa');
  updateTaskStatus(current.id, target, current.version, meta);
  return cliOk_('moverTarefa', project, cliTask_(project, current.id), { de: current.status, para: target });
}

/**
 * finalizarTarefa('DF-001', 'o que foi validado')
 * Leva a tarefa até PRODUÇÃO passando pelo ciclo de UAT, que é o único
 * caminho que o domínio aceita. O feedback vira o registro da validação.
 */
function finalizarTarefa(taskId, feedback, projectId) {
  var project = cliProjectId_(projectId);
  var task = cliTask_(project, taskId);
  var texto = String(feedback || '').trim() || 'Validado via terminal.';
  var passos = [];

  if (task.status === 'PRODUÇÃO') {
    return cliOk_('finalizarTarefa', project, task, { jaConcluida: true, passos: passos });
  }
  if (task.status !== 'UAT') {
    if (!String(task.subtarefas || '').trim()) {
      throw new Error('A tarefa ' + task.id + ' não tem critérios de aceite preenchidos. ' +
        'Preencha "Subtarefas e critérios de aceite" antes de finalizar.');
    }
    updateTaskStatus(task.id, 'UAT', task.version, cliMeta_(project, 'finalizarTarefa:uat'));
    passos.push(task.status + ' → UAT');
    task = cliTask_(project, task.id);
  }
  decideUat(task.id, task.version, 'APPROVED', texto, cliMeta_(project, 'finalizarTarefa:aprovar'));
  passos.push('UAT → PRODUÇÃO (aprovado)');

  var finalTask = cliTask_(project, task.id);
  // pct é informativo na planilha; concluir sem fechá-lo deixa o RESUMO mentindo.
  if (Number(finalTask.pct) !== 1) {
    finalTask.pct = 1;
    finalTask.dataConclusao = planToday_();
    saveTask(finalTask, cliMeta_(project, 'finalizarTarefa:pct'));
    finalTask = cliTask_(project, task.id);
  }
  return cliOk_('finalizarTarefa', project, finalTask, { passos: passos, validacao: texto });
}

/** adicionarNota('DF-001', 'texto') — nota com autor e timestamp em COMMENTS. */
function adicionarNota(taskId, texto, projectId) {
  var project = cliProjectId_(projectId);
  var task = cliTask_(project, taskId);
  var body = String(texto || '').trim();
  if (!body) throw new Error('A nota não pode ser vazia.');
  addTaskComment(task.id, task.version, body, cliMeta_(project, 'adicionarNota'));
  var context = getTaskContext(task.id, project);
  var ultima = context.comments.length ? context.comments[context.comments.length - 1] : null;
  return cliOk_('adicionarNota', project, context.task, {
    nota: ultima ? { autor: ultima.author, em: ultima.createdAt, texto: ultima.body } : null,
    totalNotas: context.comments.length
  });
}

/** resumoDia('DF') — o que fazer e o que testar hoje. */
function resumoDia(projectId, data) {
  return resumoDiaPlano_(cliProjectId_(projectId), data);
}

/** visaoGestor('DF') — mesmo retrato que o gestor vê na web, em JSON. */
function visaoGestor(projectId, data) {
  return getManagerView(cliProjectId_(projectId), data);
}

/** listarTarefas('DF', 'B01') — fila do bloco, ordenada por prazo. */
function listarTarefas(projectId, bloco, status) {
  var project = cliProjectId_(projectId);
  var board = boardData_('active', project);
  var filtroBloco = String(bloco || '').trim().toUpperCase();
  var filtroStatus = String(status || '').trim().toUpperCase();
  var tasks = board.tasks.filter(function (task) {
    if (filtroBloco && String(task.bloco || '').toUpperCase() !== filtroBloco) return false;
    if (filtroStatus && String(task.status || '').toUpperCase() !== filtroStatus) return false;
    return true;
  }).sort(function (a, b) {
    var pa = a.dueDate || '9999-99-99';
    var pb = b.dueDate || '9999-99-99';
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  }).map(planTaskCard_);
  return { ok: true, projectId: project, total: tasks.length, tasks: tasks };
}

/** carregarPlanejamentoDocfinance() — seed idempotente do projeto DF. */
function carregarPlanejamentoDocfinance() {
  return seedPlano('DF', null, { source: 'cli:terminal', projectId: 'DF' });
}

/**
 * darAcessoAoGestor('geovane@exemplo.com') — concede leitura ao gestor.
 * VIEWER não muta nada: authorizeProject_ recusa qualquer escrita desse papel.
 */
function darAcessoAoGestor(email, projectId) {
  var project = cliProjectId_(projectId);
  var alvo = String(email || GESTOR_EMAIL || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) throw new Error('E-mail inválido: ' + alvo);

  setProjectMember(project, alvo, PROJECT_ROLES.VIEWER, true, cliMeta_(project, 'darAcessoAoGestor'));

  // Sem leitura da planilha ele receberia "sem permissão" na visão do gestor:
  // a implantação roda como o usuário que acessa.
  var planilhaOk = true;
  var planilhaErro = '';
  try {
    SpreadsheetApp.getActive().addViewer(alvo);
  } catch (error) {
    planilhaOk = false;
    planilhaErro = String(error && error.message ? error.message : error);
  }

  return {
    ok: true, projectId: project, email: alvo, papel: 'VIEWER',
    leituraDaPlanilha: planilhaOk,
    aviso: planilhaOk ? '' :
      'Conceda a leitura da planilha manualmente (Compartilhar → Leitor): ' + planilhaErro
  };
}
