/**
 * Governança de fluxo e automações assistidas.
 *
 * A fase inicial é deliberadamente advisory: detecta condições e sugere ações,
 * mas nunca move tarefas, envia notificações ou altera prioridades sozinha.
 */

var AUTOMATION_DEFAULTS = {
  version: 1,
  wipLimits: { DEV: 0, DEVMERGE: 0, UAT: 0 },
  staleAfterDays: 7,
  blockerSlaHours: 48,
  uatSlaHours: 72,
  policy: 'ADVISORY'
};

function getProjectAutomationHealth(requestedProjectId, options) {
  options = options || {};
  var project = resolveProject_(requestedProjectId || DEFAULT_PROJECT_ID);
  authorizeProject_(project.id, false);
  var board = getBoardData(project.id);
  if (board.projectId !== project.id) throw new Error('Projeto indisponível: ' + project.id);
  return automationBuildHealth_(project, board.tasks, searchProjectActivities_(project.id), options);
}

function saveProjectAutomationSettings(requestedProjectId, payload, metadata) {
  payload = payload || {};
  var project = resolveProject_(requestedProjectId || DEFAULT_PROJECT_ID);
  authorizeProject_(project.id, true);
  if (project.id !== metadataProjectId_(metadata)) {
    throw new Error('PROJECT_MISMATCH|As configurações devem usar o projeto do contexto da requisição.');
  }

  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getProjectAutomationHealth(project.id);
    automationAuthorizeManager_(project.id);
    var found = findProjectRow_(project.id);
    if (!found) throw new Error('Projeto não encontrado: ' + project.id);
    var current = automationSettingsForProject_(found.project);
    assertExpectedVersion_('automation:' + project.id, payload.expectedVersion, current.version);
    var next = automationSanitizeSettings_(payload, current.version + 1);
    var allSettings = JSON.parse(JSON.stringify(found.project.settings || {}));
    allSettings.flowAutomation = next;
    var json = JSON.stringify(allSettings);
    if (json.length > 30000) throw new Error('Configurações do projeto excedem 30.000 caracteres.');

    var now = new Date();
    var sheet = ensureProjectsSheet_();
    sheet.getRange(found.row, 6).setValue(json);
    sheet.getRange(found.row, 9).setValue(now);
    var updated = projectFromValues_(sheet.getRange(found.row, 1, 1, PROJECT_HEADERS.length).getValues()[0]);
    recordActivity_('project.automation_settings_updated', project.id,
      { projectId: project.id, settings: current },
      { projectId: project.id, settings: next }, metadata);
    return automationBuildHealth_(updated, getBoardData(project.id).tasks,
      searchProjectActivities_(project.id), {});
  });
}

function automationSettingsForProject_(project) {
  var source = project && project.settings && project.settings.flowAutomation || {};
  var wip = source.wipLimits || {};
  return {
    version: normalizeVersion_(source.version),
    wipLimits: {
      DEV: automationStoredInteger_(wip.DEV, AUTOMATION_DEFAULTS.wipLimits.DEV, 0, 999),
      DEVMERGE: automationStoredInteger_(wip.DEVMERGE, AUTOMATION_DEFAULTS.wipLimits.DEVMERGE, 0, 999),
      UAT: automationStoredInteger_(wip.UAT, AUTOMATION_DEFAULTS.wipLimits.UAT, 0, 999)
    },
    staleAfterDays: automationStoredInteger_(source.staleAfterDays, AUTOMATION_DEFAULTS.staleAfterDays, 1, 365),
    blockerSlaHours: automationStoredInteger_(source.blockerSlaHours, AUTOMATION_DEFAULTS.blockerSlaHours, 1, 8760),
    uatSlaHours: automationStoredInteger_(source.uatSlaHours, AUTOMATION_DEFAULTS.uatSlaHours, 1, 8760),
    policy: 'ADVISORY'
  };
}

function automationSanitizeSettings_(payload, version) {
  var wip = payload.wipLimits || {};
  return {
    version: version,
    wipLimits: {
      DEV: automationRequiredInteger_(wip.DEV, 'Limite de WIP em DEV', 0, 999),
      DEVMERGE: automationRequiredInteger_(wip.DEVMERGE, 'Limite de WIP em DEVMERGE', 0, 999),
      UAT: automationRequiredInteger_(wip.UAT, 'Limite de WIP em UAT', 0, 999)
    },
    staleAfterDays: automationRequiredInteger_(payload.staleAfterDays, 'Dias para tarefa parada', 1, 365),
    blockerSlaHours: automationRequiredInteger_(payload.blockerSlaHours, 'SLA de bloqueio', 1, 8760),
    uatSlaHours: automationRequiredInteger_(payload.uatSlaHours, 'SLA de UAT', 1, 8760),
    policy: 'ADVISORY'
  };
}

