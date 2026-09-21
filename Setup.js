/**
 * Setup.js — instalação/reconstrução da planilha.
 * setupPlanilha() é idempotente e NÃO toca nos dados das tarefas.
 * seedTarefas(force) grava as 28 tarefas originais (só se BASE vazia, ou force).
 *
 * ATENÇÃO (aprendido na prática, ver formulas.png):
 * setFormula(s) exige nomes de função CANÔNICOS EM INGLÊS em qualquer locale
 * (nomes traduzidos como SE/CONT.SE só funcionam digitados na interface, que
 * os converte ao salvar — via API viram #NAME? "Função desconhecida").
 * Já o SEPARADOR de argumentos segue o locale da planilha (pt-BR usa ";";
 * vírgulas geram erro de análise). Por isso as fórmulas ficam em EN e apenas
 * o separador é ajustado — detectado empiricamente por argSep_ com uma
 * fórmula de sondagem, para não depender de suposições sobre o locale.
 * Sempre usar os wrappers setF_/setFs_, nunca setFormula(s) direto.
 */

function bref_() { return "'" + SHEETS.BASE + "'"; }
function projectRef_() { return "'" + SHEETS.LISTAS + "'!$G$2"; }

function columnLetter_(column) {
  var result = '';
  while (column > 0) {
    column--;
    result = String.fromCharCode(65 + (column % 26)) + result;
    column = Math.floor(column / 26);
  }
  return result;
}

var SEP_ = null;

/** Detecta o separador de argumentos aceito pela planilha (',' ou ';')
 *  gravando uma fórmula de sondagem e lendo o resultado. */
function argSep_() {
  if (SEP_) return SEP_;
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.CALC) || ss.getSheets()[0];
  // CALC é uma aba técnica controlada pela aplicação. A última coluna é usada
  // como sonda para não apagar um cabeçalho caso novos status sejam adicionados.
  var minimumProbeColumn = 6 + STATUSES.length;
  if (sh.getMaxColumns() < minimumProbeColumn) {
    sh.insertColumnsAfter(sh.getMaxColumns(), minimumProbeColumn - sh.getMaxColumns());
  }
  var probe = sh.getRange(1, sh.getMaxColumns());
  var originalFormula = probe.getFormula();
  var originalValue = probe.getValue();
  try {
    if (formulaProbeWorks_(probe, '=IF(1=1,"ok","x")')) SEP_ = ',';
    else if (formulaProbeWorks_(probe, '=IF(1=1;"ok";"x")')) SEP_ = ';';
    else throw new Error('Não foi possível determinar o separador de fórmulas da planilha.');
  } finally {
    if (originalFormula) probe.setFormula(originalFormula);
    else if (originalValue === '' || originalValue === null) probe.clearContent();
    else probe.setValue(originalValue);
    SpreadsheetApp.flush();
  }
  return SEP_;
}

function formulaProbeWorks_(probe, formula) {
  try {
    probe.setFormula(formula);
    SpreadsheetApp.flush();
    return probe.getDisplayValue() === 'ok';
  } catch (ignored) {
    return false;
  }
}

/** Ajusta a fórmula (canônica EN, com vírgulas) para o separador aceito pela
 *  planilha, preservando literais entre aspas duplas. Nomes de função ficam
 *  em inglês — é o que a API resolve. */
function localizeFormula_(f) {
  if (!f) return f;
  var sep = argSep_();
  if (sep === ',') return f;
  return String(f).split(/("(?:[^"]|"")*")/).map(function (seg, i) {
    if (i % 2 === 1) return seg; // literal entre aspas
    return seg.replace(/,/g, sep);
  }).join('');
}

function setF_(range, formula) {
  return range.setFormula(localizeFormula_(formula));
}

function setFs_(range, matrix) {
  return range.setFormulas(matrix.map(function (row) {
    return row.map(localizeFormula_);
  }));
}

/** Limpa completamente uma aba declaradamente derivada. Evita que fórmulas e
 * merges de versões anteriores sobrevivam quando o fluxo muda de tamanho. */
function resetDerivedSheet_(sh) {
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.setConditionalFormatRules([]);
}

