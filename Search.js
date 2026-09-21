/**
 * Busca e consulta determinística por projeto.
 *
 * Esta camada usa filtros e ranking textual sobre dados estruturados. Conteúdo
 * de tarefas, comentários e Inbox é tratado somente como dado, nunca como
 * instrução. Um LLM/RAG poderá consumir este contrato no futuro, após uma nova
 * checagem de autorização e com citações preservadas.
 */

var SEARCH_DEFAULT_LIMIT = 20;
var SEARCH_MAX_LIMIT = 50;
var SEARCH_ACTIVITY_SCAN_LIMIT = 2000;

function searchProjectKnowledge(requestedProjectId, query, options) {
  query = workflowText_(query, 'Consulta', true, 500);
  options = options || {};
  var project = resolveProject_(requestedProjectId || DEFAULT_PROJECT_ID);
  authorizeProject_(project.id, false);
  var snapshot = searchProjectSnapshot_(project, true);
  var ranked = searchRankSnapshot_(snapshot, query, options);
  var limit = searchLimit_(options.limit);
  return {
    projectId: project.id,
    project: project,
    query: query,
    mode: 'traditional',
    generatedBy: 'deterministic_rules',
    total: ranked.length,
    limit: limit,
    results: ranked.slice(0, limit),
    sources: searchSourceCounts_(ranked),
    searchedAt: toIsoDateTime_(new Date())
  };
}

function askProject(requestedProjectId, question, options) {
  question = workflowText_(question, 'Pergunta', true, 500);
  options = options || {};
  var project = resolveProject_(requestedProjectId || DEFAULT_PROJECT_ID);
  authorizeProject_(project.id, false);
  var board = getBoardData(project.id);
  if (board.projectId !== project.id) throw new Error('Projeto indisponível: ' + project.id);
  var intent = searchDetectIntent_(question);
  var today = searchTodayIso_(options.today);
  var result;

  if (intent === 'blocked') result = searchAnswerBlocked_(board.tasks);
  else if (intent === 'uat') result = searchAnswerUat_(board.tasks);
  else if (intent === 'completed_week') {
    result = searchAnswerCompletedWeek_(board.tasks, searchProjectActivities_(project.id), today);
  } else if (intent === 'overdue') result = searchAnswerOverdue_(board.tasks, today);
  else if (intent === 'bugs') result = searchAnswerBugs_(board.tasks, searchProjectInbox_(project.id));
  else if (intent === 'responsibility') result = searchAnswerResponsibility_(project, board.tasks, question, options);
  else if (intent === 'next_steps') result = searchAnswerNextSteps_(board.tasks, today);
  else if (intent === 'latest_change') {
    result = searchAnswerLatestChange_(project, board.tasks, searchProjectActivities_(project.id), question, options);
  } else if (intent === 'status_summary') result = searchAnswerStatus_(board.tasks, today);
  else {
    var snapshot = searchProjectSnapshot_(project, true, board.tasks);
    result = searchAnswerFallback_(searchRankSnapshot_(snapshot, question, options), searchLimit_(options.limit));
  }

  return {
    projectId: project.id,
    project: project,
    question: question,
    intent: intent,
    answer: result.answer,
    metrics: result.metrics || {},
    evidence: (result.evidence || []).slice(0, searchLimit_(options.limit)),
    mode: 'deterministic',
    generatedBy: 'deterministic_rules',
    limitations: result.limitations ||
      'Resposta calculada a partir dos dados estruturados visíveis neste projeto; não usa LLM nem embeddings.',
    answeredAt: toIsoDateTime_(new Date())
  };
}

function getProjectInsights(requestedProjectId, options) {
  return askProject(requestedProjectId, 'Qual é o status atual do projeto?', options || {});
}

function searchProjectSnapshot_(project, includeActivity, knownTasks) {
  var tasks = knownTasks;
  if (!tasks) {
    var board = getBoardData(project.id);
    if (board.projectId !== project.id) throw new Error('Projeto indisponível: ' + project.id);
    tasks = board.tasks;
  }
  return {
    project: project,
    tasks: tasks,
    inbox: searchProjectInbox_(project.id),
    comments: searchProjectComments_(project.id),
    activity: includeActivity ? searchProjectActivities_(project.id) : []
  };
}

