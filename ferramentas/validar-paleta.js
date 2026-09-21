/**
 * Valida a paleta de status do Config.js — contraste WCAG nos dois temas.
 *
 * Rode antes de subir qualquer mudança de cor:
 *   node ferramentas/validar-paleta.js
 *
 * Sai com código 1 se algo reprovar, então serve em verificação automática.
 * NÃO faz parte do projeto Apps Script (é Node.js) — o .claspignore o mantém
 * fora do `clasp push`.
 *
 * O que verifica, por status:
 *  - planilha: texto `font` sobre `light`, e BRANCO sobre `header`
 *  - tema claro: texto sobre cabeçalho, fundo da coluna e chip; borda do card
 *  - tema escuro: os mesmos, com accentDark/tintDark/onDark
 *  - nenhum accent perto de uma cor de PRIORITY_COLORS (status não pode ser
 *    confundido com prioridade no mesmo card)
 *
 * Mínimos: 4,5:1 para texto e 3:1 para bordas (elemento gráfico).
 */
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '..', 'Config.js');
const src = fs.readFileSync(CONFIG, 'utf8');
const g = {};
new Function('g', src + '\ng.STATUSES = STATUSES; g.PRIORITY_COLORS = PRIORITY_COLORS;')(g);
const S = g.STATUSES;
const P = g.PRIORITY_COLORS;

// Fundos reais das telas, copiados do Kanban.html.
const SURFACE_LIGHT = '#FFFFFF';
const SURFACE_DARK = '#111C2F';
const CARD_LIGHT = '#FFFFFF';
const CARD_DARK = '#18243A';

function canal(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function luminancia(hex) {
  const h = hex.replace('#', '');
  return 0.2126 * canal(parseInt(h.slice(0, 2), 16)) +
         0.7152 * canal(parseInt(h.slice(2, 4), 16)) +
         0.0722 * canal(parseInt(h.slice(4, 6), 16));
}
function contraste(a, b) {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Equivale a color-mix(in srgb, frente pct%, fundo) usado no CSS. */
function mistura(frente, fundo, pct) {
  const f = frente.replace('#', ''), b = fundo.replace('#', '');
  return '#' + [0, 2, 4].map(i => Math.round(
    parseInt(f.slice(i, i + 2), 16) * pct + parseInt(b.slice(i, i + 2), 16) * (1 - pct)
  ).toString(16).padStart(2, '0')).join('');
}
function distancia(a, b) {
  return [0, 2, 4].map(k => Math.abs(
    parseInt(a.slice(1).slice(k, k + 2), 16) - parseInt(b.slice(1).slice(k, k + 2), 16)
  )).reduce((x, y) => x + y, 0);
}

let falhas = 0, total = 0;
function checar(rotulo, frente, fundo, minimo) {
  total++;
  const valor = contraste(frente, fundo);
  if (valor < minimo) {
    falhas++;
    console.log('  FALHA  ' + rotulo + ' — ' + valor.toFixed(2) + ':1 (mínimo ' + minimo + ')');
  }
}

const OBRIGATORIOS = ['header', 'light', 'font', 'accent', 'accentDark', 'tintDark', 'onDark'];

S.forEach(s => {
  OBRIGATORIOS.forEach(campo => {
    if (!s[campo]) { falhas++; console.log('  FALHA  ' + s.name + ' sem o campo ' + campo); }
  });
  checar(s.name + ' · planilha: texto sobre light', s.font, s.light, 4.5);
  checar(s.name + ' · planilha: branco sobre header', '#FFFFFF', s.header, 4.5);

  checar(s.name + ' · claro: texto no cabeçalho', s.font, mistura(s.accent, SURFACE_LIGHT, 0.16), 4.5);
  checar(s.name + ' · claro: texto no fundo da coluna', s.font, s.light, 4.5);
  checar(s.name + ' · claro: chip de status', s.font, mistura(s.accent, SURFACE_LIGHT, 0.20), 4.5);
  checar(s.name + ' · claro: borda do card', s.accent, CARD_LIGHT, 3);

  checar(s.name + ' · escuro: texto no cabeçalho', s.onDark, mistura(s.accentDark, SURFACE_DARK, 0.16), 4.5);
  checar(s.name + ' · escuro: texto no fundo da coluna', s.onDark, s.tintDark, 4.5);
  checar(s.name + ' · escuro: chip de status', s.onDark, mistura(s.accentDark, SURFACE_DARK, 0.20), 4.5);
  checar(s.name + ' · escuro: borda do card', s.accentDark, CARD_DARK, 3);
});

Object.keys(P).forEach(p => S.forEach(s => {
  if (distancia(s.accent, P[p][0]) < 60) {
    falhas++;
    console.log('  FALHA  status ' + s.name + ' é parecido demais com a prioridade ' + p);
  }
}));

// Avisos de proximidade: não reprovam, mas precisam ser conscientes.
// Os DOIS temas são verificados — checar só um esconde metade do problema.
console.log('\nProximidade entre status (referência: 90):');
let avisos = 0;
[['claro', 'accent'], ['escuro', 'accentDark']].forEach(([tema, campo]) => {
  for (let i = 0; i < S.length; i++) {
    for (let j = i + 1; j < S.length; j++) {
      const d = distancia(S[i][campo], S[j][campo]);
      if (d < 90) {
        avisos++;
        console.log('  aviso [' + tema + ']: ' + S[i].name + ' x ' + S[j].name + ' — ' + d);
      }
    }
  }
});
if (!avisos) console.log('  nenhum par abaixo da referência.');

console.log(falhas
  ? '\n' + falhas + ' FALHA(S) em ' + total + ' verificações.'
  : '\nPaleta OK: ' + total + ' verificações de contraste passaram.');
process.exit(falhas ? 1 : 0);
