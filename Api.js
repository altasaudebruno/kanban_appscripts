/**
 * Api.js — camada de domínio consumida pelo Kanban.html.
 *
 * Garantias desta versão:
 *  - toda mutação é serializada por LockService;
 *  - toda edição exige optimistic concurrency por versão;
 *  - exclusão é lógica e reversível;
 *  - toda mutação gera um evento em ACTIVITY_EVENTS;
 *  - a coluna G continua sendo exclusivamente calculada por fórmula.
 */

function getBoardData(projectId) {
  return boardData_('active', projectId);
}

function getTrashData(projectId) {
  return boardData_('deleted', projectId);
}

function boardData_(mode, requestedProjectId) {
  var project = resolveAccessibleProject_(requestedProjectId);
  var sh = mustBase_();
  var last = sh.getLastRow();
  var tasks = [];
  var blockerByTask = activeBlockersByTask_();
  var uatByTask = latestUatByTask_();
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, TASK_COLUMN_COUNT).getValues();
    for (var i = 0; i < values.length; i++) {
      if (values[i][TASK_COLUMNS.ID - 1] === '' || values[i][TASK_COLUMNS.ID - 1] === null) continue;
      var task = taskFromValues_(values[i], i + 2);
      if (task.projectId !== project.id) continue;
      var deleted = !!task.deletedAt;
      if (mode === 'active' && deleted) continue;
      if (mode === 'deleted' && !deleted) continue;
      task.blocker = blockerByTask[task.id] || null;
      task.uat = uatByTask[task.id] || null;
      tasks.push(task);
    }
  }
  var warnings = boardWarnings_(tasks, mode);
  if (mode === 'active') warnings = warnings.concat(projectFlowWarnings_(tasks, project));
  return {
    tasks: tasks,
    statuses: STATUSES,
    responsaveis: RESPONSAVEIS,
    priorityColors: PRIORITY_COLORS,
    warnings: warnings,
    projectId: project.id,
    project: project,
    projects: listAccessibleProjects_(),
    capabilities: {
      optimisticConcurrency: true, softDelete: true, drafts: true,
      blockers: true, uatWorkflow: true, universalInbox: true,
      deterministicSearch: true, flowAutomation: true
    }
  };
}

function updateTaskStatus(id, newStatus, expectedVersion, metadata) {
  if (statusNames_().indexOf(newStatus) === -1) throw new Error('Status inválido: ' + newStatus);
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var sh = mustBase_();
    var row = findRowById_(sh, id);
    var before = readTaskAtRow_(sh, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);
    if (before.status === newStatus) return getBoardData(before.projectId);
    validateWorkflowTransition_(before, newStatus, before.subtarefas);
    if (before.status !== 'UAT' && newStatus === 'UAT' && findPendingUatRow_(id)) {
      throw new Error('Já existe um ciclo de UAT pendente para ' + id + '.');
    }

    sh.getRange(row, TASK_COLUMNS.STATUS).setValue(newStatus);
    sh.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var submittedUat = null;
    if (before.status !== 'UAT' && newStatus === 'UAT') submittedUat = createUatRun_(before.id, before.subtarefas, before.projectId);
    var after = readTaskAtRow_(sh, row);
    if (submittedUat) after.uat = submittedUat;
    recordActivity_(submittedUat ? 'uat.submitted' : 'task.status_changed', id, before, after, metadata);
    return getBoardData(before.projectId);
  });
}

function saveTask(t, metadata) {
  var s = sanitizeTask_(t);
  if (!s.id) throw new Error('ID da tarefa é obrigatório para edição.');
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var sh = mustBase_();
    var row = findRowById_(sh, s.id);
    var before = readTaskAtRow_(sh, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(s.id, s.version, before.version);
    validateWorkflowTransition_(before, s.status, s.subtarefas);
    if (before.status !== 'UAT' && s.status === 'UAT' && findPendingUatRow_(s.id)) {
      throw new Error('Já existe um ciclo de UAT pendente para ' + s.id + '.');
    }

    writeTaskRow_(sh, row, s);
    sh.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var submittedUat = null;
    if (before.status !== 'UAT' && s.status === 'UAT') submittedUat = createUatRun_(s.id, s.subtarefas, before.projectId);
    var after = readTaskAtRow_(sh, row);
    if (submittedUat) after.uat = submittedUat;
    recordActivity_(submittedUat ? 'uat.submitted' : 'task.updated', s.id, before, after, metadata);
    return getBoardData(before.projectId);
  });
}

function createTask(t, metadata) {
  var s = sanitizeTask_(t);
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var project = resolveProject_(s.projectId);
    authorizeProject_(project.id, true);
    if (project.id !== metadataProjectId_(metadata)) {
      throw new Error('PROJECT_MISMATCH|A nova tarefa deve usar o projeto do contexto da requisição.');
    }
    insertTaskLocked_(s, project, metadata, 'task.created', null);
    return getBoardData(project.id);
  });
}

/** Insere uma tarefa quando o chamador já possui ScriptLock. */
function insertTaskLocked_(sanitizedTask, project, metadata, eventType, eventBefore) {
  var sh = mustBase_();
  var slot = findInsertSlot_(sh, project.id, project.keyPrefix);
  ensureTaskRow_(sh, slot.row);
  validateWorkflowTransition_(null, sanitizedTask.status, sanitizedTask.subtarefas);

  sanitizedTask.id = formatTaskId_(slot.maxNumber + 1, project.keyPrefix);
  sh.getRange(slot.row, TASK_COLUMNS.ID).setValue(sanitizedTask.id);
  sh.getRange(slot.row, TASK_COLUMNS.DELETED_AT, 1, 2).clearContent();
  writeTaskRow_(sh, slot.row, sanitizedTask);
  sh.getRange(slot.row, TASK_COLUMNS.VERSION).setValue(1);
  sh.getRange(slot.row, TASK_COLUMNS.PROJECT_ID).setValue(project.id);
  var submittedUat = null;
  if (sanitizedTask.status === 'UAT') {
    submittedUat = createUatRun_(sanitizedTask.id, sanitizedTask.subtarefas, project.id);
  }

  var created = readTaskAtRow_(sh, slot.row);
  if (submittedUat) created.uat = submittedUat;
  if (eventType) recordActivity_(eventType, created.id, eventBefore, created, metadata);
  return { task: created, row: slot.row };
}

