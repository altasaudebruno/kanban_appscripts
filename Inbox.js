/**
 * Inbox universal — captura segura e revisão estruturada.
 *
 * O AppSheet pode usar INBOX_ITEMS e ATTACHMENTS como tabelas. A API Web/CLI
 * passa por autorização, lock, versão, idempotência e auditoria. Classificação
 * por IA é deliberadamente uma etapa separada: capturar nunca cria uma tarefa
 * nem executa uma ação crítica automaticamente.
 */

function getInboxData(requestedProjectId, requestedStatus) {
  var project = resolveProject_(requestedProjectId || DEFAULT_PROJECT_ID);
  authorizeProject_(project.id, false);
  var status = String(requestedStatus || '').trim().toUpperCase();
  if (status && status !== 'ALL' && INBOX_STATUSES.indexOf(status) === -1) {
    throw new Error('Status da Inbox inválido: ' + status);
  }

  var sheet = ensureInboxSheet_();
  var items = [];
  if (sheet.getLastRow() >= 2) {
    items = sheet.getRange(2, 1, sheet.getLastRow() - 1, INBOX_HEADERS.length)
      .getValues().filter(function (row) {
        if (!row[0] || String(row[1]) !== project.id || row[17]) return false;
        return !status || status === 'ALL' || String(row[5]) === status;
      }).map(inboxItemFromValues_);
  }
  items.sort(function (a, b) { return String(b.capturedAt).localeCompare(String(a.capturedAt)); });

  var attachmentsByInbox = inboxAttachmentsByItem_(project.id);
  items.forEach(function (item) { item.attachments = attachmentsByInbox[item.id] || []; });
  return {
    projectId: project.id,
    project: project,
    items: items,
    captureTypes: INBOX_CAPTURE_TYPES.slice(),
    itemTypes: INBOX_ITEM_TYPES.slice(),
    statuses: INBOX_STATUSES.slice()
  };
}

function captureInboxItem(payload, metadata) {
  payload = payload || {};
  var project = resolveProject_(payload.projectId || metadataProjectId_(metadata));
  authorizeProject_(project.id, true);
  if (project.id !== metadataProjectId_(metadata)) {
    throw new Error('PROJECT_MISMATCH|A captura deve usar o projeto do contexto da requisição.');
  }

  var captureType = String(payload.captureType || 'TEXT').trim().toUpperCase();
  if (INBOX_CAPTURE_TYPES.indexOf(captureType) === -1) {
    throw new Error('Tipo de captura inválido: ' + captureType);
  }
  var rawText = workflowText_(payload.rawText, 'Conteúdo da captura', false, 50000);
  var sourceUrl = workflowText_(payload.sourceUrl, 'Link de origem', false, 4000);
  var attachment = sanitizeInboxAttachment_(payload.attachment);
  if (!rawText && !sourceUrl && !attachment) {
    throw new Error('Informe um texto, link ou anexo para capturar na Inbox.');
  }

  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getInboxData(project.id);
    var now = new Date();
    var actor = currentActor_();
    var values = [
      Utilities.getUuid(), project.id, captureType, rawText, sourceUrl,
      'NEW', '', '', '', actor, now, '', '', '', '', '', 1, ''
    ];
    ensureInboxSheet_().appendRow(values);
    var item = inboxItemFromValues_(values);
    if (attachment) item.attachments = [appendInboxAttachment_(item.id, project.id, attachment, actor, now)];
    else item.attachments = [];
    recordActivity_('inbox.captured', item.id, null, item, metadata);
    return getInboxData(project.id);
  });
}

/**
 * Reconcilia capturas gravadas diretamente pelo AppSheet.
 *
 * Alterações feitas por conectores externos não disparam o simple trigger
 * onEdit. Este job valida a autoria/projeto/conteúdo e cria exatamente um
 * evento de auditoria por captura, sem classificar nem converter itens em
 * tarefas automaticamente.
 */