function setupPlanilha() {
  SEP_ = null;
  var ss = SpreadsheetApp.getActive();
  var base = getOrCreateSheet_(ss, SHEETS.BASE);
  var kanban = getOrCreateSheet_(ss, SHEETS.KANBAN);
  var listas = getOrCreateSheet_(ss, SHEETS.LISTAS);
  var resumo = getOrCreateSheet_(ss, SHEETS.RESUMO);
  var projects = getOrCreateSheet_(ss, SHEETS.PROJECTS);
  var projectMembers = getOrCreateSheet_(ss, SHEETS.PROJECT_MEMBERS);
  var comments = getOrCreateSheet_(ss, SHEETS.COMMENTS);
  var inbox = getOrCreateSheet_(ss, SHEETS.INBOX);
  var attachments = getOrCreateSheet_(ss, SHEETS.ATTACHMENTS);
  var blockers = getOrCreateSheet_(ss, SHEETS.BLOCKERS);
  var uatRuns = getOrCreateSheet_(ss, SHEETS.UAT_RUNS);
  var activity = getOrCreateSheet_(ss, SHEETS.ACTIVITY);
  var calc = getOrCreateSheet_(ss, SHEETS.CALC);

  buildProjects_(projects);
  buildProjectMembers_(projectMembers);
  ensureConfiguredProjectMembers_(projectMembers);
  buildComments_(comments);
  buildInbox_(inbox);
  buildAttachments_(attachments);
  buildListas_(listas, projects);
  buildBase_(base, listas);
  buildCalc_(calc);
  buildKanban_(kanban);
  buildResumo_(resumo);
  buildBlockers_(blockers);
  buildUatRuns_(uatRuns);
  buildActivity_(activity);

  // ACTIVITY_EVENTS fica visível para auditoria; CALC continua sendo a única
  // aba técnica oculta.
  [SHEETS.BASE, SHEETS.KANBAN, SHEETS.LISTAS, SHEETS.RESUMO, SHEETS.PROJECTS,
    SHEETS.PROJECT_MEMBERS, SHEETS.COMMENTS, SHEETS.INBOX, SHEETS.ATTACHMENTS,
    SHEETS.BLOCKERS, SHEETS.UAT_RUNS, SHEETS.ACTIVITY, SHEETS.CALC]
    .forEach(function (name, i) {
      ss.setActiveSheet(ss.getSheetByName(name));
      ss.moveActiveSheet(i + 1);
    });

  if (!calc.isSheetHidden()) calc.hideSheet();

  // Equivalente da tabela "TabelaTarefas" do Excel.
  ss.setNamedRange('TabelaTarefas', base.getRange(
    'A1:' + columnLetter_(BASE_HEADERS.length) + Math.max(DATA_ROWS, base.getLastRow())));

  // Remove abas padrão vazias que tenham sobrado (ex.: "Página1").
  ss.getSheets().forEach(function (sh) {
    var known = Object.keys(SHEETS).some(function (k) { return SHEETS[k] === sh.getName(); });
    if (!known && sh.getLastRow() === 0 && sh.getLastColumn() === 0) ss.deleteSheet(sh);
  });

  SpreadsheetApp.flush();
  var formulaIssues = collectFormulaIssues_();
  ss.setActiveSheet(base);
  if (formulaIssues.length) {
    throw new Error('A reconstrução terminou com ' + formulaIssues.length +
      ' problema(s) de fórmula. Primeiros casos: ' + formulaIssues.slice(0, 5).join(' | '));
  }
  return { ok: true, formulaIssues: [] };
}

/** Renomeia a aba padrão solitária em vez de criar outra (preserva gid=0). */
function getOrCreateSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var sheets = ss.getSheets();
  if (sheets.length === 1 && sheets[0].getLastRow() === 0 && sheets[0].getLastColumn() === 0) {
    sheets[0].setName(name);
    return sheets[0];
  }
  return ss.insertSheet(name);
}

// ---------------------------------------------------------------- LISTAS ----

function buildListas_(sh, projects) {
  sh.getRange('A1').setValue('STATUS');
  sh.getRange('A2:A100').clearContent();
  sh.getRange(2, 1, STATUSES.length, 1).setValues(statusNames_().map(function (s) { return [s]; }));
  sh.getRange('C1').setValue('COLABORADORES');
  sh.getRange('C2:C100').clearContent();
  sh.getRange(2, 3, RESPONSAVEIS.length, 1).setValues(RESPONSAVEIS.map(function (r) { return [r]; }));
  sh.getRange('E1').setValue('COMO USAR');
  sh.getRange('E2:E100').clearContent();
  sh.getRange(2, 5, COMO_USAR.length, 1).setValues(COMO_USAR.map(function (t) { return [t]; }));
  configureSheetProjectSelector_(sh, projects);

  sh.getRange('A1').setFontWeight('bold');
  sh.getRange('C1').setFontWeight('bold');
  sh.getRange('E1').setFontWeight('bold');
  sh.setColumnWidth(5, 760);
  sh.setColumnWidth(7, 150);
  sh.getRange(2, 5, COMO_USAR.length, 1).setWrap(true).setVerticalAlignment('top');
}

// ------------------------------------------------------------------ BASE ----