/** Move a tarefa para a lixeira sem apagar seus dados. */
function deleteTask(id, expectedVersion, metadata) {
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var sh = mustBase_();
    var row = findRowById_(sh, id);
    var before = readTaskAtRow_(sh, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);

    sh.getRange(row, TASK_COLUMNS.DELETED_AT).setValue(new Date());
    sh.getRange(row, TASK_COLUMNS.DELETED_BY).setValue(currentActor_());
    sh.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var after = readTaskAtRow_(sh, row);
    recordActivity_('task.deleted', id, before, after, metadata);
    return getBoardData(before.projectId);
  });
}

function restoreTask(id, expectedVersion, metadata) {
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var sh = mustBase_();
    var row = findRowById_(sh, id);
    var before = readTaskAtRow_(sh, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    if (!before.deletedAt) throw new Error('A tarefa ' + id + ' não está na lixeira.');
    assertExpectedVersion_(id, expectedVersion, before.version);

    sh.getRange(row, TASK_COLUMNS.DELETED_AT, 1, 2).clearContent();
    sh.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var after = readTaskAtRow_(sh, row);
    recordActivity_('task.restored', id, before, after, metadata);
    return getBoardData(before.projectId);
  });
}

function addTaskComment(id, expectedVersion, body, metadata) {
  body = workflowText_(body, 'Comentário', true, 10000);
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var taskSheet = mustBase_();
    var row = findRowById_(taskSheet, id);
    var before = readTaskAtRow_(taskSheet, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);

    var comments = ensureCommentsSheet_();
    var meta = normalizeMetadata_(metadata);
    var values = [
      Utilities.getUuid(), id, before.projectId, body, currentActor_(), new Date(),
      meta.source, 1
    ];
    comments.appendRow(values);
    taskSheet.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var comment = commentFromValues_(values);
    var after = readTaskAtRow_(taskSheet, row); after.comment = comment;
    recordActivity_('task.commented', id, before, after, metadata);
    return getBoardData(before.projectId);
  });
}

function getTaskContext(id, requestedProjectId) {
  var project = resolveProject_(requestedProjectId);
  authorizeProject_(project.id, false);
  var taskSheet = mustBase_();
  var row = findRowById_(taskSheet, id);
  var task = readTaskAtRow_(taskSheet, row);
  if (task.projectId !== project.id) throw new Error('Tarefa não encontrada no projeto ' + project.id + ': ' + id);

  var blockerHistory = blockerHistoryForTask_(id, project.id);
  var uatHistory = uatHistoryForTask_(id, project.id);
  var comments = commentsForTask_(id, project.id);
  task.blocker = blockerHistory.filter(function (item) { return !item.resolvedAt; }).pop() || null;
  task.uat = uatHistory.length ? uatHistory[uatHistory.length - 1] : null;
  return {
    project: project,
    task: task,
    comments: comments,
    blockerHistory: blockerHistory,
    uatHistory: uatHistory,
    activity: activityForTask_(id, project.id, 100)
  };
}

/** Registra um bloqueio transversal sem alterar a coluna do fluxo. */
function blockTask(id, expectedVersion, payload, metadata) {
  var reason = workflowText_(payload && payload.reason, 'Motivo do bloqueio', true, 2000);
  var unblockOwner = workflowText_(payload && payload.unblockOwner, 'Responsável pelo desbloqueio', false, 200);
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var taskSheet = mustBase_();
    var row = findRowById_(taskSheet, id);
    var before = readTaskAtRow_(taskSheet, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);
    if (findActiveBlockerRow_(id)) throw new Error('A tarefa ' + id + ' já possui um bloqueio ativo.');

    var blocker = createBlocker_(id, before.projectId, reason, unblockOwner);
    taskSheet.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var after = readTaskAtRow_(taskSheet, row);
    after.blocker = blocker;
    recordActivity_('task.blocked', id, before, after, metadata);
    return getBoardData(before.projectId);
  });
}

function unblockTask(id, expectedVersion, payload, metadata) {
  var resolution = workflowText_(payload && payload.resolution, 'Resolução do bloqueio', true, 2000);
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var taskSheet = mustBase_();
    var row = findRowById_(taskSheet, id);
    var before = readTaskAtRow_(taskSheet, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);
    var active = findActiveBlockerRow_(id);
    if (!active) throw new Error('A tarefa ' + id + ' não possui bloqueio ativo.');

    var blockerSheet = ensureBlockerSheet_();
    var actor = currentActor_();
    blockerSheet.getRange(active.row, 8, 1, 4).setValues([[
      new Date(), actor, resolution, active.blocker.version + 1
    ]]);
    taskSheet.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);
    var after = readTaskAtRow_(taskSheet, row);
    var resolved = blockerFromValues_(blockerSheet.getRange(active.row, 1, 1, BLOCKER_HEADERS.length).getValues()[0]);
    var beforeEvent = cloneForEvent_(before); beforeEvent.blocker = active.blocker;
    after.blocker = null; after.resolvedBlocker = resolved;
    recordActivity_('task.unblocked', id, beforeEvent, after, metadata);
    return getBoardData(before.projectId);
  });
}