function reconcileAppSheetInboxCaptures(options) {
  options = options || {};
  var requestedLimit = Number(options.limit || 100);
  var limit = isFinite(requestedLimit) ? Math.max(1, Math.min(Math.floor(requestedLimit), 500)) : 100;

  return withLock_(function () {
    var sheet = ensureInboxSheet_();
    var summary = { inspected: 0, audited: 0, rejected: 0, skipped: 0, errors: [] };
    if (sheet.getLastRow() < 2) return summary;

    var attachmentIds = inboxAttachmentIds_();
    var memberSheet = ensureProjectMembersSheet_();
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, INBOX_HEADERS.length).getValues();

    for (var index = 0; index < values.length && summary.inspected < limit; index++) {
      var item = inboxItemFromValues_(values[index]);
      if (!item.id || item.deletedAt || item.status !== 'NEW') continue;
      summary.inspected++;

      var requestId = 'appsheet:inbox:' + item.id;
      var metadata = {
        source: 'appsheet', projectId: item.projectId,
        requestId: requestId, correlationId: requestId
      };
      if (processedActivity_(metadata)) {
        summary.skipped++;
        continue;
      }

      var project = findProjectRow_(item.projectId);
      var authorized = !!project && project.project.active &&
        appSheetInboxCaptureAuthorized_(memberSheet, item);
      var validationErrors = inboxCaptureValidationErrors_(
        item, !!attachmentIds[item.id], authorized, !!project && project.project.active);

      try {
        if (validationErrors.length) {
          var row = index + 2;
          var before = item;
          sheet.getRange(row, 6).setValue('ERROR');
          sheet.getRange(row, 16).setValue(safeJson_({
            source: 'appsheet_reconciliation', errors: validationErrors
          }));
          sheet.getRange(row, 17).setValue(item.version + 1);
          var rejected = readInboxItemAtRow_(sheet, row);
          recordActivity_('inbox.capture_rejected', item.id, before, rejected, metadata);
          summary.rejected++;
          summary.errors.push({ id: item.id, errors: validationErrors });
        } else {
          recordActivity_('inbox.captured_from_appsheet', item.id, null, item, metadata);
          summary.audited++;
        }
      } catch (error) {
        summary.errors.push({
          id: item.id,
          errors: [(error && error.message) ? error.message : String(error)]
        });
      }
    }
    SpreadsheetApp.flush();
    return summary;
  });
}

function inboxCaptureValidationErrors_(item, hasAttachment, authorized, projectActive) {
  var errors = [];
  if (!item.projectId || !projectActive) errors.push('Projeto inexistente ou inativo.');
  if (INBOX_CAPTURE_TYPES.indexOf(item.captureType) === -1) errors.push('Tipo de captura inválido.');
  if (!item.rawText && !item.sourceUrl && !hasAttachment) errors.push('Captura sem texto, link ou anexo.');
  if (!item.capturedBy) errors.push('Usuário de captura não identificado.');
  else if (!authorized) errors.push('Usuário sem permissão de escrita no projeto.');
  return errors;
}

function appSheetInboxCaptureAuthorized_(memberSheet, item) {
  var email = String(item.capturedBy || '').trim().toLowerCase();
  if (!email || !item.projectId) return false;
  return projectMemberRows_(memberSheet, item.projectId).some(function (entry) {
    return entry.member.active && entry.member.userEmail === email &&
      entry.member.role !== PROJECT_ROLES.VIEWER;
  });
}

function inboxAttachmentIds_() {
  var sheet = ensureAttachmentsSheet_();
  var result = {};
  if (sheet.getLastRow() < 2) return result;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, ATTACHMENT_HEADERS.length)
    .getValues().forEach(function (values) {
      if (values[0] && values[1]) result[String(values[1])] = true;
    });
  return result;
}

