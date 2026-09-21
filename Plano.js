/**
 * Plano.js — camada de planejamento por blocos.
 *
 * Responde a três perguntas que o quadro puro não respondia:
 *   1. o que o Bruno faz e testa HOJE          → resumoDiaPlano_
 *   2. onde o Bruno está, para o gestor        → getManagerView
 *   3. como carregar um planejamento inteiro   → seedPlano
 *
 * Nada aqui muta tarefas por conta própria: a visão do gestor é estritamente
 * somente-leitura e o seed só insere o que ainda não existe.
 */

/** Peso de progresso por etapa do fluxo, usado quando a tarefa não declara %. */
var STATUS_PROGRESS = {
  'BACKLOG': 0,
  'NÃO-INICIADO': 0,
  'DEV': 0.35,
  'DEVMERGE': 0.6,
  'UAT': 0.8,
  'PRODUÇÃO': 1
};

var DONE_STATUS = 'PRODUÇÃO';

// ------------------------------------------------------------------ agenda ---

/**
 * Agenda de execução do MVP Consultoria Docfinance.
 * Cada entrada é um checkpoint: no fim do dia, os blocos listados precisam
 * estar no estado descrito em `meta`.
 */
var PLAN_AGENDAS = {
  DF: {
    projectName: 'Consultoria Docfinance — MVP',
    description: 'MVP de consultoria financeira. Piloto com cliente real em 01/10/2026.',
    goLive: '2026-10-01',
    checkpoints: [
      { date: '2026-09-21', blocks: ['B00', 'B01'], meta: 'Decisões fechadas e fundação do repositório de pé (scaffold, Docker, CI).' },
      { date: '2026-09-22', blocks: ['B00', 'B01'], meta: 'Fundação concluída: design system aplicado e pipeline verde.' },
      { date: '2026-09-23', blocks: ['B02', 'B03'], meta: 'Identidade/convites funcionando; onboarding iniciado.' },
      { date: '2026-09-24', blocks: ['B02', 'B03'], meta: 'Autorização e carteira de clientes concluídas.' },
      { date: '2026-09-25', blocks: ['B04'], meta: 'Lançamentos gravando e listando com filtros.' },
      { date: '2026-09-26', blocks: ['B04'], meta: 'Visão geral financeira fechando os números do mês.' },
      { date: '2026-09-27', blocks: ['B05', 'B06'], meta: 'Passivos e patrimônio no ar; reuniões iniciadas.' },
      { date: '2026-09-28', blocks: ['B05', 'B06'], meta: 'Metas e resumos de reunião concluídos.' },
      { date: '2026-09-29', blocks: ['B07'], meta: 'Validação completa ponta a ponta: nenhum defeito bloqueante aberto.' },
      { date: '2026-09-30', blocks: ['B07'], meta: 'Aceite e release candidata publicada.' },
      { date: '2026-10-01', blocks: ['B07'], meta: 'Piloto com cliente real em produção.' }
    ]
  }
};

function planAgenda_(projectId) {
  return PLAN_AGENDAS[String(projectId || '').toUpperCase()] || null;
}

/** Projeto assumido quando o chamador não informa nenhum. */
function planDefaultProjectId_() {
  var stored = '';
  try {
    stored = PropertiesService.getScriptProperties().getProperty('PLAN_DEFAULT_PROJECT') || '';
  } catch (ignored) {}
  return String(stored || 'DF').trim().toUpperCase();
}

/**
 * Resolve o projeto das telas de planejamento.
 *
 * O padrão do domínio (`resolveAccessibleProject_`) cai em "AG" quando nada é
 * informado e engole o erro devolvendo outro projeto. Para a visão do gestor e
 * para o relatório isso é pior do que falhar: eles mostrariam o quadro errado
 * sem dizer nada. Aqui o projeto pedido explicitamente nunca é substituído, e
 * a substituição do padrão volta sinalizada em `fallback`.
 */