/** Aprovar move automaticamente para PRODUÇÃO; reprovar retorna para DEV. */
function decideUat(id, expectedVersion, decision, feedback, metadata) {
  var outcome = String(decision || '').toUpperCase();
  if (outcome !== UAT_OUTCOMES.APPROVED && outcome !== UAT_OUTCOMES.REJECTED) {
    throw new Error('Decisão de UAT inválida.');
  }
  feedback = workflowText_(feedback, 'Feedback de UAT', outcome === UAT_OUTCOMES.REJECTED, 4000);
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(metadataProjectId_(metadata));
    var taskSheet = mustBase_();
    var row = findRowById_(taskSheet, id);
    var before = readTaskAtRow_(taskSheet, row);
    authorizeProject_(before.projectId, true);
    assertTaskProject_(before, metadata);
    assertActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);
    if (before.status !== 'UAT') throw new Error('A tarefa ' + id + ' não está em UAT.');
    var pending = findPendingUatRow_(id);
    if (!pending) throw new Error('Nenhum ciclo de UAT pendente foi encontrado para ' + id + '.');

    var actor = currentActor_();
    var uatSheet = ensureUatSheet_();
    uatSheet.getRange(pending.row, 4).setValue(outcome);
    uatSheet.getRange(pending.row, 8, 1, 5).setValues([[
      actor, actor, new Date(), feedback, pending.uat.version + 1
    ]]);
    var nextStatus = outcome === UAT_OUTCOMES.APPROVED ? 'PRODUÇÃO' : 'DEV';
    taskSheet.getRange(row, TASK_COLUMNS.STATUS).setValue(nextStatus);
    taskSheet.getRange(row, TASK_COLUMNS.VERSION).setValue(before.version + 1);

    var decided = uatFromValues_(uatSheet.getRange(pending.row, 1, 1, UAT_HEADERS.length).getValues()[0]);
    var after = readTaskAtRow_(taskSheet, row); after.uat = decided;
    var beforeEvent = cloneForEvent_(before); beforeEvent.uat = pending.uat;
    recordActivity_(outcome === UAT_OUTCOMES.APPROVED ? 'uat.approved' : 'uat.rejected',
      id, beforeEvent, after, metadata);
    return getBoardData(before.projectId);
  });
}

// --------------------------------------------------------------- helpers ----

function mustBase_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEETS.BASE);
  if (!sh) throw new Error('Aba "' + SHEETS.BASE + '" não encontrada. Use o menu Kanban → Instalar.');
  return sh;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

function findRowById_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) throw new Error('Tarefa não encontrada: ' + id);
  var values = sh.getRange(2, TASK_COLUMNS.ID, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 2;
  }
  throw new Error('Tarefa não encontrada: ' + id);
}

function findInsertSlot_(sh, projectId, keyPrefix) {
  var last = Math.max(sh.getLastRow(), 1);
  var maxNum = 0;
  var freeRow = -1;
  if (last >= 2) {
    var values = sh.getRange(2, TASK_COLUMNS.ID, last - 1, TASK_COLUMNS.PROJECT_ID).getValues();
    for (var i = 0; i < values.length; i++) {
      var value = values[i][0];
      if (value === '' || value === null) {
        if (freeRow === -1) freeRow = i + 2;
      } else {
        var rowProjectId = String(values[i][TASK_COLUMNS.PROJECT_ID - TASK_COLUMNS.ID] || DEFAULT_PROJECT_ID);
        var match = String(value).match(new RegExp('^' + escapeRegex_(keyPrefix) + '-(\\d+)$', 'i'));
        if (rowProjectId === projectId && match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      }
    }
  }
  return { row: freeRow === -1 ? Math.max(last + 1, 2) : freeRow, maxNumber: maxNum };
}

function ensureTaskRow_(sh, row) {
  if (sh.getMaxRows() < row) sh.insertRowsAfter(sh.getMaxRows(), row - sh.getMaxRows());
  if (sh.getMaxColumns() < TASK_COLUMN_COUNT) {
    sh.insertColumnsAfter(sh.getMaxColumns(), TASK_COLUMN_COUNT - sh.getMaxColumns());
  }
  setF_(sh.getRange(row, TASK_COLUMNS.SCORE),
    '=IF(OR($E' + row + '="",$F' + row + '=""),"",$E' + row + '*$F' + row + ')');

  var listas = SpreadsheetApp.getActive().getSheetByName(SHEETS.LISTAS);
  if (listas) {
    sh.getRange(row, TASK_COLUMNS.STATUS).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(listas.getRange(2, 1, STATUSES.length, 1), true)
        .setAllowInvalid(false).build());
    sh.getRange(row, TASK_COLUMNS.ASSIGNEE).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(listas.getRange(2, 3, RESPONSAVEIS.length, 1), true)
        .setAllowInvalid(false).build());
  }
  sh.getRange(row, TASK_COLUMNS.PERCENT).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberBetween(0, 1).setAllowInvalid(false).build());
  sh.getRange(row, TASK_COLUMNS.CREATED_DATE, 1, 3).setNumberFormat('dd/mm/yyyy');
  sh.getRange(row, TASK_COLUMNS.DUE_DATE).setNumberFormat('dd/mm/yyyy');
  sh.getRange(row, TASK_COLUMNS.PROJECT_ID).setNumberFormat('@');
  sh.getRange(row, TASK_COLUMNS.PERCENT).setNumberFormat('0%');
}

/** Escreve apenas B:F e H:O. Nunca toca na fórmula G nem nos metadados P:R. */
function writeTaskRow_(sh, row, s) {
  sh.getRange(row, TASK_COLUMNS.TITLE, 1, 5).setValues([[
    s.tarefa, s.descricao, s.subtarefas, s.prioridade, s.dificuldade
  ]]);
  sh.getRange(row, TASK_COLUMNS.STATUS, 1, 8).setValues([[
    s.status, s.responsavel, s.dependencias, s.observacoes,
    fromIso_(s.dataCriacao), fromIso_(s.dataInicio), fromIso_(s.dataConclusao),
    s.pct === '' ? '' : s.pct
  ]]);
  sh.getRange(row, TASK_COLUMNS.DUE_DATE).setValue(fromIso_(s.dueDate));
}