/** Registra a saída de um classificador humano ou de IA sem criar tarefa. */
function classifyInboxItem(id, expectedVersion, payload, metadata) {
  payload = payload || {};
  var targetStatus = String(payload.status || 'NEEDS_REVIEW').trim().toUpperCase();
  if (['NEEDS_REVIEW', 'READY'].indexOf(targetStatus) === -1) {
    throw new Error('A classificação deve resultar em NEEDS_REVIEW ou READY.');
  }
  var itemType = String(payload.itemType || '').trim().toUpperCase();
  if (itemType && INBOX_ITEM_TYPES.indexOf(itemType) === -1) {
    throw new Error('Tipo de item sugerido inválido: ' + itemType);
  }
  var title = workflowText_(payload.title, 'Título sugerido', false, 300);
  if (targetStatus === 'READY' && (!itemType || !title)) {
    throw new Error('Itens READY exigem tipo e título revisados.');
  }
  var dueDate = isoDateOrBlank_(payload.dueDate, 'Prazo sugerido');
  var confidence = inboxConfidence_(payload.confidence);
  var aiPayload = payload.aiPayload === undefined || payload.aiPayload === null
    ? '' : safeJson_(payload.aiPayload);
  if (aiPayload.length > 30000) throw new Error('Payload da classificação excede 30.000 caracteres.');

  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getInboxData(metadataProjectId_(metadata));
    var sheet = ensureInboxSheet_();
    var found = findInboxRow_(sheet, id);
    var before = found.item;
    authorizeProject_(before.projectId, true);
    assertInboxProject_(before, metadata);
    assertInboxActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);
    if (before.status === 'CONVERTED' || before.status === 'ARCHIVED') {
      throw new Error('O item ' + id + ' não pode mais ser classificado no status ' + before.status + '.');
    }

    var now = new Date();
    var actor = currentActor_();
    sheet.getRange(found.row, 6, 1, 4).setValues([[
      targetStatus, itemType, title, fromIso_(dueDate)
    ]]);
    sheet.getRange(found.row, 12, 1, 3).setValues([[actor, now, confidence]]);
    sheet.getRange(found.row, 16, 1, 2).setValues([[aiPayload, before.version + 1]]);
    var after = readInboxItemAtRow_(sheet, found.row);
    recordActivity_('inbox.classified', id, before, after, metadata);
    return getInboxData(before.projectId);
  });
}

function archiveInboxItem(id, expectedVersion, metadata) {
  return withLock_(function () {
    if (requestAlreadyProcessed_(metadata)) return getInboxData(metadataProjectId_(metadata));
    var sheet = ensureInboxSheet_();
    var found = findInboxRow_(sheet, id);
    var before = found.item;
    authorizeProject_(before.projectId, true);
    assertInboxProject_(before, metadata);
    assertInboxActive_(before);
    assertExpectedVersion_(id, expectedVersion, before.version);
    if (before.status === 'CONVERTED') throw new Error('Itens convertidos permanecem vinculados à tarefa e não podem ser arquivados.');
    sheet.getRange(found.row, 6).setValue('ARCHIVED');
    sheet.getRange(found.row, 17).setValue(before.version + 1);
    var after = readInboxItemAtRow_(sheet, found.row);
    recordActivity_('inbox.archived', id, before, after, metadata);
    return getInboxData(before.projectId);
  });
}