function searchProjectInbox_(projectId) {
  var sheet = ensureInboxSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, INBOX_HEADERS.length).getValues()
    .filter(function (row) {
      return !!row[0] && String(row[1]) === String(projectId) && !row[17];
    }).map(inboxItemFromValues_);
}

function searchProjectComments_(projectId) {
  var sheet = ensureCommentsSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, COMMENT_HEADERS.length).getValues()
    .filter(function (row) { return !!row[0] && String(row[2]) === String(projectId); })
    .map(commentFromValues_);
}

function searchProjectActivities_(projectId) {
  var sheet = ensureActivitySheet_();
  if (sheet.getLastRow() < 2) return [];
  var count = Math.min(sheet.getLastRow() - 1, SEARCH_ACTIVITY_SCAN_LIMIT);
  var firstRow = sheet.getLastRow() - count + 1;
  return sheet.getRange(firstRow, 1, count, ACTIVITY_HEADERS.length).getValues()
    .filter(function (row) { return !!row[0] && String(row[6]) === String(projectId); })
    .map(function (row) {
      return {
        id: String(row[0] || ''), occurredAt: toIsoDateTime_(row[1]),
        actor: String(row[2] || ''), source: String(row[3] || ''),
        eventType: String(row[4] || ''), entityId: String(row[5] || '')
      };
    });
}

function searchRankSnapshot_(snapshot, query, options) {
  options = options || {};
  var queryNormalized = searchNormalize_(query);
  var tokens = searchTokens_(query);
  var taskById = {};
  snapshot.tasks.forEach(function (task) { taskById[task.id] = task; });
  var allowedKinds = searchAllowedKinds_(options.kinds);
  var results = [];

  if (!allowedKinds || allowedKinds.TASK) {
    snapshot.tasks.forEach(function (task) {
      var statusAliases = searchStatusAliases_(task.status);
      var score = searchDocumentScore_(queryNormalized, tokens, [
        { value: task.id, weight: 12 }, { value: task.tarefa, weight: 9 },
        { value: task.descricao, weight: 5 }, { value: task.subtarefas, weight: 4 },
        { value: task.dependencias, weight: 4 }, { value: task.observacoes, weight: 3 },
        { value: task.responsavel, weight: 4 }, { value: task.status + ' ' + statusAliases, weight: 5 },
        { value: task.blocker && task.blocker.reason, weight: 5 },
        { value: task.uat && (task.uat.criteria + ' ' + task.uat.feedback), weight: 3 }
      ]);
      if (!score) return;
      results.push(searchTaskEvidence_(task, score,
        searchSnippet_(task.descricao || task.subtarefas || task.observacoes || task.tarefa)));
    });
  }

  if (!allowedKinds || allowedKinds.INBOX) {
    snapshot.inbox.forEach(function (item) {
      if (item.status === 'ARCHIVED') return;
      var score = searchDocumentScore_(queryNormalized, tokens, [
        { value: item.id, weight: 10 }, { value: item.suggestedTitle, weight: 8 },
        { value: item.rawText, weight: 5 }, { value: item.sourceUrl, weight: 3 },
        { value: item.suggestedType, weight: 4 }, { value: item.captureType, weight: 2 },
        { value: item.status, weight: 2 }
      ]);
      if (!score) return;
      results.push({
        kind: 'INBOX', id: item.id, taskId: item.convertedTaskId || '',
        title: item.suggestedTitle || searchSnippet_(item.rawText, 100) || 'Item da Inbox',
        snippet: searchSnippet_(item.rawText || item.sourceUrl), status: item.status,
        assignee: '', date: item.capturedAt, score: score, source: SHEETS.INBOX
      });
    });
  }

  if (!allowedKinds || allowedKinds.COMMENT) {
    snapshot.comments.forEach(function (comment) {
      var task = taskById[comment.taskId];
      var score = searchDocumentScore_(queryNormalized, tokens, [
        { value: comment.taskId, weight: 8 }, { value: task && task.tarefa, weight: 5 },
        { value: comment.body, weight: 6 }, { value: comment.author, weight: 3 }
      ]);
      if (!score) return;
      results.push({
        kind: 'COMMENT', id: comment.id, taskId: comment.taskId,
        title: 'Comentário em ' + comment.taskId + (task ? ' — ' + task.tarefa : ''),
        snippet: searchSnippet_(comment.body), status: task ? task.status : '',
        assignee: task ? task.responsavel : '', date: comment.createdAt,
        score: score, source: SHEETS.COMMENTS
      });
    });
  }

  if (!allowedKinds || allowedKinds.ACTIVITY) {
    snapshot.activity.forEach(function (event) {
      var task = taskById[event.entityId];
      var label = searchActivityLabel_(event.eventType);
      var score = searchDocumentScore_(queryNormalized, tokens, [
        { value: event.entityId, weight: 8 }, { value: task && task.tarefa, weight: 5 },
        { value: event.eventType + ' ' + label, weight: 5 },
        { value: event.actor, weight: 2 }, { value: event.source, weight: 1 }
      ]);
      if (!score) return;
      results.push({
        kind: 'ACTIVITY', id: event.id, taskId: task ? task.id : '',
        title: label + (event.entityId ? ' — ' + event.entityId : ''),
        snippet: searchSnippet_((task ? task.tarefa + ' · ' : '') + (event.actor || event.source)),
        status: task ? task.status : '', assignee: task ? task.responsavel : '',
        date: event.occurredAt, score: score, source: SHEETS.ACTIVITY
      });
    });
  }

  return results.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var dateOrder = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateOrder) return dateOrder;
    return String(a.id).localeCompare(String(b.id));
  });
}