function planResolveProject_(requested) {
  var explicito = String(requested || '').trim();
  var alvo = normalizeProjectId_(explicito || planDefaultProjectId_());
  var encontrado = findProjectRow_(alvo);

  if (encontrado && encontrado.project.active) {
    authorizeProject_(encontrado.project.id, false);
    return { project: encontrado.project, fallback: false, wanted: alvo };
  }

  if (explicito) {
    throw new Error('Projeto não encontrado ou inativo: ' + alvo);
  }

  var acessiveis = listAccessibleProjects_();
  if (!acessiveis.length) {
    throw new Error('O projeto ' + alvo + ' ainda não existe. Use o menu ' +
      'Kanban → "Carregar planejamento Docfinance" para criá-lo.');
  }
  authorizeProject_(acessiveis[0].id, false);
  return { project: acessiveis[0], fallback: true, wanted: alvo };
}

function planFallbackAviso_(resolvido) {
  if (!resolvido.fallback) return '';
  return 'O projeto ' + resolvido.wanted + ' ainda não existe. Estes números são ' +
    'do projeto ' + resolvido.project.id + '. Para carregar o planejamento, use ' +
    'o menu Kanban → "Carregar planejamento Docfinance".';
}

// -------------------------------------------------------- visão do gestor ----

/**
 * Retrato somente-leitura do andamento. Destinado ao gestor (Geovane): onde o
 * Bruno está hoje, o que cada bloco já entregou e quando foi a última mexida.
 */
function getManagerView(projectId, referenceDate) {
  var resolvido = planResolveProject_(projectId);
  var project = resolvido.project;

  var board = boardData_('active', project.id);
  var tasks = board.tasks;
  var agenda = planAgenda_(project.id);
  var today = planToday_(referenceDate);
  var lastActivityByTask = lastActivityByTask_(project.id);

  var blocks = planBlocks_(tasks, lastActivityByTask, agenda);
  var byId = {};
  blocks.forEach(function (block) { byId[block.id] = block; });

  var checkpoints = (agenda ? agenda.checkpoints : []).map(function (entry) {
    var blocksOfDay = entry.blocks.map(function (id) {
      return byId[id] || emptyBlock_(id);
    });
    var total = 0;
    var progress = 0;
    blocksOfDay.forEach(function (block) {
      total += block.total;
      progress += block.progressPoints;
    });
    return {
      date: entry.date,
      label: planDateLabel_(entry.date),
      blocks: entry.blocks,
      meta: entry.meta,
      total: total,
      pct: total ? Math.round((progress / total) * 100) : 0,
      state: total === 0 ? 'SEM TAREFAS' : checkpointState_(entry.date, today, progress / total)
    };
  });

  var inFlight = tasks.filter(function (task) {
    return ['DEV', 'DEVMERGE', 'UAT'].indexOf(task.status) !== -1;
  }).map(planTaskCard_);

  var blocked = tasks.filter(function (task) { return !!task.blocker; }).map(function (task) {
    return {
      id: task.id, title: task.tarefa, bloco: task.bloco,
      reason: task.blocker ? task.blocker.reason : '',
      since: task.blocker ? task.blocker.blockedAt : ''
    };
  });

  var lastUpdate = '';
  Object.keys(lastActivityByTask).forEach(function (taskId) {
    var at = lastActivityByTask[taskId].occurredAt;
    if (at > lastUpdate) lastUpdate = at;
  });

  return {
    readOnly: true,
    generatedAt: toIsoDateTime_(new Date()),
    today: today,
    project: { id: project.id, name: project.name, description: project.description },
    goLive: agenda ? agenda.goLive : '',
    totals: planTotals_(tasks),
    blocks: blocks,
    checkpoints: checkpoints,
    todayCheckpoint: checkpoints.filter(function (c) { return c.date === today; })[0] || null,
    inFlight: inFlight,
    blocked: blocked,
    // A paleta viaja junto para a visão do gestor e o relatório usarem a mesma
    // cor de status do quadro, sem redefinir os tons em cada tela.
    statuses: board.statuses,
    avisoProjeto: planFallbackAviso_(resolvido),
    lastUpdate: lastUpdate,
    warnings: board.warnings || []
  };
}