function buildBase_(sh, listas) {
  var n = DATA_ROWS;

  if (sh.getMaxRows() < n) {
    sh.insertRowsAfter(sh.getMaxRows(), n - sh.getMaxRows());
  }
  if (sh.getMaxColumns() < BASE_HEADERS.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), BASE_HEADERS.length - sh.getMaxColumns());
  }

  sh.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS])
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);

  // Coluna G = Pontuação combinada (fórmula em todas as linhas úteis).
  var gf = [];
  for (var r = 2; r <= n; r++) gf.push(['=IF(OR($E' + r + '="",$F' + r + '=""),"",$E' + r + '*$F' + r + ')']);
  setFs_(sh.getRange(2, 7, n - 1, 1), gf);

  // Validações (iguais às do Excel).
  sh.getRange('E2:E' + n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireNumberBetween(1, 5)
      .setAllowInvalid(false).build());
  sh.getRange('F2:F' + n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireNumberGreaterThan(0)
      .setAllowInvalid(false).build());
  sh.getRange('H2:H' + n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(listas.getRange(2, 1, STATUSES.length, 1), true)
      .setAllowInvalid(false).build());
  sh.getRange('I2:I' + n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(listas.getRange(2, 3, RESPONSAVEIS.length, 1), true)
      .setAllowInvalid(false).build());
  sh.getRange('O2:O' + n).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireNumberBetween(0, 1)
      .setAllowInvalid(false).build());

  // Formatos.
  sh.getRange('O2:O' + n).setNumberFormat('0%');
  sh.getRange('L2:N' + n).setNumberFormat('dd/mm/yyyy');
  sh.getRange('Q2:Q' + n).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sh.getRange('S2:S' + n).setNumberFormat('dd/mm/yyyy');
  sh.getRange('T2:T' + n).setHorizontalAlignment('center');
  sh.getRange('E2:G' + n).setHorizontalAlignment('center');
  sh.getRange('H2:I' + n).setHorizontalAlignment('center');
  sh.getRange('P2:P' + n).setHorizontalAlignment('center');
  sh.getRange('A2:A' + n).setFontFamily('Roboto Mono');
  sh.getRange('B2:D' + n).setWrap(true).setVerticalAlignment('top');
  sh.getRange('J2:K' + n).setWrap(true).setVerticalAlignment('top');

  var widths = { 1: 80, 2: 280, 3: 330, 4: 360, 5: 85, 6: 95, 7: 110, 8: 130, 9: 110, 10: 140, 11: 260, 12: 105, 13: 105, 14: 115, 15: 100, 16: 70, 17: 150, 18: 220, 19: 105, 20: 100, 21: 90, 22: 380 };
  Object.keys(widths).forEach(function (c) { sh.setColumnWidth(Number(c), widths[c]); });

  // U = Bloco (B00..B07), V = O que testar no dia.
  sh.getRange(2, TASK_COLUMNS.BLOCK, n - 1, 1).setHorizontalAlignment('center').setNumberFormat('@');
  sh.getRange(2, TASK_COLUMNS.BLOCK, n - 1, 2).setWrap(true).setVerticalAlignment('top');

  // Formatação condicional: prioridade (E) + status (H). Substitui tudo —
  // reexecutar nunca acumula regras.
  var rules = [];
  var eRange = sh.getRange('E2:E' + n);
  [5, 4, 3, 2, 1].forEach(function (p) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(p)
      .setBackground(PRIORITY_COLORS[p][0]).setFontColor(PRIORITY_COLORS[p][1])
      .setRanges([eRange]).build());
  });
  var hRange = sh.getRange('H2:H' + n);
  STATUSES.forEach(function (s) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(s.name)
      .setBackground(s.light).setFontColor(s.font)
      .setRanges([hRange]).build());
  });
  sh.setConditionalFormatRules(rules);

  migrateTaskMetadata_(sh);
}

/** Inicializa somente a versão técnica de tarefas existentes. Não altera
 * nenhum campo de negócio e pode ser executada repetidamente. */
function migrateTaskMetadata_(sh) {
  // Migra também linhas que já tenham ultrapassado o range visual preparado.
  // A API aceita crescimento dinâmico; limitar aqui criaria tarefas sem versão.
  var last = sh.getLastRow();
  if (last < 2) return;
  var ids = sh.getRange(2, TASK_COLUMNS.ID, last - 1, 1).getValues();
  var versions = sh.getRange(2, TASK_COLUMNS.VERSION, last - 1, 1).getValues();
  var projects = sh.getRange(2, TASK_COLUMNS.PROJECT_ID, last - 1, 1).getValues();
  var changed = false;
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] !== '' && ids[i][0] !== null && (versions[i][0] === '' || versions[i][0] === null)) {
      versions[i][0] = 1;
      changed = true;
    }
    if (ids[i][0] !== '' && ids[i][0] !== null && !projects[i][0]) {
      projects[i][0] = DEFAULT_PROJECT_ID;
      changed = true;
    }
  }
  if (changed) {
    sh.getRange(2, TASK_COLUMNS.VERSION, versions.length, 1).setValues(versions);
    sh.getRange(2, TASK_COLUMNS.PROJECT_ID, projects.length, 1).setValues(projects);
  }
}

