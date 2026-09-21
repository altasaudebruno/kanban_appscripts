/**
 * WebApp.js — permite publicar o mesmo quadro como web app (URL própria).
 * Opcional: Implantar → Nova implantação → App da Web.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Kanban')
    .setTitle('Quadro Kanban — Controle Ágil')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