function readTaskAtRow_(sh, row) {
  return taskFromValues_(sh.getRange(row, 1, 1, TASK_COLUMN_COUNT).getValues()[0], row);
}

function taskFromValues_(v, row) {
  return {
    row: row,
    id: String(v[TASK_COLUMNS.ID - 1]),
    tarefa: String(v[TASK_COLUMNS.TITLE - 1] || ''),
    descricao: String(v[TASK_COLUMNS.DESCRIPTION - 1] || ''),
    subtarefas: String(v[TASK_COLUMNS.ACCEPTANCE - 1] || ''),
    prioridade: blankOrNumber_(v[TASK_COLUMNS.PRIORITY - 1]),
    dificuldade: blankOrNumber_(v[TASK_COLUMNS.DIFFICULTY - 1]),
    pontuacao: blankOrNumber_(v[TASK_COLUMNS.SCORE - 1]),
    status: String(v[TASK_COLUMNS.STATUS - 1] || ''),
    responsavel: String(v[TASK_COLUMNS.ASSIGNEE - 1] || ''),
    dependencias: String(v[TASK_COLUMNS.DEPENDENCIES - 1] || ''),
    observacoes: String(v[TASK_COLUMNS.NOTES - 1] || ''),
    dataCriacao: toIso_(v[TASK_COLUMNS.CREATED_DATE - 1]),
    dataInicio: toIso_(v[TASK_COLUMNS.START_DATE - 1]),
    dataConclusao: toIso_(v[TASK_COLUMNS.COMPLETED_DATE - 1]),
    pct: v[TASK_COLUMNS.PERCENT - 1] === '' || v[TASK_COLUMNS.PERCENT - 1] === null
      ? 0 : Number(v[TASK_COLUMNS.PERCENT - 1]),
    version: normalizeVersion_(v[TASK_COLUMNS.VERSION - 1]),
    deletedAt: toIsoDateTime_(v[TASK_COLUMNS.DELETED_AT - 1]),
    deletedBy: String(v[TASK_COLUMNS.DELETED_BY - 1] || ''),
    dueDate: toIso_(v[TASK_COLUMNS.DUE_DATE - 1]),
    projectId: String(v[TASK_COLUMNS.PROJECT_ID - 1] || DEFAULT_PROJECT_ID)
  };
}

function sanitizeTask_(t) {
  t = t || {};
  var title = String(t.tarefa || '').trim();
  if (!title) throw new Error('Informe o título da tarefa.');
  if (title.length > 300) throw new Error('O título deve ter no máximo 300 caracteres.');

  var status = String(t.status || '').trim() || 'BACKLOG';
  if (statusNames_().indexOf(status) === -1) throw new Error('Status inválido: ' + status);
  var resp = String(t.responsavel || '').trim();
  if (resp && RESPONSAVEIS.indexOf(resp) === -1) throw new Error('Responsável inválido: ' + resp);

  var prioridade = numOrBlank_(t.prioridade, 'Prioridade');
  if (prioridade !== '' && (prioridade < 1 || prioridade > 5 || Math.floor(prioridade) !== prioridade)) {
    throw new Error('Prioridade deve ser um inteiro entre 1 e 5.');
  }
  var dificuldade = numOrBlank_(t.dificuldade, 'Dificuldade');
  if (dificuldade !== '' && dificuldade <= 0) throw new Error('Dificuldade deve ser maior que zero.');

  var pct = t.pct === '' || t.pct === null || t.pct === undefined ? '' : Number(t.pct);
  if (pct !== '' && (!isFinite(pct) || pct < 0 || pct > 1)) {
    throw new Error('Percentual concluído deve estar entre 0 e 100%.');
  }
  return {
    id: String(t.id || '').trim(),
    projectId: normalizeProjectId_(t.projectId || DEFAULT_PROJECT_ID),
    version: t.version,
    tarefa: title,
    descricao: String(t.descricao || ''),
    subtarefas: String(t.subtarefas || ''),
    prioridade: prioridade,
    dificuldade: dificuldade,
    status: status,
    responsavel: resp,
    dependencias: String(t.dependencias || ''),
    observacoes: String(t.observacoes || ''),
    dataCriacao: isoDateOrBlank_(t.dataCriacao, 'Data de criação'),
    dataInicio: isoDateOrBlank_(t.dataInicio, 'Data de início'),
    dataConclusao: isoDateOrBlank_(t.dataConclusao, 'Data de conclusão'),
    dueDate: isoDateOrBlank_(t.dueDate, 'Prazo'),
    pct: pct
  };
}

function assertActive_(task) {
  if (task.deletedAt) throw new Error('A tarefa ' + task.id + ' está na lixeira.');
}

function assertTaskProject_(task, metadata) {
  var requested = metadataProjectId_(metadata);
  if (String(task.projectId) !== String(requested)) {
    throw new Error('PROJECT_MISMATCH|A tarefa ' + task.id + ' pertence ao projeto ' +
      task.projectId + ', não a ' + requested + '.');
  }
}

function assertExpectedVersion_(id, expected, current) {
  if (expected === '' || expected === null || expected === undefined) {
    throw new Error('VERSION_REQUIRED|' + id + '|' + current);
  }
  var parsed = Number(expected);
  if (!isFinite(parsed) || parsed !== current) {
    throw new Error('CONFLICT|' + id + '|' + expected + '|' + current);
  }
}

function normalizeVersion_(value) {
  var n = Number(value);
  return isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function formatTaskId_(number, keyPrefix) {
  var text = String(number);
  while (text.length < 3) text = '0' + text;
  return String(keyPrefix || DEFAULT_PROJECT_ID) + '-' + text;
}

function escapeRegex_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numOrBlank_(value, label) {
  if (value === '' || value === null || value === undefined) return '';
  var n = Number(value);
  if (!isFinite(n)) throw new Error((label || 'Valor') + ' deve ser numérico.');
  return n;
}

function blankOrNumber_(value) {
  return value === '' || value === null ? '' : Number(value);
}

function isoDateOrBlank_(value, label) {
  if (!value) return '';
  var text = String(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(label + ' inválida. Use yyyy-MM-dd.');
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])) throw new Error(label + ' inválida.');
  return text;
}