function planTotals_(tasks) {
  var total = tasks.length;
  var done = 0;
  var progress = 0;
  var byStatus = {};
  tasks.forEach(function (task) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    if (task.status === DONE_STATUS) done++;
    progress += taskProgress_(task);
  });
  return {
    total: total,
    done: done,
    pct: total ? Math.round((progress / total) * 100) : 0,
    byStatus: byStatus
  };
}

function planBlocks_(tasks, lastActivityByTask, agenda) {
  // Sem protótipo: o nome do bloco é texto livre, e um valor como
  // "CONSTRUCTOR" acharia um membro herdado em vez de criar o bucket.
  var index = Object.create(null);
  var order = [];

  function bucket(id) {
    if (!index[id]) {
      index[id] = emptyBlock_(id);
      order.push(id);
    }
    return index[id];
  }

  // Blocos declarados na agenda aparecem mesmo sem tarefa, para o gestor
  // enxergar o que ainda nem foi planejado em vez de um buraco silencioso.
  if (agenda) {
    agenda.checkpoints.forEach(function (entry) {
      entry.blocks.forEach(function (id) { bucket(id); });
    });
  }

  tasks.forEach(function (task) {
    var block = bucket(task.bloco || 'SEM BLOCO');
    block.total++;
    block.progressPoints += taskProgress_(task);
    if (task.status === DONE_STATUS) block.done++;
    if (task.blocker) block.blocked++;
    block.byStatus[task.status] = (block.byStatus[task.status] || 0) + 1;
    if (['DEV', 'DEVMERGE', 'UAT'].indexOf(task.status) !== -1) {
      block.inFlight.push(planTaskCard_(task));
    }
    if (task.dueDate && (!block.dueDate || task.dueDate < block.dueDate)) block.dueDate = task.dueDate;
    var activity = lastActivityByTask[task.id];
    if (activity && activity.occurredAt > block.lastUpdate) {
      block.lastUpdate = activity.occurredAt;
      block.lastEvent = activity.eventType;
      block.lastActor = activity.actor;
    }
  });

  order.sort();
  return order.map(function (id) {
    var block = index[id];
    block.pct = block.total ? Math.round((block.progressPoints / block.total) * 100) : 0;
    block.state = block.total === 0 ? 'SEM TAREFAS'
      : block.done === block.total ? 'CONCLUÍDO'
      : block.inFlight.length ? 'EM ANDAMENTO'
      : block.done ? 'PARCIAL'
      : 'NÃO INICIADO';
    return block;
  });
}

function emptyBlock_(id) {
  return {
    id: id, total: 0, done: 0, blocked: 0, pct: 0, progressPoints: 0,
    byStatus: {}, inFlight: [], dueDate: '', lastUpdate: '', lastEvent: '', lastActor: ''
  };
}

function planTaskCard_(task) {
  return {
    id: task.id, title: task.tarefa, status: task.status, bloco: task.bloco,
    assignee: task.responsavel, dueDate: task.dueDate, pct: task.pct,
    oQueTestar: task.oQueTestar, blocked: !!task.blocker, version: task.version
  };
}

function taskProgress_(task) {
  var byStatus = STATUS_PROGRESS[task.status];
  if (byStatus === undefined) byStatus = 0;
  if (task.status === DONE_STATUS) return 1;
  var declared = Number(task.pct);
  if (!isFinite(declared) || declared < 0) declared = 0;
  return Math.max(byStatus, Math.min(declared, 1));
}

function checkpointState_(date, today, ratio) {
  if (ratio >= 1) return 'CONCLUÍDO';
  if (date < today) return 'ATRASADO';
  if (date === today) return 'HOJE';
  return 'PREVISTO';
}