/** Converte somente itens READY e revisados em uma tarefa de backlog. */
function convertInboxItemToTask(id, expectedVersion, payload, metadata) {
  payload = payload || {};
  var projectId = metadataProjectId_(metadata);
  var project = resolveProject_(projectId);
  authorizeProject_(project.id, true);

  return withLock_(function () {
    var sheet = ensureInboxSheet_();
    var found = findInboxRow_(sheet, id);
    var before = found.item;
    authorizeProject_(before.projectId, true);
    assertInboxProject_(before, metadata);
    assertInboxActive_(before);

    var processed = processedActivity_(metadata);
    if (processed) {
      if (processed.eventType === 'task.created_from_inbox' &&
          processed.projectId === before.projectId &&
          before.status === 'CONVERTED' && before.convertedTaskId === processed.entityId) {
        return inboxConversionResult_(before.projectId, before.convertedTaskId);
      }
      throw new Error('REQUEST_ID_COLLISION|O request_id já foi usado em outra operação.');
    }
    assertExpectedVersion_(id, expectedVersion, before.version);
    if (before.status !== 'READY') {
      throw new Error('Somente itens READY podem ser convertidos em tarefa.');
    }
    if (INBOX_TASK_TYPES.indexOf(before.suggestedType) === -1) {
      throw new Error('O tipo ' + (before.suggestedType || 'não informado') +
        ' não é acionável. Use TASK, BUG, FEATURE ou BLOCKER.');
    }
    if (!before.suggestedTitle) throw new Error('Revise e informe um título antes da conversão.');
    if (before.convertedTaskId) throw new Error('O item já está vinculado à tarefa ' + before.convertedTaskId + '.');

    before.attachments = inboxAttachmentsByItem_(before.projectId)[before.id] || [];
    var sanitized = sanitizeTask_(inboxTaskPayload_(before, payload));
    if (['BACKLOG', 'NÃO-INICIADO'].indexOf(sanitized.status) === -1) {
      throw new Error('Tarefas criadas pela Inbox devem iniciar em BACKLOG ou NÃO-INICIADO.');
    }

    var inserted = null;
    var inboxWritten = false;
    try {
      inserted = insertTaskLocked_(sanitized, project, metadata, null, null);
      sheet.getRange(found.row, 6).setValue('CONVERTED');
      sheet.getRange(found.row, 15).setValue(inserted.task.id);
      sheet.getRange(found.row, 17).setValue(before.version + 1);
      inboxWritten = true;
      var converted = readInboxItemAtRow_(sheet, found.row);
      recordActivity_('task.created_from_inbox', inserted.task.id, before, {
        task: inserted.task,
        inboxItem: converted
      }, metadata);
    } catch (error) {
      if (inboxWritten) {
        sheet.getRange(found.row, 6).setValue(before.status);
        sheet.getRange(found.row, 15).setValue(before.convertedTaskId || '');
        sheet.getRange(found.row, 17).setValue(before.version);
      }
      if (inserted) rollbackInsertedTask_(inserted.row);
      throw error;
    }
    return inboxConversionResult_(before.projectId, inserted.task.id);
  });
}

function inboxTaskPayload_(item, payload) {
  var origin = [
    'Origem: Inbox ' + item.id + ' (' + item.captureType + ')',
    item.capturedBy ? 'Capturado por: ' + item.capturedBy : '',
    item.sourceUrl ? 'Link: ' + item.sourceUrl : ''
  ];
  (item.attachments || []).forEach(function (attachment) {
    origin.push('Anexo: ' + attachment.fileUrl);
  });
  var userNotes = workflowText_(payload.notes, 'Observações da conversão', false, 10000);
  if (userNotes) origin.push(userNotes);
  return {
    projectId: item.projectId,
    tarefa: item.suggestedTitle,
    descricao: workflowText_(payload.description || item.rawText, 'Descrição da tarefa', false, 50000),
    subtarefas: workflowText_(payload.acceptance, 'Critérios de aceite', false, 20000),
    prioridade: payload.priority,
    dificuldade: payload.difficulty,
    status: String(payload.status || 'BACKLOG').trim().toUpperCase(),
    responsavel: String(payload.assignee || '').trim(),
    dependencias: workflowText_(payload.dependencies, 'Dependências', false, 10000),
    observacoes: origin.filter(Boolean).join('\n'),
    dataCriacao: String(item.capturedAt || '').slice(0, 10),
    dataInicio: '', dataConclusao: '', dueDate: item.suggestedDueDate,
    pct: 0
  };
}

function rollbackInsertedTask_(row) {
  var sheet = mustBase_();
  sheet.getRange(row, 1, 1, 6).clearContent();
  sheet.getRange(row, 8, 1, TASK_COLUMN_COUNT - 7).clearContent();
}

function inboxConversionResult_(projectId, taskId) {
  var board = getBoardData(projectId);
  var task = board.tasks.find(function (item) { return item.id === taskId; }) || null;
  if (!task) throw new Error('A tarefa convertida não foi encontrada: ' + taskId);
  return {
    projectId: projectId,
    taskId: taskId,
    task: task,
    board: board,
    inbox: getInboxData(projectId, 'ALL')
  };
}

function ensureInboxSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.INBOX);
  if (!sheet) sheet = ss.insertSheet(SHEETS.INBOX);
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== INBOX_HEADERS[0]) buildInbox_(sheet);
  return sheet;
}

function ensureAttachmentsSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.ATTACHMENTS);
  if (!sheet) sheet = ss.insertSheet(SHEETS.ATTACHMENTS);
  if (sheet.getLastRow() === 0 || sheet.getRange(1, 1).getValue() !== ATTACHMENT_HEADERS[0]) buildAttachments_(sheet);
  return sheet;
}