function toIso_(value) {
  if (!(value instanceof Date)) return '';
  return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toIsoDateTime_(value) {
  if (!(value instanceof Date)) return '';
  return Utilities.formatDate(value, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function fromIso_(value) {
  if (!value) return '';
  var match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function boardWarnings_(tasks, mode) {
  if (mode !== 'active') return [];
  var warnings = [];
  var counts = {};
  tasks.forEach(function (task) { counts[task.status] = (counts[task.status] || 0) + 1; });
  Object.keys(counts).forEach(function (status) {
    if (counts[status] > CARD_ROWS) {
      warnings.push('A aba KANBAN mostra apenas ' + CARD_ROWS + ' cards em ' + status +
        '; o Web Kanban mostra todos os ' + counts[status] + '.');
    }
  });
  if (tasks.length >= DATA_ROWS - 1) {
    warnings.push('A base ultrapassou o range preparado de ' + (DATA_ROWS - 1) +
      ' tarefas. Execute “Reconstruir formatação/fórmulas”.');
  }
  var invalidUat = tasks.filter(function (task) {
    return (task.status === 'UAT' && (!task.uat || task.uat.status !== UAT_OUTCOMES.PENDING)) ||
      (task.status !== 'UAT' && task.uat && task.uat.status === UAT_OUTCOMES.PENDING);
  });
  if (invalidUat.length) {
    warnings.push(invalidUat.length + ' tarefa(s) possuem inconsistência entre Status e ciclo de UAT. Execute o diagnóstico antes de decidir o UAT.');
  }
  return warnings;
}

// --------------------------------------------------------------- projetos ----

function createProject(payload, metadata) {
  payload = payload || {};
  var projectId = normalizeProjectId_(payload.projectId || payload.keyPrefix);
  var name = workflowText_(payload.name, 'Nome do projeto', true, 120);
  var description = workflowText_(payload.description, 'Descrição do projeto', false, 2000);
  var email = currentUserEmail_();
  if (!email) throw new Error('Não foi possível identificar seu e-mail para criar o projeto.');

  return withLock_(function () {
    var existing = findProjectRow_(projectId);
    if (requestAlreadyProcessed_(metadata) && existing) return getBoardData(projectId);
    if (existing) throw new Error('Já existe um projeto com o ID ' + projectId + '.');
    var projects = ensureProjectsSheet_();
    var now = new Date();
    var values = [projectId, name, description, projectId, true, '{}', now, email, now];
    projects.appendRow(values);

    var members = ensureProjectMembersSheet_();
    members.appendRow([projectId, email, PROJECT_ROLES.OWNER, true, now, email,
      projectMemberId_(projectId, email)]);
    var listas = SpreadsheetApp.getActive().getSheetByName(SHEETS.LISTAS);
    if (listas) configureSheetProjectSelector_(listas, projects);
    var project = projectFromValues_(values);
    recordActivity_('project.created', projectId, null, project, metadata);
    return getBoardData(projectId);
  });
}

function setProjectMember(projectId, userEmail, role, active, metadata) {
  projectId = normalizeProjectId_(projectId);
  userEmail = String(userEmail || '').trim().toLowerCase();
  role = String(role || '').trim().toUpperCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmail)) throw new Error('E-mail do membro inválido.');
  if (Object.keys(PROJECT_ROLES).map(function (key) { return PROJECT_ROLES[key]; }).indexOf(role) === -1) {
    throw new Error('Papel inválido: ' + role);
  }
  active = active !== false;

  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getBoardData(projectId);
    resolveProject_(projectId);
    var sheet = ensureProjectMembersSheet_();
    var rows = projectMemberRows_(sheet, projectId);
    var actorEmail = currentUserEmail_();
    if (!actorEmail) throw new Error('Não foi possível identificar o usuário atual.');
    if (!rows.length) {
      if (userEmail !== actorEmail || role !== PROJECT_ROLES.OWNER || !active) {
        throw new Error('BOOTSTRAP_REQUIRED|O primeiro membro deve ser o usuário atual com papel OWNER.');
      }
    } else {
      var actorRow = rows.find(function (entry) {
        return entry.member.userEmail === actorEmail && entry.member.active;
      });
      if (!actorRow || [PROJECT_ROLES.MANAGER, PROJECT_ROLES.OWNER].indexOf(actorRow.member.role) === -1) {
        throw new Error('FORBIDDEN|Somente MANAGER ou OWNER pode alterar membros.');
      }
      if (actorRow.member.role !== PROJECT_ROLES.OWNER && role === PROJECT_ROLES.OWNER) {
        throw new Error('FORBIDDEN|Somente OWNER pode conceder o papel OWNER.');
      }
    }

    var existing = rows.find(function (entry) { return entry.member.userEmail === userEmail; });
    var before = existing ? existing.member : null;
    if (before && before.role === PROJECT_ROLES.OWNER && (!active || role !== PROJECT_ROLES.OWNER)) {
      var otherOwners = rows.filter(function (entry) {
        return entry.member.userEmail !== userEmail && entry.member.active &&
          entry.member.role === PROJECT_ROLES.OWNER;
      });
      if (!otherOwners.length) throw new Error('O projeto precisa manter pelo menos um OWNER ativo.');
    }

    var now = new Date();
    if (existing) {
      sheet.getRange(existing.row, 3, 1, 2).setValues([[role, active]]);
      sheet.getRange(existing.row, 7).setValue(projectMemberId_(projectId, userEmail));
    } else {
      sheet.appendRow([projectId, userEmail, role, active, now, actorEmail,
        projectMemberId_(projectId, userEmail)]);
    }
    var after = {
      projectId: projectId, userEmail: userEmail, role: role, active: active,
      createdAt: before ? before.createdAt : toIsoDateTime_(now),
      createdBy: before ? before.createdBy : actorEmail,
      id: before ? before.id : projectMemberId_(projectId, userEmail)
    };
    recordActivity_(existing ? 'project.member_updated' : 'project.member_added',
      projectId + ':' + userEmail, before, after, metadata);
    return getBoardData(projectId);
  });
}