/** Último evento de auditoria por tarefa; varre no máximo as 3000 linhas finais. */
function lastActivityByTask_(projectId) {
  var sh = ensureActivitySheet_();
  var last = sh.getLastRow();
  var result = Object.create(null);
  if (last < 2) return result;
  var window = 3000;
  var startRow = Math.max(2, last - window + 1);
  var values = sh.getRange(startRow, 1, last - startRow + 1, ACTIVITY_HEADERS.length).getValues();
  values.forEach(function (row) {
    var entityId = String(row[5] || '');
    if (!entityId) return;
    if (String(row[6] || '') !== String(projectId)) return;
    var occurredAt = toIsoDateTime_(row[1]);
    var current = result[entityId];
    if (!current || occurredAt > current.occurredAt) {
      result[entityId] = {
        occurredAt: occurredAt,
        actor: String(row[2] || ''),
        eventType: String(row[4] || '')
      };
    }
  });
  return result;
}

// ---------------------------------------------------------- resumo do dia ----

/**
 * O que fazer e o que testar hoje. É a tela que o Bruno abre de manhã.
 */
function resumoDiaPlano_(projectId, referenceDate) {
  var resolvido = planResolveProject_(projectId);
  var project = resolvido.project;
  var board = boardData_('active', project.id);
  var today = planToday_(referenceDate);
  var agenda = planAgenda_(project.id);
  var checkpoint = null;
  var focusBlocks = [];
  if (agenda) {
    agenda.checkpoints.forEach(function (entry) {
      if (entry.date === today) {
        checkpoint = entry;
        focusBlocks = entry.blocks;
      }
    });
  }

  var tasks = board.tasks;
  var inFocus = tasks.filter(function (task) {
    return focusBlocks.length ? focusBlocks.indexOf(task.bloco) !== -1 : true;
  });

  function open(list) {
    return list.filter(function (task) { return task.status !== DONE_STATUS; });
  }

  var emAndamento = tasks.filter(function (task) {
    return ['DEV', 'DEVMERGE'].indexOf(task.status) !== -1;
  });
  var emUat = tasks.filter(function (task) { return task.status === 'UAT'; });
  var atrasadas = tasks.filter(function (task) {
    return task.dueDate && task.dueDate < today && task.status !== DONE_STATUS;
  });
  var paraHoje = tasks.filter(function (task) {
    return task.dueDate === today && task.status !== DONE_STATUS;
  });
  var bloqueadas = tasks.filter(function (task) { return !!task.blocker; });

  var testes = open(inFocus).filter(function (task) { return task.oQueTestar; })
    .map(function (task) {
      return { id: task.id, bloco: task.bloco, title: task.tarefa, status: task.status, teste: task.oQueTestar };
    });

  return {
    date: today,
    label: planDateLabel_(today),
    project: { id: project.id, name: project.name },
    checkpoint: checkpoint ? { blocks: checkpoint.blocks, meta: checkpoint.meta } : null,
    focusBlocks: focusBlocks,
    totals: planTotals_(tasks),
    foco: open(inFocus).map(planTaskCard_),
    emAndamento: emAndamento.map(planTaskCard_),
    emUat: emUat.map(planTaskCard_),
    paraHoje: paraHoje.map(planTaskCard_),
    atrasadas: atrasadas.map(planTaskCard_),
    bloqueadas: bloqueadas.map(planTaskCard_),
    oQueTestarHoje: testes,
    avisoProjeto: planFallbackAviso_(resolvido),
    warnings: board.warnings || []
  };
}

// ------------------------------------------------------------------- seed ----

/**
 * Carrega um planejamento inteiro no quadro.
 *
 * Idempotente por título: uma tarefa cujo título já exista no projeto é
 * ignorada, então rodar duas vezes não duplica o backlog.
 */