function findInboxRow_(sheet, id) {
  if (sheet.getLastRow() < 2) throw new Error('Item da Inbox não encontrado: ' + id);
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return { row: i + 2, item: readInboxItemAtRow_(sheet, i + 2) };
    }
  }
  throw new Error('Item da Inbox não encontrado: ' + id);
}

function readInboxItemAtRow_(sheet, row) {
  return inboxItemFromValues_(sheet.getRange(row, 1, 1, INBOX_HEADERS.length).getValues()[0]);
}

function inboxItemFromValues_(values) {
  return {
    id: String(values[0] || ''), projectId: String(values[1] || ''),
    captureType: String(values[2] || ''), rawText: String(values[3] || ''),
    sourceUrl: String(values[4] || ''), status: String(values[5] || ''),
    suggestedType: String(values[6] || ''), suggestedTitle: String(values[7] || ''),
    suggestedDueDate: toIso_(values[8]), capturedBy: String(values[9] || ''),
    capturedAt: toIsoDateTime_(values[10]), classifiedBy: String(values[11] || ''),
    classifiedAt: toIsoDateTime_(values[12]),
    confidence: values[13] === '' || values[13] === null ? '' : Number(values[13]),
    convertedTaskId: String(values[14] || ''), aiPayloadJson: String(values[15] || ''),
    version: normalizeVersion_(values[16]), deletedAt: toIsoDateTime_(values[17])
  };
}

function sanitizeInboxAttachment_(attachment) {
  if (!attachment) return null;
  var fileUrl = workflowText_(attachment.fileUrl, 'Arquivo do anexo', true, 4000);
  var size = attachment.sizeBytes === '' || attachment.sizeBytes === null || attachment.sizeBytes === undefined
    ? '' : Number(attachment.sizeBytes);
  if (size !== '' && (!isFinite(size) || size < 0)) throw new Error('Tamanho do anexo inválido.');
  return {
    fileUrl: fileUrl,
    fileName: workflowText_(attachment.fileName, 'Nome do anexo', false, 500),
    mimeType: workflowText_(attachment.mimeType, 'Tipo do anexo', false, 200),
    sizeBytes: size
  };
}

function appendInboxAttachment_(inboxId, projectId, attachment, actor, now) {
  var values = [
    Utilities.getUuid(), inboxId, projectId, attachment.fileUrl,
    attachment.fileName, attachment.mimeType, attachment.sizeBytes, now, actor
  ];
  ensureAttachmentsSheet_().appendRow(values);
  return inboxAttachmentFromValues_(values);
}

function inboxAttachmentsByItem_(projectId) {
  var sheet = ensureAttachmentsSheet_();
  var result = {};
  if (sheet.getLastRow() < 2) return result;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, ATTACHMENT_HEADERS.length)
    .getValues().forEach(function (values) {
      if (!values[0] || String(values[2]) !== projectId) return;
      var attachment = inboxAttachmentFromValues_(values);
      if (!result[attachment.inboxId]) result[attachment.inboxId] = [];
      result[attachment.inboxId].push(attachment);
    });
  return result;
}

function inboxAttachmentFromValues_(values) {
  return {
    id: String(values[0] || ''), inboxId: String(values[1] || ''),
    projectId: String(values[2] || ''), fileUrl: String(values[3] || ''),
    fileName: String(values[4] || ''), mimeType: String(values[5] || ''),
    sizeBytes: values[6] === '' || values[6] === null ? '' : Number(values[6]),
    createdAt: toIsoDateTime_(values[7]), createdBy: String(values[8] || '')
  };
}

function inboxConfidence_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var confidence = Number(value);
  if (!isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error('Confiança deve estar entre 0 e 1.');
  }
  return confidence;
}

function assertInboxProject_(item, metadata) {
  if (item.projectId !== metadataProjectId_(metadata)) {
    throw new Error('PROJECT_MISMATCH|O item da Inbox pertence ao projeto ' + item.projectId + '.');
  }
}

function assertInboxActive_(item) {
  if (item.deletedAt) throw new Error('O item ' + item.id + ' foi excluído.');
}