function resolveProject_(requestedProjectId) {
  var projectId = normalizeProjectId_(requestedProjectId || DEFAULT_PROJECT_ID);
  var found = findProjectRow_(projectId);
  if (!found || !found.project.active) throw new Error('Projeto não encontrado ou inativo: ' + projectId);
  return found.project;
}

function resolveAccessibleProject_(requestedProjectId) {
  try {
    var requested = resolveProject_(requestedProjectId);
    authorizeProject_(requested.id, false);
    return requested;
  } catch (originalError) {
    var accessible = listAccessibleProjects_();
    if (accessible.length) return accessible[0];
    throw originalError;
  }
}

function listAccessibleProjects_() {
  var sh = ensureProjectsSheet_();
  if (sh.getLastRow() < 2) return [];
  var memberSheet = ensureProjectMembersSheet_();
  var membersByProject = {};
  if (memberSheet.getLastRow() >= 2) {
    memberSheet.getRange(2, 1, memberSheet.getLastRow() - 1, PROJECT_MEMBER_HEADERS.length)
      .getValues().forEach(function (row) {
        if (!row[0] || !row[1] || row[3] === false) return;
        var id = String(row[0]);
        if (!membersByProject[id]) membersByProject[id] = [];
        membersByProject[id].push(String(row[1]).toLowerCase());
      });
  }
  var email = currentUserEmail_();
  return sh.getRange(2, 1, sh.getLastRow() - 1, PROJECT_HEADERS.length).getValues()
    .map(projectFromValues_)
    .filter(function (project) {
      if (!project.active) return false;
      var members = membersByProject[project.id] || [];
      return !members.length || (!!email && members.indexOf(email) !== -1);
    });
}

function authorizeProject_(projectId, mutation) {
  var sh = ensureProjectMembersSheet_();
  if (sh.getLastRow() < 2) return true; // modo legado: aberto ao domínio
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, PROJECT_MEMBER_HEADERS.length).getValues();
  var projectMembers = rows.filter(function (row) {
    return String(row[0]) === String(projectId) && row[3] !== false && row[1];
  });
  if (!projectMembers.length) return true; // adoção gradual por projeto
  var email = currentUserEmail_();
  if (!email) throw new Error('FORBIDDEN|Não foi possível identificar o usuário para acessar ' + projectId + '.');
  var member = projectMembers.find(function (row) { return String(row[1]).toLowerCase() === email; });
  if (!member) throw new Error('FORBIDDEN|Você não possui acesso ao projeto ' + projectId + '.');
  var role = String(member[2] || PROJECT_ROLES.VIEWER).toUpperCase();
  if (mutation && role === PROJECT_ROLES.VIEWER) {
    throw new Error('FORBIDDEN|Seu acesso ao projeto ' + projectId + ' é somente leitura.');
  }
  return true;
}

function projectMemberRows_(sheet, projectId) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PROJECT_MEMBER_HEADERS.length).getValues();
  var result = [];
  rows.forEach(function (values, index) {
    if (String(values[0]) !== String(projectId) || !values[1]) return;
    result.push({ row: index + 2, member: projectMemberFromValues_(values) });
  });
  return result;
}

function projectMemberFromValues_(values) {
  return {
    projectId: String(values[0] || ''), userEmail: String(values[1] || '').toLowerCase(),
    role: String(values[2] || PROJECT_ROLES.VIEWER).toUpperCase(),
    active: values[3] !== false, createdAt: toIsoDateTime_(values[4]),
    createdBy: String(values[5] || ''),
    id: String(values[6] || projectMemberId_(values[0], values[1]))
  };
}

function projectMemberId_(projectId, userEmail) {
  return String(projectId || '').trim().toUpperCase() + ':' +
    String(userEmail || '').trim().toLowerCase();
}

function findProjectRow_(projectId) {
  var sh = ensureProjectsSheet_();
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, PROJECT_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(projectId)) {
      return { row: i + 2, project: projectFromValues_(rows[i]) };
    }
  }
  return null;
}

function projectFromValues_(values) {
  var settings = {};
  try { settings = JSON.parse(String(values[5] || '{}')); } catch (ignored) {}
  return {
    id: String(values[0] || ''), name: String(values[1] || ''),
    description: String(values[2] || ''), keyPrefix: String(values[3] || values[0] || ''),
    active: values[4] !== false, settings: settings,
    createdAt: toIsoDateTime_(values[6]), createdBy: String(values[7] || ''),
    updatedAt: toIsoDateTime_(values[8])
  };
}

function normalizeProjectId_(value) {
  var id = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!/^[A-Z][A-Z0-9_-]{1,11}$/.test(id)) {
    throw new Error('ID do projeto deve começar com letra e conter de 2 a 12 caracteres (A-Z, 0-9, _ ou -).');
  }
  return id;
}

function ensureProjectsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.PROJECTS);
  if (!sh) sh = ss.insertSheet(SHEETS.PROJECTS);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== PROJECT_HEADERS[0]) buildProjects_(sh);
  return sh;
}

function ensureProjectMembersSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.PROJECT_MEMBERS);
  if (!sh) sh = ss.insertSheet(SHEETS.PROJECT_MEMBERS);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== PROJECT_MEMBER_HEADERS[0]) buildProjectMembers_(sh);
  ensureConfiguredProjectMembers_(sh);
  return sh;
}

