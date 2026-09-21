/**
 * Contrato único para terminal, Claude e Codex via Apps Script Execution API.
 * Uso local: clasp run cliDispatch -p '[{"action":"list","projectId":"AG"}]'
 */
function cliDispatch(request) {
  request = request || {};
  var action = String(request.action || '').trim().toLowerCase();
  var projectId = normalizeProjectId_(request.projectId || DEFAULT_PROJECT_ID);
  var taskId = String(request.taskId || '').trim();
  var inboxId = String(request.inboxId || '').trim();
  var payload = request.payload || {};
  var metadata = cliMetadata_(request, projectId);
  var data;

  if (action === 'list') {
    var listBoard = getBoardData(projectId);
    if (listBoard.projectId !== projectId) throw new Error('Projeto indisponível: ' + projectId);
    data = cliList_(listBoard, payload);
  } else if (action === 'search') {
    data = searchProjectKnowledge(projectId, payload.query, payload);
  } else if (action === 'ask') {
    data = askProject(projectId, payload.question, payload);
  } else if (action === 'health' || action === 'automation_health') {
    data = getProjectAutomationHealth(projectId, payload);
  } else if (action === 'inbox_list') {
    data = getInboxData(projectId, payload.status || 'ALL');
  } else if (action === 'inbox_capture') {
    payload.projectId = projectId;
    data = captureInboxItem(payload, metadata);
  } else if (action === 'inbox_classify') {
    requireCliInboxId_(inboxId);
    data = classifyInboxItem(inboxId, requireCliVersion_(request.version), payload, metadata);
  } else if (action === 'inbox_convert') {
    requireCliInboxId_(inboxId);
    data = convertInboxItemToTask(inboxId, requireCliVersion_(request.version), payload, metadata);
  } else if (action === 'inbox_archive') {
    requireCliInboxId_(inboxId);
    data = archiveInboxItem(inboxId, requireCliVersion_(request.version), metadata);
  } else if (action === 'context' || action === 'show') {
    requireCliTaskId_(taskId);
    data = getTaskContext(taskId, projectId);
  } else if (action === 'create') {
    payload.projectId = projectId;
    var createdBoard = createTask(payload, metadata);
    data = cliMutationResult_(createdBoard, latestTaskId_(createdBoard.tasks));
  } else {
    requireCliTaskId_(taskId);
    var version = requireCliVersion_(request.version);
    if (action === 'claim') {
      var claimContext = getTaskContext(taskId, projectId);
      claimContext.task.version = version;
      claimContext.task.responsavel = String(payload.assignee || '').trim();
      data = cliMutationResult_(saveTask(claimContext.task, metadata), taskId);
    } else if (action === 'start') {
      data = cliMutationResult_(updateTaskStatus(taskId, String(payload.status || 'DEV'), version, metadata), taskId);
    } else if (action === 'status') {
      data = cliMutationResult_(updateTaskStatus(taskId, String(payload.status || ''), version, metadata), taskId);
    } else if (action === 'submit_uat' || action === 'complete') {
      data = cliMutationResult_(updateTaskStatus(taskId, 'UAT', version, metadata), taskId);
    } else if (action === 'comment') {
      data = cliMutationResult_(addTaskComment(taskId, version, payload.body, metadata), taskId);
    } else if (action === 'block') {
      data = cliMutationResult_(blockTask(taskId, version, payload, metadata), taskId);
    } else if (action === 'unblock') {
      data = cliMutationResult_(unblockTask(taskId, version, payload, metadata), taskId);
    } else if (action === 'uat_approve') {
      data = cliMutationResult_(decideUat(taskId, version, 'APPROVED', payload.feedback || '', metadata), taskId);
    } else if (action === 'uat_reject') {
      data = cliMutationResult_(decideUat(taskId, version, 'REJECTED', payload.feedback || '', metadata), taskId);
    } else if (action === 'delete') {
      data = cliMutationResult_(deleteTask(taskId, version, metadata), taskId);
      data.deleted = true;
    } else if (action === 'restore') {
      data = cliMutationResult_(restoreTask(taskId, version, metadata), taskId);
    } else {
      throw new Error('Ação CLI inválida: ' + action);
    }
  }

  return {
    ok: true,
    action: action,
    projectId: data.projectId || projectId,
    correlationId: metadata.correlationId,
    requestId: metadata.requestId,
    data: data
  };
}

function cliList_(board, filters) {
  filters = filters || {};
  var search = String(filters.search || '').toLowerCase();
  var tasks = board.tasks.filter(function (task) {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.assignee && task.responsavel !== filters.assignee) return false;
    if (filters.blocked === true && !task.blocker) return false;
    if (filters.blocked === false && task.blocker) return false;
    if (search) {
      var haystack = (task.id + ' ' + task.tarefa + ' ' + task.descricao + ' ' + task.observacoes).toLowerCase();
      if (haystack.indexOf(search) === -1) return false;
    }
    return true;
  }).map(function (task) {
    return {
      id: task.id, title: task.tarefa, status: task.status,
      assignee: task.responsavel, priority: task.prioridade, dueDate: task.dueDate,
      version: task.version, blocked: !!task.blocker,
      uatStatus: task.uat ? task.uat.status : ''
    };
  });
  return { projectId: board.projectId, project: board.project, tasks: tasks, total: tasks.length };
}

function cliMutationResult_(board, taskId) {
  var task = board.tasks.find(function (item) { return item.id === taskId; }) || null;
  return { projectId: board.projectId, task: task, warnings: board.warnings || [] };
}

function latestTaskId_(tasks) {
  if (!tasks.length) return '';
  return tasks.slice().sort(function (a, b) {
    var an = Number((String(a.id).match(/(\d+)$/) || [0, 0])[1]);
    var bn = Number((String(b.id).match(/(\d+)$/) || [0, 0])[1]);
    return bn - an;
  })[0].id;
}

function cliMetadata_(request, projectId) {
  var requestId = String(request.requestId || Utilities.getUuid());
  var agent = String(request.agent || 'terminal').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return {
    source: 'cli:' + (agent || 'terminal'),
    requestId: requestId,
    correlationId: String(request.correlationId || requestId),
    projectId: projectId
  };
}

function requireCliTaskId_(taskId) {
  if (!taskId) throw new Error('taskId é obrigatório para esta ação.');
}

function requireCliInboxId_(inboxId) {
  if (!inboxId) throw new Error('inboxId é obrigatório para esta ação.');
}

function requireCliVersion_(version) {
  var parsed = Number(version);
  if (!isFinite(parsed) || parsed < 1 || Math.floor(parsed) !== parsed) {
    throw new Error('version inteiro é obrigatório para mutações CLI. Consulte context antes de alterar.');
  }
  return parsed;
}