function automationRequiredInteger_(value, label, minimum, maximum) {
  var number = Number(value);
  if (!isFinite(number) || Math.floor(number) !== number || number < minimum || number > maximum) {
    throw new Error(label + ' deve ser um inteiro entre ' + minimum + ' e ' + maximum + '.');
  }
  return number;
}

function automationStoredInteger_(value, fallback, minimum, maximum) {
  var number = Number(value);
  return isFinite(number) && Math.floor(number) === number && number >= minimum && number <= maximum
    ? number : fallback;
}

function automationAuthorizeManager_(projectId) {
  var sheet = ensureProjectMembersSheet_();
  var rows = projectMemberRows_(sheet, projectId).filter(function (entry) { return entry.member.active; });
  if (!rows.length) return true; // modo legado até o projeto adotar membros explícitos
  var email = currentUserEmail_();
  var member = rows.find(function (entry) { return entry.member.userEmail === email; });
  if (!member || [PROJECT_ROLES.MANAGER, PROJECT_ROLES.OWNER].indexOf(member.member.role) === -1) {
    throw new Error('FORBIDDEN|Somente MANAGER ou OWNER pode alterar a governança do fluxo.');
  }
  return true;
}

function automationBuildHealth_(project, tasks, activities, options) {
  options = options || {};
  var settings = automationSettingsForProject_(project);
  var now = automationNow_(options.now);
  var today = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var lastActivity = automationLastActivityByTask_(activities);
  var signals = [];
  var counts = automationWipCounts_(tasks);

  ['DEV', 'DEVMERGE', 'UAT'].forEach(function (status) {
    var limit = settings.wipLimits[status];
    if (!limit || counts[status] <= limit) return;
    var statusTasks = tasks.filter(function (task) { return task.status === status; });
    signals.push(automationSignal_('WIP_LIMIT', 'HIGH', 'WIP acima do limite em ' + status,
      counts[status] + ' tarefa(s) para um limite de ' + limit + '.', statusTasks,
      counts[status], limit));
  });

  tasks.forEach(function (task) {
    if (task.blocker) {
      var blockerHours = automationAgeHours_(task.blocker.blockedAt, now);
      if (blockerHours >= settings.blockerSlaHours) {
        signals.push(automationSignal_('BLOCKER_SLA', 'HIGH', 'Bloqueio acima do SLA: ' + task.id,
          task.blocker.reason + ' · ' + blockerHours + ' h bloqueada' +
          (task.blocker.unblockOwner ? ' · desbloqueio: ' + task.blocker.unblockOwner : ''),
          [task], blockerHours, settings.blockerSlaHours));
      }
    }

    if (task.status === 'UAT' && task.uat && task.uat.status === 'PENDING') {
      var uatHours = automationAgeHours_(task.uat.submittedAt, now);
      if (uatHours >= settings.uatSlaHours) {
        signals.push(automationSignal_('UAT_SLA', 'HIGH', 'UAT acima do SLA: ' + task.id,
          uatHours + ' h aguardando decisão.', [task], uatHours, settings.uatSlaHours));
      }
    }

    if (['DEV', 'DEVMERGE'].indexOf(task.status) !== -1 && !task.blocker) {
      var activityAt = lastActivity[task.id] || automationTaskFallbackDate_(task);
      var staleHours = automationAgeHours_(activityAt, now);
      if (staleHours >= settings.staleAfterDays * 24) {
        signals.push(automationSignal_('STALE_TASK', 'MEDIUM', 'Tarefa sem atividade: ' + task.id,
          Math.floor(staleHours / 24) + ' dia(s) sem evento auditado.', [task],
          Math.floor(staleHours / 24), settings.staleAfterDays));
      }
    }
  });

  var overdue = tasks.filter(function (task) {
    return task.status !== 'PRODUÇÃO' && !!task.dueDate && task.dueDate < today;
  });
  if (overdue.length) {
    signals.push(automationSignal_('OVERDUE', 'MEDIUM', 'Tarefas atrasadas',
      overdue.length + ' tarefa(s) ultrapassaram o prazo.', overdue, overdue.length, 0));
  }

  signals.sort(function (a, b) {
    var severity = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    if (severity[a.severity] !== severity[b.severity]) return severity[a.severity] - severity[b.severity];
    return String(a.id).localeCompare(String(b.id));
  });
  var summary = automationHealthSummary_(signals, tasks, counts);
  return {
    projectId: project.id,
    project: project,
    settings: settings,
    summary: summary,
    signals: signals.slice(0, searchLimit_(options.limit || 50)),
    recommendations: automationRecommendations_(signals),
    policy: 'ADVISORY',
    calculatedAt: toIsoDateTime_(now),
    limitations: 'As regras apenas alertam. Nenhuma tarefa é movida, bloqueada, priorizada ou notificada automaticamente.'
  };
}