/** Garante somente membros explicitamente configurados, sem sobrescrever
 * papel/ativação definidos posteriormente por um administrador. */
function ensureConfiguredProjectMembers_(sheet) {
  if (!CONFIGURED_PROJECT_MEMBERS.length) return;
  var existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, PROJECT_MEMBER_HEADERS.length)
      .getValues().forEach(function (row) {
        if (!row[0] || !row[1]) return;
        existing[projectMemberId_(row[0], row[1])] = true;
      });
  }
  var now = new Date();
  CONFIGURED_PROJECT_MEMBERS.forEach(function (member) {
    var projectId = normalizeProjectId_(member.projectId);
    var email = String(member.userEmail || '').trim().toLowerCase();
    var role = String(member.role || PROJECT_ROLES.MEMBER).trim().toUpperCase();
    var memberId = projectMemberId_(projectId, email);
    if (existing[memberId]) return;
    sheet.appendRow([projectId, email, role, true, now, 'system:configured-member', memberId]);
    existing[memberId] = true;
  });
}

function currentUserEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); }
  catch (ignored) { return ''; }
}

function metadataProjectId_(metadata) {
  try { return normalizeProjectId_(metadata && metadata.projectId || DEFAULT_PROJECT_ID); }
  catch (ignored) { return DEFAULT_PROJECT_ID; }
}

// -------------------------------------------------------------- workflow ----

function validateWorkflowTransition_(before, newStatus, acceptanceCriteria) {
  if (newStatus === 'UAT' && (!before || before.status !== 'UAT')) {
    workflowText_(acceptanceCriteria, 'Critérios de aceite para entrada em UAT', true, 20000);
  }
  if (before && before.status === 'UAT' && newStatus !== 'UAT') {
    throw new Error('UAT_DECISION_REQUIRED|' + before.id + '|Use Aprovar ou Reprovar UAT.');
  }
}

function workflowText_(value, label, required, maxLength) {
  var text = String(value || '').trim();
  if (required && !text) throw new Error(label + ' é obrigatório.');
  if (text.length > maxLength) throw new Error(label + ' deve ter no máximo ' + maxLength + ' caracteres.');
  return text;
}

function createBlocker_(taskId, projectId, reason, unblockOwner) {
  var sh = ensureBlockerSheet_();
  var actor = currentActor_();
  var values = [
    Utilities.getUuid(), String(taskId), projectId, reason, actor, new Date(),
    unblockOwner, '', '', '', 1
  ];
  sh.appendRow(values);
  return blockerFromValues_(values);
}

function createUatRun_(taskId, criteria, projectId) {
  if (findPendingUatRow_(taskId)) throw new Error('Já existe um ciclo de UAT pendente para ' + taskId + '.');
  var sh = ensureUatSheet_();
  var actor = currentActor_();
  var values = [
    Utilities.getUuid(), String(taskId), projectId, UAT_OUTCOMES.PENDING,
    String(criteria || ''), actor, new Date(), '', '', '', '', 1
  ];
  sh.appendRow(values);
  return uatFromValues_(values);
}

function activeBlockersByTask_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.BLOCKERS);
  var result = {};
  if (!sh || sh.getLastRow() < 2) return result;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, BLOCKER_HEADERS.length).getValues();
  rows.forEach(function (values) {
    if (!values[0] || values[7] instanceof Date || values[7]) return;
    var blocker = blockerFromValues_(values);
    result[blocker.taskId] = blocker;
  });
  return result;
}

function latestUatByTask_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.UAT_RUNS);
  var result = {};
  if (!sh || sh.getLastRow() < 2) return result;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, UAT_HEADERS.length).getValues();
  rows.forEach(function (values) {
    if (!values[0]) return;
    var uat = uatFromValues_(values);
    result[uat.taskId] = uat;
  });
  return result;
}

function commentsForTask_(taskId, projectId) {
  var sh = ensureCommentsSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COMMENT_HEADERS.length).getValues()
    .filter(function (row) { return String(row[1]) === String(taskId) && String(row[2]) === String(projectId); })
    .map(commentFromValues_);
}

function blockerHistoryForTask_(taskId, projectId) {
  var sh = ensureBlockerSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, BLOCKER_HEADERS.length).getValues()
    .filter(function (row) { return String(row[1]) === String(taskId) && String(row[2]) === String(projectId); })
    .map(blockerFromValues_);
}

function uatHistoryForTask_(taskId, projectId) {
  var sh = ensureUatSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, UAT_HEADERS.length).getValues()
    .filter(function (row) { return String(row[1]) === String(taskId) && String(row[2]) === String(projectId); })
    .map(uatFromValues_);
}

function activityForTask_(taskId, projectId, limit) {
  var sh = ensureActivitySheet_();
  if (sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, ACTIVITY_HEADERS.length).getValues();
  var result = [];
  for (var i = rows.length - 1; i >= 0 && result.length < limit; i--) {
    if (String(rows[i][5]) !== String(taskId) || String(rows[i][6]) !== String(projectId)) continue;
    result.push({
      id: String(rows[i][0] || ''), occurredAt: toIsoDateTime_(rows[i][1]),
      actor: String(rows[i][2] || ''), source: String(rows[i][3] || ''),
      eventType: String(rows[i][4] || ''), before: safeParseJson_(rows[i][7]),
      after: safeParseJson_(rows[i][8]), correlationId: String(rows[i][9] || ''),
      requestId: String(rows[i][10] || '')
    });
  }
  return result;
}

function commentFromValues_(values) {
  return {
    id: String(values[0] || ''), taskId: String(values[1] || ''),
    projectId: String(values[2] || ''), body: String(values[3] || ''),
    author: String(values[4] || ''), createdAt: toIsoDateTime_(values[5]),
    source: String(values[6] || ''), version: normalizeVersion_(values[7])
  };
}