/** Diagnóstico somente leitura para homologação da migração P0. */
function auditarFundacao() {
  var ss = SpreadsheetApp.getActive();
  var base = ss.getSheetByName(SHEETS.BASE);
  var activity = ss.getSheetByName(SHEETS.ACTIVITY);
  var blockers = ss.getSheetByName(SHEETS.BLOCKERS);
  var uatRuns = ss.getSheetByName(SHEETS.UAT_RUNS);
  var projectsSheet = ss.getSheetByName(SHEETS.PROJECTS);
  var projectMembers = ss.getSheetByName(SHEETS.PROJECT_MEMBERS);
  var comments = ss.getSheetByName(SHEETS.COMMENTS);
  var inbox = ss.getSheetByName(SHEETS.INBOX);
  var attachments = ss.getSheetByName(SHEETS.ATTACHMENTS);
  var report = {
    ok: false,
    activeTasks: 0,
    deletedTasks: 0,
    invalidHeaders: BASE_HEADERS.length,
    invalidVersions: 0,
    duplicateIds: [],
    activityReady: false,
    blockersReady: false,
    uatReady: false,
    projectsReady: false,
    projectMembersReady: false,
    commentsReady: false,
    inboxReady: false,
    attachmentsReady: false,
    formulaIssues: [],
    invalidProjectReferences: [],
    duplicateActiveBlockers: [],
    uatInconsistencies: []
  };
  if (!base || base.getMaxColumns() < TASK_COLUMN_COUNT) return report;

  var headers = base.getRange(1, 1, 1, TASK_COLUMN_COUNT).getValues()[0];
  report.invalidHeaders = headers.filter(function (value, index) {
    return String(value) !== BASE_HEADERS[index];
  }).length;

  var seen = {};
  var duplicates = {};
  var taskStatusById = {};
  var last = base.getLastRow();
  if (last >= 2) {
    var rows = base.getRange(2, 1, last - 1, TASK_COLUMN_COUNT).getValues();
    rows.forEach(function (row) {
      var id = String(row[TASK_COLUMNS.ID - 1] || '');
      if (!id) return;
      if (seen[id]) duplicates[id] = true;
      seen[id] = true;
      taskStatusById[id] = String(row[TASK_COLUMNS.STATUS - 1] || '');
      var version = Number(row[TASK_COLUMNS.VERSION - 1]);
      if (!isFinite(version) || version < 1 || Math.floor(version) !== version) report.invalidVersions++;
      if (row[TASK_COLUMNS.DELETED_AT - 1] instanceof Date) report.deletedTasks++;
      else report.activeTasks++;
    });
  }
  report.duplicateIds = Object.keys(duplicates).sort();

  if (activity && activity.getMaxColumns() >= ACTIVITY_HEADERS.length) {
    var activityHeaders = activity.getRange(1, 1, 1, ACTIVITY_HEADERS.length).getValues()[0];
    report.activityReady = activityHeaders.every(function (value, index) {
      return String(value) === ACTIVITY_HEADERS[index];
    });
  }
  report.blockersReady = recordHeadersReady_(blockers, BLOCKER_HEADERS);
  report.uatReady = recordHeadersReady_(uatRuns, UAT_HEADERS);
  report.projectsReady = recordHeadersReady_(projectsSheet, PROJECT_HEADERS);
  report.projectMembersReady = recordHeadersReady_(projectMembers, PROJECT_MEMBER_HEADERS);
  report.commentsReady = recordHeadersReady_(comments, COMMENT_HEADERS);
  report.inboxReady = recordHeadersReady_(inbox, INBOX_HEADERS);
  report.attachmentsReady = recordHeadersReady_(attachments, ATTACHMENT_HEADERS);
  if (report.projectsReady) {
    var knownProjects = {};
    if (projectsSheet.getLastRow() >= 2) {
      projectsSheet.getRange(2, 1, projectsSheet.getLastRow() - 1, PROJECT_HEADERS.length).getValues()
        .forEach(function (row) { if (row[0]) knownProjects[String(row[0])] = true; });
    }
    if (last >= 2) {
      base.getRange(2, 1, last - 1, TASK_COLUMN_COUNT).getValues().forEach(function (row) {
        var id = String(row[TASK_COLUMNS.ID - 1] || '');
        var projectId = String(row[TASK_COLUMNS.PROJECT_ID - 1] || '');
        if (id && !knownProjects[projectId]) report.invalidProjectReferences.push(id);
      });
    }
  }
  if (report.blockersReady && blockers.getLastRow() >= 2) {
    var activeBlockerCounts = {};
    blockers.getRange(2, 1, blockers.getLastRow() - 1, BLOCKER_HEADERS.length).getValues()
      .forEach(function (row) {
        if (row[1] && !row[7]) activeBlockerCounts[String(row[1])] = (activeBlockerCounts[String(row[1])] || 0) + 1;
      });
    report.duplicateActiveBlockers = Object.keys(activeBlockerCounts)
      .filter(function (id) { return activeBlockerCounts[id] > 1; }).sort();
  }
  if (report.uatReady && uatRuns.getLastRow() >= 2) {
    var pendingUatCounts = {};
    uatRuns.getRange(2, 1, uatRuns.getLastRow() - 1, UAT_HEADERS.length).getValues()
      .forEach(function (row) {
        if (row[1] && String(row[3]) === UAT_OUTCOMES.PENDING) {
          pendingUatCounts[String(row[1])] = (pendingUatCounts[String(row[1])] || 0) + 1;
        }
      });
    Object.keys(taskStatusById).forEach(function (id) {
      var pending = pendingUatCounts[id] || 0;
      if ((taskStatusById[id] === 'UAT' && pending !== 1) ||
          (taskStatusById[id] !== 'UAT' && pending > 0)) report.uatInconsistencies.push(id);
    });
  }
  report.formulaIssues = collectFormulaIssues_();
  report.ok = report.invalidHeaders === 0 && report.invalidVersions === 0 &&
    report.duplicateIds.length === 0 && report.activityReady &&
    report.blockersReady && report.uatReady && report.duplicateActiveBlockers.length === 0 &&
    report.uatInconsistencies.length === 0 && report.projectsReady &&
    report.projectMembersReady && report.commentsReady && report.inboxReady &&
    report.attachmentsReady && report.formulaIssues.length === 0 &&
    report.invalidProjectReferences.length === 0;
  return report;
}

function recordHeadersReady_(sheet, headers) {
  if (!sheet || sheet.getMaxColumns() < headers.length) return false;
  var values = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  return values.every(function (value, index) { return String(value) === headers[index]; });
}

// ------------------------------------------------------------- ACTIVITY ----

/** Prepara a tabela de auditoria sem apagar eventos existentes. */
function buildActivity_(sh) {
  if (sh.getMaxColumns() < ACTIVITY_HEADERS.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), ACTIVITY_HEADERS.length - sh.getMaxColumns());
  }
  sh.getRange(1, 1, 1, ACTIVITY_HEADERS.length).setValues([ACTIVITY_HEADERS])
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.getRange('B2:B').setNumberFormat('dd/mm/yyyy hh:mm:ss');
  var widths = [210, 155, 220, 110, 180, 110, 100, 360, 360, 240, 240];
  widths.forEach(function (width, i) { sh.setColumnWidth(i + 1, width); });
}

