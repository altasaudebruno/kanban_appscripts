/**
 * Testa a regra de estado dos dias da agenda (Plano.js + Config.js).
 *
 *   node ferramentas/testar-agenda.js
 *
 * A regra que importa: data vencida NÃO é atraso quando tudo que falta já está
 * pronto e parado na fila de validação. Mas uma única pendência ainda não
 * implementada faz voltar a ser atraso de verdade.
 *
 * Node, fora do clasp push (ver .claspignore).
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const g = {};
new Function('g',
  fs.readFileSync(path.join(raiz, 'Config.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(raiz, 'Plano.js'), 'utf8') + '\n' +
  'g.planPendencia_=planPendencia_; g.checkpointState_=checkpointState_;' +
  'g.checkpointRotulo_=checkpointRotulo_; g.checkpointStateInfo_=checkpointStateInfo_;' +
  'g.CHECKPOINT_STATES=CHECKPOINT_STATES;'
)(g);

const HOJE = '2026-09-23';
const ONTEM = '2026-09-22';
const AMANHA = '2026-09-24';

let falhas = 0;
function eq(rotulo, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log('  FALHA ' + rotulo + ' -> ' + JSON.stringify(obtido) +
      ' (esperava ' + JSON.stringify(esperado) + ')');
  } else {
    console.log('  ok    ' + rotulo);
  }
}
function estado(data, porStatus) {
  return g.checkpointState_(data, HOJE, g.planPendencia_(porStatus));
}
function rotulo(data, porStatus) {
  const p = g.planPendencia_(porStatus);
  return g.checkpointRotulo_(g.checkpointState_(data, HOJE, p), p);
}

console.log('Os tres casos do dia vencido');
// 1. nada começou: atraso de verdade, sem suavizar
eq('tudo por comecar -> ATRASADO',
  estado(ONTEM, { 'NÃO-INICIADO': 4 }), 'ATRASADO');
eq('em DEV ainda nao conta como pronto',
  estado(ONTEM, { 'DEV': 3 }), 'ATRASADO');
// 2. tudo pronto esperando o Bruno
eq('tudo em DEVMERGE -> AGUARDANDO_VALIDACAO',
  estado(ONTEM, { 'DEVMERGE': 5 }), 'AGUARDANDO_VALIDACAO');
eq('tudo em UAT -> AGUARDANDO_VALIDACAO',
  estado(ONTEM, { 'UAT': 2 }), 'AGUARDANDO_VALIDACAO');
eq('DEVMERGE + UAT + entregues -> AGUARDANDO_VALIDACAO',
  estado(ONTEM, { 'DEVMERGE': 3, 'UAT': 1, 'PRODUÇÃO': 9 }), 'AGUARDANDO_VALIDACAO');
// 3. misto: prevalece o atraso, mas o rotulo mostra a fila
eq('misto -> ATRASADO',
  estado(ONTEM, { 'DEVMERGE': 3, 'BACKLOG': 1 }), 'ATRASADO');
eq('misto -> rotulo conta os que so esperam',
  rotulo(ONTEM, { 'DEVMERGE': 3, 'BACKLOG': 1 }), 'Atrasado · 3 aguardando validação');
eq('atraso puro -> rotulo simples',
  rotulo(ONTEM, { 'NÃO-INICIADO': 2 }), 'Atrasado');

console.log('\nDemais estados');
eq('tudo entregue -> CONCLUÍDO', estado(ONTEM, { 'PRODUÇÃO': 6 }), 'CONCLUÍDO');
eq('entregue vence a data', estado(AMANHA, { 'PRODUÇÃO': 2 }), 'CONCLUÍDO');
eq('hoje -> HOJE', estado(HOJE, { 'DEVMERGE': 1 }), 'HOJE');
eq('futuro -> PREVISTO', estado(AMANHA, { 'BACKLOG': 3 }), 'PREVISTO');
eq('hoje com pendencia nao vira atraso', estado(HOJE, { 'BACKLOG': 9 }), 'HOJE');

console.log('\nContagem da pendencia');
eq('separa fila de trabalho',
  g.planPendencia_({ 'DEVMERGE': 2, 'UAT': 1, 'DEV': 3, 'PRODUÇÃO': 4 }),
  { aguardando: 3, naoProntos: 3, pendentes: 6 });
eq('entregue nao e pendencia',
  g.planPendencia_({ 'PRODUÇÃO': 7 }), { aguardando: 0, naoProntos: 0, pendentes: 0 });

console.log('\nCores e rotulos do Config');
eq('AGUARDANDO_VALIDACAO tem rotulo',
  g.checkpointStateInfo_('AGUARDANDO_VALIDACAO').rotulo, 'Aguardando validação');
['CONCLUÍDO', 'HOJE', 'AGUARDANDO_VALIDACAO', 'ATRASADO', 'PREVISTO', 'SEM TAREFAS']
  .forEach(function (nome) {
    const info = g.CHECKPOINT_STATES[nome];
    if (!info || !info.light || !info.dark || !info.rotulo) {
      falhas++;
      console.log('  FALHA estado ' + nome + ' incompleto no Config.js');
    }
  });
// O ponto do estado novo e NAO parecer atraso.
if (g.CHECKPOINT_STATES['AGUARDANDO_VALIDACAO'].light ===
    g.CHECKPOINT_STATES['ATRASADO'].light) {
  falhas++;
  console.log('  FALHA aguardando validacao usa a mesma cor de atrasado');
}
if (!falhas) console.log('  ok    todos os estados com cor e rotulo, e distintos');

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTodos os casos passaram.');
process.exit(falhas ? 1 : 0);