function safeParseJson_(value) {
  if (!value) return null;
  try { return JSON.parse(String(value)); }
  catch (ignored) { return { raw: String(value) }; }
}

function findActiveBlockerRow_(taskId) {
  var sh = ensureBlockerSheet_();
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, BLOCKER_HEADERS.length).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]) === String(taskId) && !rows[i][7]) {
      return { row: i + 2, blocker: blockerFromValues_(rows[i]) };
    }
  }
  return null;
}

function findPendingUatRow_(taskId) {
  var sh = ensureUatSheet_();
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, UAT_HEADERS.length).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][1]) === String(taskId) && String(rows[i][3]) === UAT_OUTCOMES.PENDING) {
      return { row: i + 2, uat: uatFromValues_(rows[i]) };
    }
  }
  return null;
}

function blockerFromValues_(values) {
  return {
    id: String(values[0] || ''), taskId: String(values[1] || ''),
    projectId: String(values[2] || ''), reason: String(values[3] || ''),
    blockedBy: String(values[4] || ''), blockedAt: toIsoDateTime_(values[5]),
    unblockOwner: String(values[6] || ''), resolvedAt: toIsoDateTime_(values[7]),
    resolvedBy: String(values[8] || ''), resolution: String(values[9] || ''),
    version: normalizeVersion_(values[10])
  };
}

function uatFromValues_(values) {
  return {
    id: String(values[0] || ''), taskId: String(values[1] || ''),
    projectId: String(values[2] || ''), status: String(values[3] || ''),
    criteria: String(values[4] || ''), submittedBy: String(values[5] || ''),
    submittedAt: toIsoDateTime_(values[6]), tester: String(values[7] || ''),
    decidedBy: String(values[8] || ''), decidedAt: toIsoDateTime_(values[9]),
    feedback: String(values[10] || ''), version: normalizeVersion_(values[11])
  };
}

function ensureBlockerSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.BLOCKERS);
  if (!sh) sh = ss.insertSheet(SHEETS.BLOCKERS);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== BLOCKER_HEADERS[0]) buildBlockers_(sh);
  return sh;
}

function ensureUatSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.UAT_RUNS);
  if (!sh) sh = ss.insertSheet(SHEETS.UAT_RUNS);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== UAT_HEADERS[0]) buildUatRuns_(sh);
  return sh;
}

function ensureCommentsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.COMMENTS);
  if (!sh) sh = ss.insertSheet(SHEETS.COMMENTS);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== COMMENT_HEADERS[0]) buildComments_(sh);
  return sh;
}

function cloneForEvent_(value) {
  return JSON.parse(JSON.stringify(value));
}

// ------------------------------------------------------------- auditoria ----

function recordActivity_(eventType, entityId, before, after, metadata) {
  var sh = ensureActivitySheet_();
  var meta = normalizeMetadata_(metadata);
  var projectId = activityProjectId_(before, after, meta);
  sh.appendRow([
    Utilities.getUuid(), new Date(), currentActor_(), meta.source, eventType,
    String(entityId || ''), projectId, safeJson_(before), safeJson_(after),
    meta.correlationId, meta.requestId
  ]);
}

function ensureActivitySheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.ACTIVITY);
  if (!sh) sh = ss.insertSheet(SHEETS.ACTIVITY);
  if (sh.getLastRow() === 0 || sh.getRange(1, 1).getValue() !== ACTIVITY_HEADERS[0]) buildActivity_(sh);
  return sh;
}

function normalizeMetadata_(metadata) {
  metadata = metadata || {};
  return {
    source: String(metadata.source || 'kanban_html').slice(0, 100),
    correlationId: String(metadata.correlationId || Utilities.getUuid()).slice(0, 240),
    requestId: String(metadata.requestId || '').slice(0, 240),
    projectId: metadataProjectId_(metadata)
  };
}

function activityProjectId_(before, after, metadata) {
  var candidates = [
    after && (after.projectId || after.id),
    before && (before.projectId || before.id),
    metadata && metadata.projectId,
    DEFAULT_PROJECT_ID
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { if (candidates[i]) return normalizeProjectId_(candidates[i]); } catch (ignored) {}
  }
  return DEFAULT_PROJECT_ID;
}

/** Evita repetir uma mutação quando o servidor a concluiu, mas o cliente não
 * recebeu a resposta. O request_id é mantido pelo rascunho até o ACK. */
function requestAlreadyProcessed_(metadata) {
  return processedActivity_(metadata) !== null;
}

/** Devolve o evento que consumiu o request_id para distinguir retry legítimo
 * de reutilização acidental do mesmo identificador em outra operação. */
function processedActivity_(metadata) {
  var meta = normalizeMetadata_(metadata);
  var sh = ensureActivitySheet_(); // também valida a trilha antes da mutação
  if (!meta.requestId || sh.getLastRow() < 2) return null;
  var requestColumn = ACTIVITY_HEADERS.indexOf('request_id') + 1;
  var match = sh.getRange(2, requestColumn, sh.getLastRow() - 1, 1)
    .createTextFinder(meta.requestId).matchEntireCell(true).findNext();
  if (!match) return null;
  var values = sh.getRange(match.getRow(), 1, 1, ACTIVITY_HEADERS.length).getValues()[0];
  return {
    eventId: String(values[0] || ''), eventType: String(values[4] || ''),
    entityId: String(values[5] || ''), projectId: String(values[6] || ''),
    requestId: String(values[10] || '')
  };
}

function currentActor_() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (ignored) {}
  try {
    var key = Session.getTemporaryActiveUserKey();
    if (key) return 'user-key:' + key;
  } catch (ignoredToo) {}
  return 'unknown';
}

function safeJson_(value) {
  if (value === null || value === undefined) return '';
  var json = JSON.stringify(value);
  if (json.length <= 45000) return json;
  return JSON.stringify({ truncated: true, preview: json.slice(0, 44000) });
}