// -------------------------------------------------------------- WORKFLOW ----

function buildProjects_(sh) {
  buildRecordSheet_(sh, PROJECT_HEADERS, [7, 9],
    [100, 220, 360, 100, 80, 360, 155, 220, 155]);
  var last = sh.getLastRow();
  var found = false;
  if (last >= 2) {
    found = sh.getRange(2, 1, last - 1, 1).getValues().some(function (row) {
      return String(row[0]) === DEFAULT_PROJECT_ID;
    });
  }
  if (!found) {
    var now = new Date();
    sh.appendRow([
      DEFAULT_PROJECT_ID, 'Controle Ágil', 'Projeto legado migrado automaticamente.',
      DEFAULT_PROJECT_ID, true, '{}', now, currentActor_(), now
    ]);
  }
}

function buildProjectMembers_(sh) {
  buildRecordSheet_(sh, PROJECT_MEMBER_HEADERS, [5],
    [100, 260, 110, 80, 155, 220, 360]);
  if (sh.getLastRow() >= 2) {
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, PROJECT_MEMBER_HEADERS.length).getValues();
    var ids = rows.map(function (row) {
      return [row[0] && row[1] ? projectMemberId_(row[0], row[1]) : ''];
    });
    sh.getRange(2, 7, ids.length, 1).setValues(ids).setNumberFormat('@');
  }
}

function buildComments_(sh) {
  buildRecordSheet_(sh, COMMENT_HEADERS, [6],
    [210, 110, 100, 520, 220, 155, 120, 70]);
}

function buildInbox_(sh) {
  buildRecordSheet_(sh, INBOX_HEADERS, [11, 13, 18], [
    210, 100, 120, 520, 320, 120, 150, 320, 125, 220, 155, 220, 155,
    100, 130, 420, 70, 155
  ]);
  sh.getRange('I2:I').setNumberFormat('dd/mm/yyyy');
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(INBOX_CAPTURE_TYPES, true).setAllowInvalid(false).build());
  sh.getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(INBOX_STATUSES, true).setAllowInvalid(false).build());
  sh.getRange('G2:G').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(INBOX_ITEM_TYPES, true).setAllowInvalid(true).build());
}

function buildAttachments_(sh) {
  buildRecordSheet_(sh, ATTACHMENT_HEADERS, [8],
    [210, 210, 100, 420, 260, 160, 110, 155, 220]);
}

function activeProjectIds_(projectsSheet) {
  if (!projectsSheet || projectsSheet.getLastRow() < 2) return [DEFAULT_PROJECT_ID];
  return projectsSheet.getRange(2, 1, projectsSheet.getLastRow() - 1, PROJECT_HEADERS.length)
    .getValues().filter(function (row) { return row[0] && row[4] !== false; })
    .map(function (row) { return String(row[0]); });
}

function configureSheetProjectSelector_(listasSheet, projectsSheet) {
  var projectIds = activeProjectIds_(projectsSheet);
  var currentProject = String(listasSheet.getRange('G2').getValue() || DEFAULT_PROJECT_ID);
  if (projectIds.indexOf(currentProject) === -1) currentProject = projectIds[0] || DEFAULT_PROJECT_ID;
  listasSheet.getRange('G1').setValue('PROJETO ATUAL').setFontWeight('bold');
  listasSheet.getRange('G2').setValue(currentProject).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(projectIds, true).setAllowInvalid(false).build());
}

function buildBlockers_(sh) {
  buildRecordSheet_(sh, BLOCKER_HEADERS, [6, 8],
    [210, 110, 100, 420, 220, 155, 220, 155, 220, 360, 70]);
}

function buildUatRuns_(sh) {
  buildRecordSheet_(sh, UAT_HEADERS, [7, 10],
    [210, 110, 100, 110, 460, 220, 155, 220, 220, 155, 420, 70]);
}

/** Inicializa tabelas append-only sem remover o histórico existente. */
function buildRecordSheet_(sh, headers, dateColumns, widths) {
  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold')
    .setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  dateColumns.forEach(function (column) {
    sh.getRange(2, column, Math.max(1, sh.getMaxRows() - 1), 1)
      .setNumberFormat('dd/mm/yyyy hh:mm:ss');
  });
  widths.forEach(function (width, index) { sh.setColumnWidth(index + 1, width); });
}

// ------------------------------------------------------------------ CALC ----

