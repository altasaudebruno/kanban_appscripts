/**
 * WebApp.js — publica o quadro e a visão do gestor como app da web.
 * Implantar → Nova implantação → App da Web.
 *
 *   .../exec                      → quadro Kanban completo (operação)
 *   .../exec?view=gestor          → retrato somente-leitura do andamento
 *   .../exec?view=gestor&projeto=DF
 *
 * A implantação roda como o USUÁRIO QUE ACESSA (appsscript.json:
 * executeAs USER_ACCESSING, access DOMAIN). O gestor vê o que o papel dele
 * permite: VIEWER em PROJECT_MEMBERS não escreve nada, porque
 * authorizeProject_ recusa toda mutação desse papel.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var view = String(params.view || '').trim().toLowerCase();

  if (view === 'gestor' || view === 'manager') {
    var template = HtmlService.createTemplateFromFile('Gestor');
    template.projeto = sanitizeProjectParam_(params.projeto || params.projectId);
    return template.evaluate()
      .setTitle('Acompanhamento — visão do gestor')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createHtmlOutputFromFile('Kanban')
    .setTitle('Quadro Kanban — Controle Ágil')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Reduz o parâmetro ao alfabeto de um project_id antes de chegar na página. */
function sanitizeProjectParam_(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
}
