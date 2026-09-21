/**
 * Mantém versão e auditoria quando a BASE é editada diretamente pela planilha.
 * Alterações feitas por Apps Script não disparam o simple trigger onEdit.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEETS.BASE || range.getLastRow() < 2) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    notifySheetEdit_('A alteração foi gravada, mas aguarda reconciliação. Atualize o Kanban antes de editar novamente.');
    return;
  }
  try {
    if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) {
      reconcileBulkSheetEdit_(sheet, range);
      return;
    }
    reconcileSingleSheetEdit_(sheet, range, e.oldValue);
  } catch (err) {
    notifySheetEdit_((err && err.message) ? err.message : String(err));
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function reconcileSingleSheetEdit_(sheet, range, oldValue) {
  var row = range.getRow();
  var column = range.getColumn();

  // ID, fórmula e metadados técnicos só podem ser alterados pela aplicação.
  if (column === TASK_COLUMNS.ID || column === TASK_COLUMNS.SCORE ||
      (column >= TASK_COLUMNS.VERSION && column <= TASK_COLUMNS.DELETED_BY) ||
      column === TASK_COLUMNS.PROJECT_ID) {
    restoreTechnicalCell_(sheet, row, column, oldValue);
    notifySheetEdit_('Essa coluna é técnica e foi restaurada. Use o Web Kanban para a operação correspondente.');
    return;
  }
  if (column > TASK_COLUMN_COUNT) return;

  var id = String(sheet.getRange(row, TASK_COLUMNS.ID).getValue() || '');
  if (!id) return;
  var currentTask = readTaskAtRow_(sheet, row);
  try { authorizeProject_(currentTask.projectId, true); }
  catch (authorizationError) {
    if (oldValue === undefined) range.clearContent(); else range.setValue(oldValue);
    notifySheetEdit_((authorizationError && authorizationError.message) || 'Sem permissão para editar este projeto.');
    return;
  }
  var beforeVersion = normalizeVersion_(sheet.getRange(row, TASK_COLUMNS.VERSION).getValue());
  var submittedUat = null;

  if (column === TASK_COLUMNS.STATUS) {
    var oldStatus = String(oldValue || '');
    var newStatus = String(range.getValue() || '');
    if (oldStatus === 'UAT' && newStatus !== 'UAT') {
      range.setValue('UAT');
      notifySheetEdit_('Saída de UAT cancelada. Use Aprovar ou Reprovar UAT no Web Kanban.');
      return;
    }
    if (oldStatus !== 'UAT' && newStatus === 'UAT') {
      var criteria = String(sheet.getRange(row, TASK_COLUMNS.ACCEPTANCE).getValue() || '').trim();
      if (!criteria) {
        range.setValue(oldStatus || 'DEV');
        notifySheetEdit_('Entrada em UAT cancelada: preencha os critérios de aceite.');
        return;
      }
      if (findPendingUatRow_(id)) {
        range.setValue(oldStatus || 'DEV');
        notifySheetEdit_('Entrada em UAT cancelada: já existe um ciclo pendente.');
        return;
      }
      submittedUat = createUatRun_(id, criteria, String(sheet.getRange(row, TASK_COLUMNS.PROJECT_ID).getValue() || DEFAULT_PROJECT_ID));
    }
  }

  sheet.getRange(row, TASK_COLUMNS.VERSION).setValue(beforeVersion + 1);
  var after = readTaskAtRow_(sheet, row);
  if (submittedUat) after.uat = submittedUat;
  recordActivity_(submittedUat ? 'uat.submitted' : 'task.sheet_edited', id, {
    id: id,
    field: BASE_HEADERS[column - 1] || ('col_' + column),
    previousValue: oldValue === undefined ? null : String(oldValue),
    version: beforeVersion
  }, after, sheetEditMetadata_());
}

function reconcileBulkSheetEdit_(sheet, range) {
  var startRow = Math.max(2, range.getRow());
  var endRow = range.getLastRow();
  var touchesStatus = range.getColumn() <= TASK_COLUMNS.STATUS &&
    range.getLastColumn() >= TASK_COLUMNS.STATUS;
  var reconciled = 0;

  for (var row = startRow; row <= endRow; row++) {
    var task = readTaskAtRow_(sheet, row);
    if (!task.id) continue;
    try { authorizeProject_(task.projectId, true); }
    catch (ignoredAuthorization) { continue; }
    if (touchesStatus) {
      var pending = findPendingUatRow_(task.id);
      if (pending && task.status !== 'UAT') {
        sheet.getRange(row, TASK_COLUMNS.STATUS).setValue('UAT');
        task.status = 'UAT';
      } else if (!pending && task.status === 'UAT') {
        if (!String(task.subtarefas || '').trim()) {
          sheet.getRange(row, TASK_COLUMNS.STATUS).setValue('DEV');
          task.status = 'DEV';
        } else {
          createUatRun_(task.id, task.subtarefas, task.projectId);
        }
      }
    }
    var version = normalizeVersion_(sheet.getRange(row, TASK_COLUMNS.VERSION).getValue());
    sheet.getRange(row, TASK_COLUMNS.VERSION).setValue(version + 1);
    recordActivity_('task.sheet_bulk_edited', task.id, {
      editedRange: range.getA1Notation(), version: version
    }, readTaskAtRow_(sheet, row), sheetEditMetadata_());
    reconciled++;
  }
  if (reconciled) notifySheetEdit_(reconciled + ' tarefa(s) reconciliadas e auditadas.');
}

function restoreTechnicalCell_(sheet, row, column, oldValue) {
  if (column === TASK_COLUMNS.SCORE) {
    setF_(sheet.getRange(row, column),
      '=IF(OR($E' + row + '="",$F' + row + '=""),"",$E' + row + '*$F' + row + ')');
    return;
  }
  if (oldValue === undefined) sheet.getRange(row, column).clearContent();
  else sheet.getRange(row, column).setValue(oldValue);
}

function sheetEditMetadata_() {
  var requestId = Utilities.getUuid();
  return { source: 'google_sheet', requestId: requestId, correlationId: requestId };
}

function notifySheetEdit_(message) {
  try { SpreadsheetApp.getActive().toast(message, 'Kanban', 6); } catch (ignored) {}
}

var APPSHEET_AUTOMATION_HANDLER = 'reconcileAppSheetInboxCaptures';

/** Instala uma única reconciliação periódica das capturas mobile. */
function installAppSheetAutomation() {
  automationAuthorizeManager_(DEFAULT_PROJECT_ID);
  removeTriggersByHandler_(APPSHEET_AUTOMATION_HANDLER);
  ScriptApp.newTrigger(APPSHEET_AUTOMATION_HANDLER).timeBased().everyMinutes(5).create();
  var reconciliation = reconcileAppSheetInboxCaptures({ limit: 500 });
  return {
    installed: true,
    handler: APPSHEET_AUTOMATION_HANDLER,
    intervalMinutes: 5,
    reconciliation: reconciliation
  };
}