function buildCalc_(sh) {
  var n = DATA_ROWS;
  var B = bref_();
  var P = projectRef_();
  var statusCount = STATUSES.length;

  resetDerivedSheet_(sh);

  sh.getRange('A1:C1').setValues([['chave_ordenacao', 'rank_no_status', 'chave_lookup']]);
  sh.getRange(1, 5, 1, statusCount).setValues([statusNames_()]);

  var fa = [], fb = [], fc = [];
  for (var r = 2; r <= n; r++) {
    // IFERROR mantém a visão operacional disponível mesmo se uma linha tiver
    // sido colada manualmente com número/ID fora do padrão. A auditoria continua
    // responsável por apontar o dado inválido, mas ele não derruba todo o quadro.
    fa.push(['=IF(OR(' + B + '!A' + r + '="",' + B + '!Q' + r + '<>"",' + B + '!T' + r + '<>' + P + '),"",(10-IFERROR(VALUE(' + B + '!E' + r + '),0))*100000+IF(' + B + '!F' + r + '="",99,IFERROR(VALUE(' + B + '!F' + r + '),99))*1000+IFERROR(VALUE(REGEXEXTRACT(' + B + '!A' + r + ',"[0-9]+$")),ROW()))']);
    fb.push(['=IF(A' + r + '="","",SUMPRODUCT((' + B + '!$H$2:$H$' + n + '=' + B + '!H' + r + ')*($A$2:$A$' + n + '<A' + r + ')*($A$2:$A$' + n + '<>""))+1)']);
    fc.push(['=IF(A' + r + '="","",' + B + '!H' + r + '&"|"&B' + r + ')']);
  }
  setFs_(sh.getRange(2, 1, n - 1, 1), fa);
  setFs_(sh.getRange(2, 2, n - 1, 1), fb);
  setFs_(sh.getRange(2, 3, n - 1, 1), fc);

  // E2:...(1+CARD_ROWS): índice da linha do card k de cada status.
  var cols = [];
  for (var ci = 0; ci < statusCount; ci++) cols.push(columnLetter_(5 + ci));
  var fm = [];
  for (var k = 0; k < CARD_ROWS; k++) {
    var row = [];
    for (var c = 0; c < cols.length; c++) {
      row.push('=IFERROR(MATCH(' + cols[c] + '$1&"|"&(ROW()-1),$C$2:$C$' + n + ',0),"")');
    }
    fm.push(row);
  }
  setFs_(sh.getRange(2, 5, CARD_ROWS, statusCount), fm);
}

// ---------------------------------------------------------------- KANBAN ----

function buildKanban_(sh) {
  var n = DATA_ROWS;
  var B = bref_();
  var P = projectRef_();
  var statusCount = STATUSES.length;
  var calcCols = [];
  for (var ci = 0; ci < statusCount; ci++) calcCols.push(columnLetter_(5 + ci));

  // A aba é 100% derivada; resíduos de layouts anteriores nunca são preservados.
  resetDerivedSheet_(sh);

  var title = sh.getRange(1, 2, 1, statusCount);
  try { title.merge(); } catch (e) {}
  sh.getRange('B1').setValue('QUADRO KANBAN — CONTROLE ÁGIL')
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(14);

  var sub = sh.getRange(2, 2, 1, statusCount);
  try { sub.merge(); } catch (e) {}
  setF_(sh.getRange('B2'), '="Projeto: "&' + P + '&" · Atualizado automaticamente a partir da BASE DE TAREFAS. Ordenação: prioridade ↓, dificuldade ↑, ID ↑."')
    .setFontStyle('italic').setFontColor('#666666').setWrap(true);

  // Linha 3: cabeçalhos das colunas; linha 4: contadores.
  STATUSES.forEach(function (s, i) {
    var col = 2 + i;
    sh.getRange(3, col).setValue(s.name)
      .setBackground(s.header).setFontColor('#FFFFFF').setFontWeight('bold')
      .setHorizontalAlignment('center');
    setF_(sh.getRange(4, col), '=COUNTIFS(' + B + '!$H$2:$H$' + n + ',' + columnLetter_(col) + '$3,' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')&" tarefa(s)"')
      .setBackground(s.light).setFontStyle('italic').setFontSize(9)
      .setHorizontalAlignment('center');
    sh.setColumnWidth(col, 260);
  });
  sh.setColumnWidth(1, 20);
  sh.setFrozenRows(4);

  // Cards B5:...(4+CARD_ROWS) — uma coluna por status.
  var cards = [];
  for (var k = 0; k < CARD_ROWS; k++) {
    var calcRow = k + 2;
    var row = [];
    for (var c = 0; c < calcCols.length; c++) {
      var IX = 'CALC!' + calcCols[c] + calcRow;
      row.push(
        '=IF(' + IX + '="","",' +
        'INDEX(' + B + '!$A$2:$A$' + n + ',' + IX + ')&"   ·   P "&' +
        'IF(INDEX(' + B + '!$E$2:$E$' + n + ',' + IX + ')="","–",INDEX(' + B + '!$E$2:$E$' + n + ',' + IX + '))&" × D "&' +
        'IF(INDEX(' + B + '!$F$2:$F$' + n + ',' + IX + ')="","–",INDEX(' + B + '!$F$2:$F$' + n + ',' + IX + '))&CHAR(10)&' +
        'INDEX(' + B + '!$B$2:$B$' + n + ',' + IX + ')&CHAR(10)&' +
        'IF(INDEX(' + B + '!$I$2:$I$' + n + ',' + IX + ')="","Não atribuído",INDEX(' + B + '!$I$2:$I$' + n + ',' + IX + '))&"   ·   "&' +
        'IF(INDEX(' + B + '!$O$2:$O$' + n + ',' + IX + ')="","0%",TEXT(INDEX(' + B + '!$O$2:$O$' + n + ',' + IX + '),"0%")))'
      );
    }
    cards.push(row);
  }
  var cardRange = sh.getRange(5, 2, CARD_ROWS, statusCount);
  setFs_(cardRange, cards).setWrap(true).setVerticalAlignment('top').setFontSize(9);
  for (var r = 5; r < 5 + CARD_ROWS; r++) sh.setRowHeight(r, 64);

  // Card não vazio → fundo claro da coluna.
  var rules = STATUSES.map(function (s, i) {
    var rng = sh.getRange(5, 2 + i, CARD_ROWS, 1);
    return SpreadsheetApp.newConditionalFormatRule()
      .whenCellNotEmpty().setBackground(s.light).setRanges([rng]).build();
  });
  sh.setConditionalFormatRules(rules);
}

