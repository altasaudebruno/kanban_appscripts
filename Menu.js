/**
 * Menu.js — menu "Kanban" na planilha.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kanban')
    .addItem('Abrir Quadro Kanban', 'abrirQuadro')
    .addItem('Visão do gestor (somente leitura)', 'abrirVisaoGestor')
    .addItem('Meu dia — o que fazer e testar', 'mostrarResumoDoDia')
    .addSeparator()
    .addItem('Enviar relatório ao gestor por e-mail', 'enviarRelatorioAoGestorUi')
    .addSeparator()
    .addItem('Carregar planejamento Docfinance', 'carregarPlanejamentoDocfinanceUi')
    .addItem('Dar acesso de leitura ao gestor…', 'darAcessoAoGestorUi')
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

function abrirVisaoGestor() {
  var template = HtmlService.createTemplateFromFile('Gestor');
  template.projeto = '';
  var html = template.evaluate().setWidth(1200).setHeight(860);
  SpreadsheetApp.getUi().showModalDialog(html, 'Acompanhamento — visão do gestor');
}

function mostrarResumoDoDia() {
  var ui = SpreadsheetApp.getUi();
  var resumo;
  try {
    resumo = resumoDia();
  } catch (error) {
    ui.alert('Resumo do dia', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
    return;
  }

  var linhas = [resumo.label + ' — ' + resumo.project.name, ''];
  if (resumo.avisoProjeto) {
    linhas.push('ATENÇÃO: ' + resumo.avisoProjeto);
    linhas.push('');
  }
  if (resumo.checkpoint) {
    linhas.push('Checkpoint de hoje: ' + resumo.checkpoint.blocks.join(' + '));
    linhas.push(resumo.checkpoint.meta);
  } else {
    linhas.push('Nenhum checkpoint da agenda cai em hoje.');
  }
  linhas.push('');
  linhas.push('Plano: ' + resumo.totals.pct + '% concluído (' +
    resumo.totals.done + '/' + resumo.totals.total + ' em produção).');

  function bloco(titulo, lista, formatar) {
    if (!lista.length) return;
    linhas.push('');
    linhas.push(titulo.toUpperCase() + ' (' + lista.length + ')');
    lista.slice(0, 12).forEach(function (item) { linhas.push('  ' + formatar(item)); });
    if (lista.length > 12) linhas.push('  … e mais ' + (lista.length - 12) + '.');
  }

  bloco('Bloqueadas', resumo.bloqueadas, function (t) { return t.id + ' · ' + t.title; });
  bloco('Atrasadas', resumo.atrasadas, function (t) { return t.id + ' · ' + t.title + ' (prazo ' + t.dueDate + ')'; });
  bloco('Em andamento', resumo.emAndamento, function (t) { return t.id + ' · ' + t.title + ' [' + t.status + ']'; });
  bloco('Aguardando validação (UAT)', resumo.emUat, function (t) { return t.id + ' · ' + t.title; });
  bloco('Foco de hoje', resumo.foco, function (t) { return t.id + ' · ' + t.title + ' [' + t.status + ']'; });
  bloco('O que testar hoje', resumo.oQueTestarHoje, function (t) { return t.id + ' · ' + t.teste; });

  ui.alert('Meu dia', linhas.join('\n'), ui.ButtonSet.OK);
}

function enviarRelatorioAoGestorUi() {
  var ui = SpreadsheetApp.getUi();
  var confirmacao = ui.alert('Enviar relatório ao gestor',
    'Enviar agora o relatório de acompanhamento para ' + GESTOR_EMAIL + '?',
    ui.ButtonSet.YES_NO);
  if (confirmacao !== ui.Button.YES) return;
  try {
    var resultado = enviarRelatorioAoGestor(GESTOR_EMAIL);
    ui.alert('Relatório enviado',
      'Enviado para ' + resultado.destinatario + '.\n\n' +
      'Assunto: ' + resultado.assunto,
      ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Relatório ao gestor',
      String(error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
}

function carregarPlanejamentoDocfinanceUi() {
  var ui = SpreadsheetApp.getUi();
  var resultado;
  try {
    resultado = carregarPlanejamentoDocfinance();
  } catch (error) {
    ui.alert('Carregar planejamento', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
    return;
  }
  ui.alert('Planejamento Docfinance',
    (resultado.projectCreated ? 'Projeto ' + resultado.projectId + ' criado.\n' : '') +
    resultado.createdCount + ' tarefa(s) criada(s).\n' +
    resultado.skippedCount + ' já existia(m) e foi(ram) preservada(s).\n' +
    (resultado.aviso ? '\n' + resultado.aviso + '\n' : '') + '\n' +
    'Selecione o projeto ' + resultado.projectId + ' no quadro para vê-las.',
    ui.ButtonSet.OK);
}

function darAcessoAoGestorUi() {
  var ui = SpreadsheetApp.getUi();
  var resposta = ui.prompt('Acesso de leitura ao gestor',
    'E-mail do gestor (recebe papel VIEWER, que não altera nada).\n' +
    'Deixe em branco para usar ' + GESTOR_EMAIL + ':', ui.ButtonSet.OK_CANCEL);
  if (resposta.getSelectedButton() !== ui.Button.OK) return;
  try {
    var resultado = darAcessoAoGestor(resposta.getResponseText());
    var linhas = [resultado.email + ' — projeto ' + resultado.projectId, ''];
    linhas.push('Papel VIEWER: ' + (resultado.papelAplicado ? 'aplicado' : 'pendente'));
    linhas.push('Leitura da planilha: ' + (resultado.leituraDaPlanilha ? 'concedida' : 'pendente'));
    if (resultado.aviso) { linhas.push(''); linhas.push(resultado.aviso); }
    ui.alert('Acesso ao gestor', linhas.join('\n'), ui.ButtonSet.OK);
  } catch (error) {
    ui.alert('Acesso ao gestor', String(error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
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