function automationSignal_(kind, severity, title, detail, tasks, current, threshold) {
  return {
    id: kind + ':' + tasks.map(function (task) { return task.id; }).join(','),
    kind: kind,
    severity: severity,
    title: title,
    detail: detail,
    current: current,
    threshold: threshold,
    taskIds: tasks.map(function (task) { return task.id; }),
    evidence: tasks.slice(0, 20).map(automationTaskEvidence_)
  };
}

function automationTaskEvidence_(task) {
  return {
    kind: 'TASK', id: task.id, taskId: task.id, title: task.tarefa,
    snippet: task.blocker ? task.blocker.reason : '', status: task.status,
    assignee: task.responsavel, date: task.dueDate || task.dataInicio || task.dataCriacao,
    source: SHEETS.BASE
  };
}

function automationWipCounts_(tasks) {
  var counts = {};
  statusNames_().forEach(function (status) { counts[status] = 0; });
  tasks.forEach(function (task) { counts[task.status] = (counts[task.status] || 0) + 1; });
  return counts;
}

function projectFlowWarnings_(tasks, project) {
  var settings = automationSettingsForProject_(project);
  var counts = automationWipCounts_(tasks);
  var warnings = [];
  ['DEV', 'DEVMERGE', 'UAT'].forEach(function (status) {
    var limit = settings.wipLimits[status];
    if (limit && counts[status] > limit) {
      warnings.push('WIP de ' + status + ' está em ' + counts[status] + '; limite configurado: ' + limit + '.');
    }
  });
  return warnings;
}

function automationLastActivityByTask_(activities) {
  var result = {};
  activities.forEach(function (event) {
    if (!event.entityId || !event.occurredAt) return;
    if (!result[event.entityId] || event.occurredAt > result[event.entityId]) result[event.entityId] = event.occurredAt;
  });
  return result;
}

function automationTaskFallbackDate_(task) {
  var date = task.dataInicio || task.dataCriacao || '';
  return date ? date + 'T00:00:00Z' : '';
}

function automationAgeHours_(iso, now) {
  if (!iso) return 0;
  var start = new Date(iso);
  if (isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 3600000));
}

function automationNow_(value) {
  if (!value) return new Date();
  var date = new Date(String(value));
  if (isNaN(date.getTime())) throw new Error('Data de referência da automação é inválida.');
  return date;
}

function automationHealthSummary_(signals, tasks, counts) {
  var high = signals.filter(function (signal) { return signal.severity === 'HIGH'; }).length;
  var medium = signals.filter(function (signal) { return signal.severity === 'MEDIUM'; }).length;
  return {
    state: high ? 'CRITICAL' : (medium ? 'ATTENTION' : 'HEALTHY'),
    highSignals: high,
    mediumSignals: medium,
    totalSignals: signals.length,
    activeTasks: tasks.filter(function (task) { return task.status !== 'PRODUÇÃO'; }).length,
    blockedTasks: tasks.filter(function (task) { return !!task.blocker; }).length,
    wip: counts
  };
}

function automationRecommendations_(signals) {
  var kinds = {};
  signals.forEach(function (signal) { kinds[signal.kind] = true; });
  var recommendations = [];
  if (kinds.BLOCKER_SLA) recommendations.push('Revisar bloqueios acima do SLA e confirmar o responsável pelo desbloqueio.');
  if (kinds.UAT_SLA) recommendations.push('Cobrar decisão de UAT ou renegociar tester e prazo.');
  if (kinds.WIP_LIMIT) recommendations.push('Concluir ou desbloquear trabalho em andamento antes de iniciar novas tarefas.');
  if (kinds.STALE_TASK) recommendations.push('Atualizar tarefas sem atividade com progresso, próximo passo ou bloqueio explícito.');
  if (kinds.OVERDUE) recommendations.push('Revalidar prazo e prioridade das tarefas atrasadas.');
  if (!recommendations.length) recommendations.push('Nenhuma intervenção sugerida pelas regras atuais.');
  return recommendations;
}