// ---------------------------------------------------------------- RESUMO ----

function buildResumo_(sh) {
  var n = DATA_ROWS;
  var B = bref_();
  var P = projectRef_();
  var sts = statusNames_();
  var matrixStartCol = 3;
  var totalCol = matrixStartCol + sts.length;
  var lastLayoutCol = Math.max(totalCol, 9);

  // RESUMO é inteiramente derivado; limpar evita resíduos ao adicionar status.
  resetDerivedSheet_(sh);
  var title = sh.getRange(1, 2, 1, lastLayoutCol - 1);
  title.merge();
  sh.getRange('B1').setValue('RESUMO — INDICADORES DO QUADRO ÁGIL')
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(14);

  sh.getRange('B3').setValue('INDICADORES GERAIS').setFontWeight('bold');
  sh.getRange('E3').setValue('TAREFAS POR STATUS').setFontWeight('bold');
  sh.getRange('B4').setValue('Total de tarefas ativas').setBackground('#D6DCE4').setFontWeight('bold');
  setF_(sh.getRange('C4'), '=COUNTIFS(' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')')
    .setBackground('#D6DCE4').setFontWeight('bold');

  var semResp = '=COUNTIFS(' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$I$2:$I$' + n + ',"",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')';
  var metrics = [
    ['Sem responsável', semResp],
    ['Tarefas bloqueadas', '=COUNTIFS(\'' + SHEETS.BLOCKERS + '\'!$B$2:$B,"<>",\'' + SHEETS.BLOCKERS + '\'!$H$2:$H,"",\'' + SHEETS.BLOCKERS + '\'!$C$2:$C,' + P + ')'],
    ['Tarefas atrasadas', '=COUNTIFS(' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$S$2:$S$' + n + ',"<"&TODAY(),' + B + '!$S$2:$S$' + n + ',"<>",' + B + '!$N$2:$N$' + n + ',"",' + B + '!$H$2:$H$' + n + ',"<>PRODUÇÃO",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')'],
    ['Média de prioridade', '=IFERROR(ROUND(AVERAGEIFS(' + B + '!$E$2:$E$' + n + ',' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + '),2),"–")'],
    ['Média de dificuldade', '=IFERROR(ROUND(AVERAGEIFS(' + B + '!$F$2:$F$' + n + ',' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + '),2),"–")'],
    ['Percentual geral de conclusão', '=IFERROR(SUMIFS(' + B + '!$O$2:$O$' + n + ',' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')/COUNTIFS(' + B + '!$A$2:$A$' + n + ',"<>",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + '),0)']
  ];
  metrics.forEach(function (metric, index) {
    var row = 5 + index;
    sh.getRange(row, 2).setValue(metric[0]);
    setF_(sh.getRange(row, 3), metric[1]);
  });
  sh.getRange('C10').setNumberFormat('0%');

  sh.getRange('E4:F4').setValues([['Status', 'Qtde']])
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold');
  sts.forEach(function (status, index) {
    sh.getRange(5 + index, 5).setValue(status);
    setF_(sh.getRange(5 + index, 6), '=COUNTIFS(' + B + '!$H$2:$H$' + n + ',"' + status + '",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')');
  });

  sh.getRange('E12').setValue('TAREFAS POR RESPONSÁVEL').setFontWeight('bold');
  sh.getRange('E13:F13').setValues([['Responsável', 'Qtde']])
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange('E14').setValue('Não atribuído'); setF_(sh.getRange('F14'), semResp);
  RESPONSAVEIS.forEach(function (person, index) {
    sh.getRange(15 + index, 5).setValue(person);
    setF_(sh.getRange(15 + index, 6), '=COUNTIFS(' + B + '!$I$2:$I$' + n + ',"' + person + '",' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')');
  });

  sh.getRange('B18').setValue('PRIORIDADE POR STATUS').setFontWeight('bold');
  sh.getRange('B19').setValue('Prioridade \\ Status').setFontWeight('bold');
  sh.getRange(19, matrixStartCol, 1, sts.length).setValues([sts])
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(19, totalCol).setValue('Total')
    .setBackground(HEADER_FILL).setFontColor('#FFFFFF').setFontWeight('bold');

  var prios = [5, 4, 3, 2, 1];
  prios.forEach(function (priority, priorityIndex) {
    var row = 20 + priorityIndex;
    sh.getRange(row, 2).setValue('Prioridade ' + priority);
    sts.forEach(function (_status, statusIndex) {
      var col = matrixStartCol + statusIndex;
      var letter = columnLetter_(col);
      setF_(sh.getRange(row, col), '=COUNTIFS(' + B + '!$E$2:$E$' + n + ',' + priority + ',' + B + '!$H$2:$H$' + n + ',' + letter + '$19,' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')');
    });
    setF_(sh.getRange(row, totalCol), '=SUM(C' + row + ':' + columnLetter_(totalCol - 1) + row + ')');
  });

  sh.getRange('B25').setValue('Sem prioridade');
  sts.forEach(function (_status, index) {
    var col = matrixStartCol + index;
    var letter = columnLetter_(col);
    setF_(sh.getRange(25, col), '=COUNTIFS(' + B + '!$H$2:$H$' + n + ',' + letter + '$19,' + B + '!$Q$2:$Q$' + n + ',"",' + B + '!$T$2:$T$' + n + ',' + P + ')-SUM(' + letter + '20:' + letter + '24)');
  });
  setF_(sh.getRange(25, totalCol), '=SUM(C25:' + columnLetter_(totalCol - 1) + '25)');
  sh.getRange('B26').setValue('Total').setFontWeight('bold');
  for (var col = matrixStartCol; col <= totalCol; col++) {
    var colLetter = columnLetter_(col);
    setF_(sh.getRange(26, col), '=SUM(' + colLetter + '20:' + colLetter + '25)').setFontWeight('bold');
  }

  sh.setColumnWidth(1, 20);
  sh.setColumnWidth(2, 230);
  sh.setColumnWidth(5, 160);
  sh.setColumnWidth(totalCol, 90);
}