function searchDocumentScore_(queryNormalized, tokens, fields) {
  if (!queryNormalized) return 0;
  var score = 0;
  var matchedTokens = {};
  fields.forEach(function (field) {
    var value = searchNormalize_(field && field.value);
    if (!value) return;
    var weight = Number(field.weight || 1);
    if (value === queryNormalized) score += weight * 12;
    else if (value.indexOf(queryNormalized) !== -1) score += weight * 5;
    tokens.forEach(function (token) {
      if (value.indexOf(token) !== -1) {
        score += weight;
        matchedTokens[token] = true;
      }
    });
  });
  if (tokens.length && Object.keys(matchedTokens).length === tokens.length) score += 12;
  return score;
}

function searchNormalize_(value) {
  var text = String(value == null ? '' : value).toLowerCase();
  try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (ignored) {}
  return text.replace(/[^a-z0-9_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchTokens_(query) {
  var stop = {
    a: 1, as: 1, ao: 1, aos: 1, de: 1, da: 1, das: 1, do: 1, dos: 1,
    e: 1, em: 1, no: 1, nos: 1, na: 1, nas: 1, o: 1, os: 1, um: 1, uma: 1,
    para: 1, por: 1, que: 1, qual: 1, quais: 1, como: 1, com: 1, este: 1,
    esta: 1, esse: 1, essa: 1, atual: 1, projeto: 1, tarefa: 1, tarefas: 1
  };
  var seen = {};
  return searchNormalize_(query).split(' ').filter(function (token) {
    if (!token || token.length < 2 || stop[token] || seen[token]) return false;
    seen[token] = true;
    return true;
  });
}

function searchAllowedKinds_(kinds) {
  if (!kinds || !kinds.length) return null;
  var result = {};
  kinds.forEach(function (kind) {
    var normalized = String(kind || '').trim().toUpperCase();
    if (['TASK', 'INBOX', 'COMMENT', 'ACTIVITY'].indexOf(normalized) !== -1) result[normalized] = true;
  });
  return Object.keys(result).length ? result : null;
}

function searchLimit_(value) {
  var limit = Number(value || SEARCH_DEFAULT_LIMIT);
  if (!isFinite(limit)) limit = SEARCH_DEFAULT_LIMIT;
  return Math.max(1, Math.min(SEARCH_MAX_LIMIT, Math.floor(limit)));
}

function searchSourceCounts_(results) {
  var counts = { tasks: 0, inbox: 0, comments: 0, activity: 0 };
  results.forEach(function (item) {
    if (item.kind === 'TASK') counts.tasks++;
    else if (item.kind === 'INBOX') counts.inbox++;
    else if (item.kind === 'COMMENT') counts.comments++;
    else if (item.kind === 'ACTIVITY') counts.activity++;
  });
  return counts;
}

function searchStatusAliases_(status) {
  var aliases = {
    'BACKLOG': 'backlog pendente fila',
    'NÃO-INICIADO': 'nao iniciado não iniciado pendente',
    'DEV': 'desenvolvimento implementacao implementação em andamento',
    'DEVMERGE': 'code review revisao revisão merge pull request',
    'UAT': 'uat homologacao homologação validacao validação',
    'PRODUÇÃO': 'producao produção concluido concluído finalizado entregue'
  };
  return aliases[status] || '';
}

function searchSnippet_(value, maxLength) {
  var text = String(value || '').replace(/\s+/g, ' ').trim();
  var limit = Number(maxLength || 240);
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function searchTaskEvidence_(task, score, detail) {
  return {
    kind: 'TASK', id: task.id, taskId: task.id, title: task.tarefa,
    snippet: detail || '', detail: detail || '', status: task.status,
    assignee: task.responsavel, date: task.dataConclusao || task.dueDate || task.dataInicio || task.dataCriacao,
    score: Number(score || 0), source: SHEETS.BASE,
    blocked: !!task.blocker, uatStatus: task.uat ? task.uat.status : ''
  };
}

function searchDetectIntent_(question) {
  var q = searchNormalize_(question);
  if ((q.indexOf('ultima') !== -1 || q.indexOf('ultimo') !== -1) &&
      (q.indexOf('alteracao') !== -1 || q.indexOf('mudanca') !== -1 || q.indexOf('atualizacao') !== -1)) {
    return 'latest_change';
  }
  if (q.indexOf('bloque') !== -1 || q.indexOf('impediment') !== -1) return 'blocked';
  if (q.indexOf('uat') !== -1 || q.indexOf('homolog') !== -1) return 'uat';
  if ((q.indexOf('conclu') !== -1 || q.indexOf('finaliz') !== -1 || q.indexOf('entreg') !== -1) &&
      q.indexOf('semana') !== -1) return 'completed_week';
  if (q.indexOf('atras') !== -1 || q.indexOf('vencid') !== -1) return 'overdue';
  if (q.indexOf('bug') !== -1 || q.indexOf('defeito') !== -1) return 'bugs';
  if (q.indexOf('responsavel') !== -1 || (q.indexOf('quem') !== -1 && q.indexOf('modulo') !== -1)) {
    return 'responsibility';
  }
  if (q.indexOf('proximo passo') !== -1 || q.indexOf('proximos passos') !== -1 ||
      q.indexOf('precisamos fazer') !== -1 || q.indexOf('para finalizar') !== -1) return 'next_steps';
  if (q.indexOf('status') !== -1 || q.indexOf('andamento') !== -1 || q.indexOf('situacao') !== -1) {
    return 'status_summary';
  }
  return 'search';
}

function searchAnswerStatus_(tasks, today) {
  var counts = {};
  statusNames_().forEach(function (status) { counts[status] = 0; });
  tasks.forEach(function (task) { counts[task.status] = (counts[task.status] || 0) + 1; });
  var open = tasks.filter(function (task) { return task.status !== 'PRODUÇÃO'; });
  var blocked = tasks.filter(function (task) { return !!task.blocker; });
  var uat = tasks.filter(function (task) { return task.status === 'UAT' && task.uat && task.uat.status === 'PENDING'; });
  var overdue = open.filter(function (task) { return !!task.dueDate && task.dueDate < today; });
  var statusLine = statusNames_().map(function (status) { return status + ': ' + (counts[status] || 0); }).join(' · ');
  return {
    answer: tasks.length + ' tarefa(s) ativa(s). ' + statusLine + '.\n' +
      open.length + ' em aberto; ' + blocked.length + ' bloqueada(s); ' + uat.length +
      ' em UAT pendente; ' + overdue.length + ' atrasada(s).',
    metrics: { total: tasks.length, open: open.length, blocked: blocked.length, uatPending: uat.length, overdue: overdue.length, byStatus: counts },
    evidence: searchPrioritizedTasks_(open, today).slice(0, 10).map(function (task) {
      return searchTaskEvidence_(task, 0, searchTaskReason_(task, today));
    })
  };
}

function searchAnswerBlocked_(tasks) {
  var blocked = tasks.filter(function (task) { return !!task.blocker; }).sort(function (a, b) {
    return String(a.blocker.blockedAt).localeCompare(String(b.blocker.blockedAt));
  });
  if (!blocked.length) return { answer: 'Não há tarefas bloqueadas neste projeto.', metrics: { blocked: 0 }, evidence: [] };
  return {
    answer: blocked.length + ' tarefa(s) bloqueada(s):\n' + blocked.slice(0, 10).map(function (task) {
      return task.id + ' — ' + task.tarefa + ': ' + task.blocker.reason +
        (task.blocker.unblockOwner ? ' (desbloqueio: ' + task.blocker.unblockOwner + ')' : '');
    }).join('\n'),
    metrics: { blocked: blocked.length },
    evidence: blocked.map(function (task) {
      return searchTaskEvidence_(task, 0, task.blocker.reason +
        (task.blocker.unblockOwner ? ' · Desbloqueio: ' + task.blocker.unblockOwner : ''));
    })
  };
}

function searchAnswerUat_(tasks) {
  var pending = tasks.filter(function (task) {
    return task.status === 'UAT' && task.uat && task.uat.status === 'PENDING';
  }).sort(function (a, b) { return String(a.uat.submittedAt).localeCompare(String(b.uat.submittedAt)); });
  if (!pending.length) return { answer: 'Não há tarefas aguardando decisão de UAT.', metrics: { uatPending: 0 }, evidence: [] };
  return {
    answer: pending.length + ' tarefa(s) aguardando UAT:\n' + pending.slice(0, 10).map(function (task) {
      return task.id + ' — ' + task.tarefa + (task.uat.tester ? ' (tester: ' + task.uat.tester + ')' : '');
    }).join('\n'),
    metrics: { uatPending: pending.length },
    evidence: pending.map(function (task) { return searchTaskEvidence_(task, 0, task.uat.criteria); })
  };
}

function searchAnswerCompletedWeek_(tasks, activities, today) {
  var bounds = searchWeekBounds_(today);
  var taskById = {};
  tasks.forEach(function (task) { taskById[task.id] = task; });
  var found = {};
  tasks.forEach(function (task) {
    if (task.dataConclusao >= bounds.from && task.dataConclusao <= bounds.to) found[task.id] = task;
  });
  activities.forEach(function (event) {
    var date = String(event.occurredAt || '').slice(0, 10);
    if (date < bounds.from || date > bounds.to) return;
    if (event.eventType === 'uat.approved' || event.eventType === 'task.completed') {
      if (taskById[event.entityId]) found[event.entityId] = taskById[event.entityId];
    }
  });
  var completed = Object.keys(found).map(function (id) { return found[id]; }).sort(function (a, b) {
    return String(b.dataConclusao).localeCompare(String(a.dataConclusao));
  });
  if (!completed.length) {
    return {
      answer: 'Nenhuma tarefa concluída entre ' + searchPtDate_(bounds.from) + ' e ' + searchPtDate_(bounds.to) + '.',
      metrics: { completedThisWeek: 0, from: bounds.from, to: bounds.to }, evidence: []
    };
  }
  return {
    answer: completed.length + ' tarefa(s) concluída(s) entre ' + searchPtDate_(bounds.from) + ' e ' +
      searchPtDate_(bounds.to) + ':\n' + completed.slice(0, 10).map(function (task) {
        return task.id + ' — ' + task.tarefa;
      }).join('\n'),
    metrics: { completedThisWeek: completed.length, from: bounds.from, to: bounds.to },
    evidence: completed.map(function (task) { return searchTaskEvidence_(task, 0, 'Concluída nesta semana'); })
  };
}

function searchAnswerOverdue_(tasks, today) {
  var overdue = tasks.filter(function (task) {
    return task.status !== 'PRODUÇÃO' && !!task.dueDate && task.dueDate < today;
  }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
  if (!overdue.length) return { answer: 'Não há tarefas atrasadas neste projeto.', metrics: { overdue: 0 }, evidence: [] };
  return {
    answer: overdue.length + ' tarefa(s) atrasada(s):\n' + overdue.slice(0, 10).map(function (task) {
      return task.id + ' — ' + task.tarefa + ' (prazo ' + searchPtDate_(task.dueDate) + ')';
    }).join('\n'),
    metrics: { overdue: overdue.length },
    evidence: overdue.map(function (task) { return searchTaskEvidence_(task, 0, 'Prazo: ' + searchPtDate_(task.dueDate)); })
  };
}

function searchAnswerBugs_(tasks, inbox) {
  var bugPattern = /\b(bug|bugs|erro|erros|defeito|defeitos|falha|falhas)\b/;
  var open = tasks.filter(function (task) {
    return task.status !== 'PRODUÇÃO' && bugPattern.test(searchNormalize_(task.tarefa + ' ' + task.descricao + ' ' + task.observacoes));
  });
  var captured = inbox.filter(function (item) {
    return item.suggestedType === 'BUG' && ['ARCHIVED', 'CONVERTED'].indexOf(item.status) === -1;
  });
  var lines = open.slice(0, 10).map(function (task) { return task.id + ' — ' + task.tarefa + ' (' + task.status + ')'; });
  if (captured.length) lines.push(captured.length + ' bug(s) também aguardam triagem na Inbox.');
  return {
    answer: open.length || captured.length
      ? open.length + ' bug(s) aberto(s) identificados por texto/tipo.\n' + lines.join('\n')
      : 'Nenhum bug aberto foi identificado por texto ou classificação da Inbox.',
    metrics: { openBugs: open.length, inboxBugs: captured.length },
    evidence: open.map(function (task) { return searchTaskEvidence_(task, 0, task.descricao); }).concat(captured.map(function (item) {
      return { kind: 'INBOX', id: item.id, taskId: '', title: item.suggestedTitle || 'Bug na Inbox', snippet: searchSnippet_(item.rawText), status: item.status, assignee: '', date: item.capturedAt, score: 0, source: SHEETS.INBOX };
    })),
    limitations: 'Ainda não existe um campo de tipo na tarefa; bugs em tarefas são inferidos pelas palavras bug, erro, defeito ou falha. A Inbox usa suggested_type=BUG.'
  };
}

function searchAnswerResponsibility_(project, tasks, question, options) {
  var snapshot = { project: project, tasks: tasks, inbox: [], comments: [], activity: [] };
  var ranked = searchRankSnapshot_(snapshot, question, { kinds: ['TASK'] });
  var matches = ranked.slice(0, searchLimit_(options.limit));
  if (!matches.length) {
    return { answer: 'Não encontrei tarefa ou módulo correspondente para identificar o responsável.', metrics: { matches: 0 }, evidence: [] };
  }
  return {
    answer: matches.slice(0, 10).map(function (item) {
      return item.id + ' — ' + item.title + ': ' + (item.assignee || 'não atribuído');
    }).join('\n'),
    metrics: { matches: matches.length, assigned: matches.filter(function (item) { return !!item.assignee; }).length },
    evidence: matches
  };
}

function searchAnswerNextSteps_(tasks, today) {
  var open = searchPrioritizedTasks_(tasks.filter(function (task) { return task.status !== 'PRODUÇÃO'; }), today);
  if (!open.length) return { answer: 'Não há tarefas abertas; o projeto está sem trabalho pendente no Kanban.', metrics: { open: 0 }, evidence: [] };
  return {
    answer: 'Próximos passos sugeridos por bloqueio, atraso e prioridade:\n' + open.slice(0, 10).map(function (task) {
      return task.id + ' — ' + task.tarefa + ' — ' + searchTaskReason_(task, today);
    }).join('\n'),
    metrics: { open: open.length, shown: Math.min(open.length, 10) },
    evidence: open.map(function (task) { return searchTaskEvidence_(task, 0, searchTaskReason_(task, today)); }),
    limitations: 'A ordem é uma heurística transparente: bloqueios, atraso, prioridade e prazo. Ela não altera a prioridade cadastrada.'
  };
}

function searchAnswerLatestChange_(project, tasks, activities, question, options) {
  var taskSnapshot = { project: project, tasks: tasks, inbox: [], comments: [], activity: [] };
  var matches = searchRankSnapshot_(taskSnapshot, question, { kinds: ['TASK'] });
  var ids = {};
  matches.slice(0, searchLimit_(options.limit)).forEach(function (item) { ids[item.taskId] = true; });
  var candidates = activities.filter(function (event) {
    return !Object.keys(ids).length || ids[event.entityId];
  }).sort(function (a, b) { return String(b.occurredAt).localeCompare(String(a.occurredAt)); });
  if (!candidates.length) return { answer: 'Não encontrei alterações auditadas para essa consulta.', metrics: { changes: 0 }, evidence: [] };
  var event = candidates[0];
  var task = tasks.find(function (item) { return item.id === event.entityId; });
  return {
    answer: 'Última alteração encontrada: ' + searchActivityLabel_(event.eventType) +
      (event.entityId ? ' em ' + event.entityId : '') + ', em ' + (event.occurredAt || 'data indisponível') +
      (event.actor ? ', por ' + event.actor : '') + '.',
    metrics: { changes: candidates.length },
    evidence: [{
      kind: 'ACTIVITY', id: event.id, taskId: task ? task.id : '',
      title: searchActivityLabel_(event.eventType) + (event.entityId ? ' — ' + event.entityId : ''),
      snippet: task ? task.tarefa : event.actor, status: task ? task.status : '',
      assignee: task ? task.responsavel : '', date: event.occurredAt, score: 0, source: SHEETS.ACTIVITY
    }]
  };
}

function searchAnswerFallback_(ranked, limit) {
  var results = ranked.slice(0, limit);
  if (!results.length) return { answer: 'Não encontrei informações correspondentes neste projeto.', metrics: { matches: 0 }, evidence: [] };
  return {
    answer: results.length + ' resultado(s) mais relevante(s):\n' + results.slice(0, 10).map(function (item) {
      return item.kind + ' · ' + item.title + (item.status ? ' (' + item.status + ')' : '');
    }).join('\n'),
    metrics: { matches: ranked.length, shown: results.length }, evidence: results
  };
}

function searchPrioritizedTasks_(tasks, today) {
  return tasks.slice().sort(function (a, b) {
    if (!!a.blocker !== !!b.blocker) return a.blocker ? -1 : 1;
    var aOverdue = !!a.dueDate && a.dueDate < today;
    var bOverdue = !!b.dueDate && b.dueDate < today;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (Number(b.prioridade || 0) !== Number(a.prioridade || 0)) return Number(b.prioridade || 0) - Number(a.prioridade || 0);
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

function searchTaskReason_(task, today) {
  if (task.blocker) return 'desbloquear: ' + task.blocker.reason;
  if (task.dueDate && task.dueDate < today) return 'atrasada desde ' + searchPtDate_(task.dueDate);
  if (task.prioridade) return 'prioridade ' + task.prioridade + (task.dueDate ? ', prazo ' + searchPtDate_(task.dueDate) : '');
  return task.dueDate ? 'prazo ' + searchPtDate_(task.dueDate) : 'sem prioridade e sem prazo';
}

function searchTodayIso_(provided) {
  if (provided) return isoDateOrBlank_(provided, 'Data de referência');
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function searchWeekBounds_(today) {
  var parts = String(today).split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  var day = date.getUTCDay() || 7;
  var monday = new Date(date.getTime() - (day - 1) * 86400000);
  var sunday = new Date(monday.getTime() + 6 * 86400000);
  return { from: searchUtcDateIso_(monday), to: searchUtcDateIso_(sunday) };
}

function searchUtcDateIso_(date) {
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
}

function searchPtDate_(iso) {
  var parts = String(iso || '').split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : String(iso || '');
}

function searchActivityLabel_(eventType) {
  var labels = {
    'task.created': 'Tarefa criada', 'task.updated': 'Tarefa atualizada',
    'task.status_changed': 'Status alterado', 'task.commented': 'Comentário adicionado',
    'task.blocked': 'Bloqueio registrado', 'task.unblocked': 'Bloqueio resolvido',
    'uat.submitted': 'Enviada para UAT', 'uat.approved': 'UAT aprovado',
    'uat.rejected': 'UAT reprovado', 'task.deleted': 'Tarefa excluída',
    'task.restored': 'Tarefa restaurada', 'inbox.captured': 'Item capturado na Inbox',
    'inbox.classified': 'Item da Inbox classificado', 'inbox.archived': 'Item da Inbox arquivado',
    'task.created_from_inbox': 'Tarefa criada a partir da Inbox',
    'project.automation_settings_updated': 'Governança do fluxo atualizada'
  };
  return labels[eventType] || String(eventType || 'Atividade');
}