function removeAppSheetAutomation() {
  automationAuthorizeManager_(DEFAULT_PROJECT_ID);
  var removed = removeTriggersByHandler_(APPSHEET_AUTOMATION_HANDLER);
  return { installed: false, handler: APPSHEET_AUTOMATION_HANDLER, removed: removed };
}

function getAppSheetAutomationStatus() {
  authorizeProject_(DEFAULT_PROJECT_ID, false);
  var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === APPSHEET_AUTOMATION_HANDLER;
  });
  return {
    installed: triggers.length > 0,
    handler: APPSHEET_AUTOMATION_HANDLER,
    triggerCount: triggers.length,
    intervalMinutes: triggers.length ? 5 : null
  };
}

function removeTriggersByHandler_(handler) {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() !== handler) return;
    ScriptApp.deleteTrigger(trigger);
    removed++;
  });
  return removed;
}

function instalarAutomacaoAppSheet() {
  try {
    var result = installAppSheetAutomation();
    SpreadsheetApp.getActive().toast(
      'Automação ativa a cada ' + result.intervalMinutes + ' minutos. ' +
      result.reconciliation.audited + ' captura(s) auditada(s).',
      'AppSheet', 8);
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      'Não foi possível instalar a automação',
      (error && error.message) ? error.message : String(error),
      SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