function seedPlano(projectId, definition, metadata) {
  projectId = normalizeProjectId_(projectId || 'DF');
  definition = definition || PLAN_SEEDS[projectId];
  if (!definition) throw new Error('Não há planejamento definido para o projeto ' + projectId + '.');

  var agenda = planAgenda_(projectId);
  var meta = normalizeMetadata_(metadata || { source: 'plan:seed', projectId: projectId });
  meta.projectId = projectId;
  meta.requestId = ''; // o seed é idempotente por título, não por request_id

  var created = [];
  var skipped = [];
  var pending = [];
  // O Apps Script derruba a execução em 6 minutos. Inserir dezenas de tarefas
  // com auditoria pode chegar perto disso, então paramos antes e devolvemos o
  // que faltou: o seed é idempotente, basta rodar de novo para completar.
  var deadline = Date.now() + 4 * 60 * 1000;

  var projectCreated = false;
  if (!findProjectRow_(projectId)) {
    createProject({
      projectId: projectId,
      name: (agenda && agenda.projectName) || definition.projectName || projectId,
      description: (agenda && agenda.description) || definition.description || ''
    }, meta);
    projectCreated = true;
  }

  var project = resolveProject_(projectId);
  authorizeProject_(project.id, true);

  withLock_(function () {
    var sh = mustBase_();
    // Chaveado por título, que é texto livre — ver a nota em planBlocks_.
    var existing = Object.create(null);
    var last = sh.getLastRow();
    if (last >= 2) {
      sh.getRange(2, 1, last - 1, TASK_COLUMN_COUNT).getValues().forEach(function (row) {
        if (!row[TASK_COLUMNS.ID - 1]) return;
        if (String(row[TASK_COLUMNS.PROJECT_ID - 1] || DEFAULT_PROJECT_ID) !== project.id) return;
        existing[planTitleKey_(row[TASK_COLUMNS.TITLE - 1])] = String(row[TASK_COLUMNS.ID - 1]);
      });
    }

    definition.tasks.forEach(function (item) {
      var key = planTitleKey_(item.tarefa);
      if (existing[key]) {
        skipped.push({ id: existing[key], tarefa: item.tarefa });
        return;
      }
      if (Date.now() > deadline) {
        pending.push(item.tarefa);
        return;
      }
      var sanitized = sanitizeTask_({
        tarefa: item.tarefa,
        descricao: item.descricao || '',
        subtarefas: item.subtarefas || '',
        prioridade: item.prioridade === undefined ? '' : item.prioridade,
        dificuldade: item.dificuldade === undefined ? '' : item.dificuldade,
        status: item.status || 'NÃO-INICIADO',
        responsavel: item.responsavel || '',
        dependencias: item.dependencias || '',
        observacoes: item.observacoes || '',
        dueDate: item.dueDate || '',
        bloco: item.bloco || '',
        oQueTestar: item.oQueTestar || '',
        projectId: project.id
      });
      var inserted = insertTaskLocked_(sanitized, project, meta, 'plan.task_seeded', null);
      existing[key] = inserted.task.id;
      created.push({ id: inserted.task.id, bloco: sanitized.bloco, tarefa: sanitized.tarefa });
    });
    return true;
  });

  return {
    projectId: project.id,
    projectCreated: projectCreated,
    created: created,
    createdCount: created.length,
    skipped: skipped,
    skippedCount: skipped.length,
    pendingCount: pending.length,
    complete: pending.length === 0,
    aviso: pending.length
      ? pending.length + ' tarefa(s) não couberam no tempo de execução. ' +
        'Rode o carregamento de novo para concluir — nada será duplicado.'
      : ''
  };
}

function planTitleKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// --------------------------------------------------------------- utilidades --

function planToday_(referenceDate) {
  if (referenceDate) {
    var text = String(referenceDate).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  }
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function planDateLabel_(isoDate) {
  var match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(isoDate || '');
  var dias = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return match[3] + '/' + match[2] + ' (' + dias[date.getDay()] + ')';
}
