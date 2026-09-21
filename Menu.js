/**
 * Menu.js — menu "Kanban" na planilha.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kanban')
    .addItem('Abrir Quadro Kanban', 'abrirQuadro')
    .addSeparator()
    .addItem('Instalar (estrutura + dados)', 'instalar')
    .addItem('Reconstruir formatação/fórmulas', 'reconstruir')
    .addItem('Recarregar dados originais (APAGA alterações)', 'recarregarDados')
    .addItem('Verificar fórmulas', 'verificarFormulas')
    .addItem('Verificar fundação P0', 'verificarFundacao')
    .addSeparator()
    .addItem('Instalar automação do AppSheet', 'instalarAutomacaoAppSheet')
    .addSeparator()
    .addItem('Ajuda', 'ajuda')
    .addToUi();
}

function abrirQuadro() {
  var html = HtmlService.createHtmlOutputFromFile('Kanban')
    .setWidth(1550).setHeight(920);
  SpreadsheetApp.getUi().showModalDialog(html, 'Quadro Kanban — Controle Ágil');
}

function instalar() {
  setupPlanilha();
  var seeded = seedTarefas(false);
  SpreadsheetApp.getUi().alert(
    'Instalação concluída.' +
    (seeded ? '\n\n28 tarefas originais carregadas.' : '\n\nDados existentes preservados (nada foi sobrescrito).'));
}

function reconstruir() {
  setupPlanilha();
  SpreadsheetApp.getUi().alert(
    'Estrutura, fórmulas e formatação reconstruídas e verificadas. Dados de negócio intactos.');
}

function recarregarDados() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Recarregar dados originais',
    'Isto APAGA todas as alterações na aba BASE DE TAREFAS e regrava as 28 tarefas originais do Excel. Continuar?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;
  setupPlanilha();
  seedTarefas(true);
  ui.alert('Dados originais recarregados.');
}

function ajuda() {
  SpreadsheetApp.getUi().alert('COMO USAR', COMO_USAR.join('\n\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function verificarFundacao() {
  var report = auditarFundacao();
  var lines = [
    report.ok ? 'Fundação P0 íntegra.' : 'A fundação P0 requer correção.',
    '',
    'Tarefas ativas: ' + report.activeTasks,
    'Tarefas na lixeira: ' + report.deletedTasks,
    'Cabeçalhos divergentes: ' + report.invalidHeaders,
    'Versões inválidas: ' + report.invalidVersions,
    'IDs duplicados: ' + report.duplicateIds.length,
    'Auditoria pronta: ' + (report.activityReady ? 'sim' : 'não'),
    'Histórico de bloqueios pronto: ' + (report.blockersReady ? 'sim' : 'não'),
    'Ciclos de UAT prontos: ' + (report.uatReady ? 'sim' : 'não'),
    'Projetos prontos: ' + (report.projectsReady ? 'sim' : 'não'),
    'Permissões por projeto prontas: ' + (report.projectMembersReady ? 'sim' : 'não'),
    'Comentários prontos: ' + (report.commentsReady ? 'sim' : 'não'),
    'Inbox pronta: ' + (report.inboxReady ? 'sim' : 'não'),
    'Anexos prontos: ' + (report.attachmentsReady ? 'sim' : 'não'),
    'Problemas de fórmula: ' + report.formulaIssues.length,
    'Referências de projeto inválidas: ' + report.invalidProjectReferences.length,
    'Bloqueios ativos duplicados: ' + report.duplicateActiveBlockers.length,
    'Inconsistências de UAT: ' + report.uatInconsistencies.length
  ];
  if (report.duplicateIds.length) lines.push('Duplicados: ' + report.duplicateIds.join(', '));
  if (report.duplicateActiveBlockers.length) lines.push('Bloqueios duplicados: ' + report.duplicateActiveBlockers.join(', '));
  if (report.uatInconsistencies.length) lines.push('UAT inconsistente: ' + report.uatInconsistencies.join(', '));
  if (report.invalidProjectReferences.length) lines.push('Projeto inválido: ' + report.invalidProjectReferences.join(', '));
  if (report.formulaIssues.length) lines.push('Fórmulas: ' + report.formulaIssues.slice(0, 10).join(' | '));
  SpreadsheetApp.getUi().alert('Diagnóstico da fundação', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