// ------------------------------------------------------------------ SEED ----

/** Grava as 28 tarefas originais. Sem force, exige BASE sem dados. */
function seedTarefas(force) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEETS.BASE);
  if (!sh) throw new Error('Aba "' + SHEETS.BASE + '" não existe. Rode a instalação primeiro.');

  var dataLastRow = Math.max(DATA_ROWS, sh.getLastRow());
  var dataRowCount = dataLastRow - 1;
  var hasData = sh.getRange(2, 1, dataRowCount, 1).getValues()
    .some(function (r) { return r[0] !== '' && r[0] !== null; });
  if (hasData && !force) return false;

  if (hasData) {
    sh.getRange(2, 1, dataRowCount, 6).clearContent();   // A:F
    sh.getRange(2, 8, dataRowCount, 8).clearContent();   // H:O
    sh.getRange(2, 16, dataRowCount, 5).clearContent();  // P:T (metadados + prazo + projeto)
  }

  var left = TASKS.map(function (t) { return [t.id, t.tarefa, t.desc, t.sub, t.p, t.d]; });
  var right = TASKS.map(function (t) { return [t.status, t.resp, t.dep, t.obs, '', '', '', '']; });
  sh.getRange(2, 1, TASKS.length, 6).setValues(left);
  sh.getRange(2, 8, TASKS.length, 8).setValues(right);
  sh.getRange(2, TASK_COLUMNS.VERSION, TASKS.length, 1)
    .setValues(TASKS.map(function () { return [1]; }));
  sh.getRange(2, TASK_COLUMNS.PROJECT_ID, TASKS.length, 1)
    .setValues(TASKS.map(function () { return [DEFAULT_PROJECT_ID]; }));
  return true;
}

// ------------------------------------------------------------ DIAGNÓSTICO ----

function formulaAuditRanges_() {
  var lastCalcStatusCol = columnLetter_(4 + STATUSES.length);
  var lastBoardCol = columnLetter_(1 + STATUSES.length);
  var summaryTotalCol = columnLetter_(3 + STATUSES.length);
  return [
    [SHEETS.BASE, 'G2:G' + DATA_ROWS],
    [SHEETS.CALC, 'A2:C' + DATA_ROWS],
    [SHEETS.CALC, 'E2:' + lastCalcStatusCol + (1 + CARD_ROWS)],
    [SHEETS.KANBAN, 'B2'],
    [SHEETS.KANBAN, 'B4:' + lastBoardCol + '4'],
    [SHEETS.KANBAN, 'B5:' + lastBoardCol + (4 + CARD_ROWS)],
    [SHEETS.RESUMO, 'C4:C10'],
    [SHEETS.RESUMO, 'F5:F' + (4 + STATUSES.length)],
    [SHEETS.RESUMO, 'F14:F' + (14 + RESPONSAVEIS.length)],
    [SHEETS.RESUMO, 'C20:' + summaryTotalCol + '26']
  ];
}

/** Detecta tanto fórmulas com erro quanto células onde uma fórmula obrigatória
 * desapareceu após colagem, mudança de layout ou reconstrução interrompida. */
function collectFormulaIssues_() {
  var ss = SpreadsheetApp.getActive();
  var issues = [];
  formulaAuditRanges_().forEach(function (target) {
    var sh = ss.getSheetByName(target[0]);
    if (!sh) { issues.push(target[0] + ': aba não encontrada'); return; }
    var rng = sh.getRange(target[1]);
    var values = rng.getDisplayValues();
    var formulas = rng.getFormulas();
    for (var r = 0; r < values.length; r++) {
      for (var c = 0; c < values[r].length; c++) {
        var cell = target[0] + '!' + rng.getCell(r + 1, c + 1).getA1Notation();
        if (!formulas[r][c]) issues.push(cell + ' → fórmula ausente');
        else if (String(values[r][c]).charAt(0) === '#') issues.push(cell + ' → ' + values[r][c]);
      }
    }
  });
  return issues;
}

/** Varre os ranges de fórmula e retorna relatório de erros e lacunas. */
function verificarFormulas() {
  SpreadsheetApp.flush();
  var erros = collectFormulaIssues_();
  var msg = erros.length === 0
    ? 'Nenhum erro de fórmula encontrado. Tudo certo!'
    : erros.length + ' problema(s) de fórmula:\n\n' + erros.slice(0, 15).join('\n') +
      (erros.length > 15 ? '\n…' : '') +
      '\n\nRode "Reconstruir formatação/fórmulas" para regravar as fórmulas.';
  try {
    SpreadsheetApp.getUi().alert('Verificação de fórmulas', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    Logger.log(msg);
  }
  return erros;
}
