/**
 * Limpeza.js — remoção dos dados legados da planilha.
 *
 * Esta planilha nasceu como cópia de um controle anterior (projeto AG e o que
 * mais viesse junto). Autorizado pelo Bruno em 21/09/2026, tudo que não
 * pertence ao projeto mantido pode sair.
 *
 * Duas garantias de projeto:
 *  - contar antes de apagar. `analisarDadosLegados` é somente leitura e é o
 *    que alimenta a confirmação; nada é removido sem o operador ver o número;
 *  - apagar em blocos. As linhas a remover são agrupadas em intervalos
 *    contíguos e excluídas de baixo para cima, uma chamada por intervalo, em
 *    vez de uma chamada por linha.
 */

/** Abas varridas, com a coluna que carrega o project_id de cada uma. */
function legacyScopes_() {
  return [
    { key: 'tarefas',   sheet: SHEETS.BASE,            headers: BASE_HEADERS,           column: TASK_COLUMNS.PROJECT_ID, rotulo: 'Tarefas' },
    { key: 'comments',  sheet: SHEETS.COMMENTS,        headers: COMMENT_HEADERS,        rotulo: 'Notas/comentários' },
    { key: 'blockers',  sheet: SHEETS.BLOCKERS,        headers: BLOCKER_HEADERS,        rotulo: 'Bloqueios' },
    { key: 'uat',       sheet: SHEETS.UAT_RUNS,        headers: UAT_HEADERS,            rotulo: 'Ciclos de UAT' },
    { key: 'inbox',     sheet: SHEETS.INBOX,           headers: INBOX_HEADERS,          rotulo: 'Itens da Inbox' },
    { key: 'anexos',    sheet: SHEETS.ATTACHMENTS,     headers: ATTACHMENT_HEADERS,     rotulo: 'Anexos' },
    { key: 'membros',   sheet: SHEETS.PROJECT_MEMBERS, headers: PROJECT_MEMBER_HEADERS, rotulo: 'Membros de projeto' },
    { key: 'projetos',  sheet: SHEETS.PROJECTS,        headers: PROJECT_HEADERS,        rotulo: 'Projetos' },
    { key: 'auditoria', sheet: SHEETS.ACTIVITY,        headers: ACTIVITY_HEADERS,       rotulo: 'Eventos de auditoria' }
  ];
}

function legacyProjectColumn_(scope) {
  if (scope.column) return scope.column;
  var index = scope.headers.indexOf('project_id');
  if (index === -1) throw new Error('Aba sem coluna project_id: ' + scope.sheet);
  return index + 1;
}

/**
 * Conta o que sairia, sem apagar nada.
 * Devolve também os IDs de projeto encontrados, para o operador reconhecer o
 * que está prestes a remover em vez de confiar num número solto.
 */
function analisarDadosLegados(projectIdManter) {
  var manter = normalizeProjectId_(projectIdManter || planDefaultProjectId_());
  var ss = SpreadsheetApp.getActive();
  var detalhes = [];
  var total = 0;
  var projetosEncontrados = [];

  legacyScopes_().forEach(function (scope) {
    var sh = ss.getSheetByName(scope.sheet);
    if (!sh) { detalhes.push({ key: scope.key, rotulo: scope.rotulo, total: 0, ausente: true }); return; }
    var last = sh.getLastRow();
    if (last < 2) { detalhes.push({ key: scope.key, rotulo: scope.rotulo, total: 0 }); return; }

    var coluna = legacyProjectColumn_(scope);
    var largura = Math.min(Math.max(coluna, 1), sh.getMaxColumns());
    var valores = sh.getRange(2, 1, last - 1, largura).getValues();
    var conta = 0;

    valores.forEach(function (linha) {
      if (!legacyRowHasContent_(linha)) return;
      // Sem project_id a linha NÃO é do projeto mantido — tratar como legada é
      // o lado seguro aqui, já que o alvo é justamente o resíduo da cópia.
      var projeto = String(linha[coluna - 1] || '').trim().toUpperCase() || '(sem projeto)';
      if (projeto === manter) return;
      conta++;
      if (projetosEncontrados.indexOf(projeto) === -1) projetosEncontrados.push(projeto);
    });

    total += conta;
    detalhes.push({ key: scope.key, rotulo: scope.rotulo, total: conta });
  });

  projetosEncontrados.sort();
  return {
    manter: manter,
    total: total,
    projetosLegados: projetosEncontrados,
    detalhes: detalhes
  };
}

/** Uma linha só conta se tiver algum conteúdo — a base tem milhares vazias. */
function legacyRowHasContent_(linha) {
  for (var i = 0; i < linha.length; i++) {
    if (linha[i] !== '' && linha[i] !== null) return true;
  }
  return false;
}

/**
 * Remove os dados legados.
 *
 * `confirmar` precisa ser true: chamada sem confirmação devolve apenas a
 * prévia, para que um engano de digitação no terminal não apague nada.
 */
function limparDadosLegados(projectIdManter, confirmar, metadata) {
  var previa = analisarDadosLegados(projectIdManter);
  var manter = previa.manter;

  if (confirmar !== true) {
    return {
      ok: false, confirmado: false, previa: previa,
      aviso: 'Nada foi apagado. Para executar, repita com o segundo parâmetro true: ' +
        'clasp run-function limparDadosLegados --params \'["' + manter + '",true]\''
    };
  }

  var projeto = findProjectRow_(manter);
  if (!projeto || !projeto.project.active) {
    throw new Error('O projeto a manter (' + manter + ') não existe ou está inativo. ' +
      'Carregue o planejamento antes de limpar, para não esvaziar a planilha inteira.');
  }
  authorizeProject_(manter, true);

  if (!previa.total) {
    return { ok: true, confirmado: true, removidos: 0, previa: previa,
      aviso: 'Não havia dado legado para remover.' };
  }

  var ss = SpreadsheetApp.getActive();
  var removidos = {};
  var totalRemovido = 0;

  withLock_(function () {
    legacyScopes_().forEach(function (scope) {
      var sh = ss.getSheetByName(scope.sheet);
      if (!sh) { removidos[scope.key] = 0; return; }
      var coluna = legacyProjectColumn_(scope);
      var conta = purgarLinhasDeOutrosProjetos_(sh, coluna, manter,
        scope.sheet === SHEETS.BASE);
      removidos[scope.key] = conta;
      totalRemovido += conta;
    });
    return true;
  });

  // A trilha dos dados legados saiu junto (é cópia), mas a limpeza em si fica
  // registrada: sem isto, a planilha não teria como explicar o que sumiu.
  var registrado = true;
  try {
    recordActivity_('data.legacy_purged', manter, null, {
      projectId: manter, removidos: removidos, total: totalRemovido,
      projetosLegados: previa.projetosLegados
    }, metadata || { source: 'cleanup:legacy', projectId: manter });
  } catch (ignored) {
    registrado = false;
  }

  // A base perdeu linhas e as abas derivadas apontam para intervalos fixos.
  // setupPlanilha é idempotente e devolve a estrutura ao tamanho padrão.
  var estruturaOk = true;
  var estruturaErro = '';
  try {
    setupPlanilha();
  } catch (error) {
    estruturaOk = false;
    estruturaErro = String(error && error.message ? error.message : error);
  }

  return {
    ok: true,
    confirmado: true,
    manter: manter,
    removidos: removidos,
    total: totalRemovido,
    projetosRemovidos: previa.projetosLegados,
    auditoriaRegistrada: registrado,
    estruturaReconstruida: estruturaOk,
    aviso: estruturaOk ? '' :
      'Os dados saíram, mas a reconstrução da estrutura falhou (' + estruturaErro +
      '). Rode Kanban → "Reconstruir formatação/fórmulas".'
  };
}

/**
 * Apaga as linhas cujo project_id difere do mantido, em blocos contíguos e de
 * baixo para cima — remover de cima deslocaria as linhas seguintes e invalidaria
 * os índices já calculados.
 */
function purgarLinhasDeOutrosProjetos_(sheet, coluna, manter, preservarCabecalhoDeDados) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;

  var largura = Math.min(Math.max(coluna, 1), sheet.getMaxColumns());
  var valores = sheet.getRange(2, 1, last - 1, largura).getValues();
  var alvos = [];

  valores.forEach(function (linha, indice) {
    if (!legacyRowHasContent_(linha)) return;
    var projeto = String(linha[coluna - 1] || '').trim().toUpperCase();
    if (projeto === manter) return;
    alvos.push(indice + 2);
  });

  if (!alvos.length) return 0;

  var intervalos = agruparContiguos_(alvos);
  for (var i = intervalos.length - 1; i >= 0; i--) {
    var bloco = intervalos[i];
    // Uma aba precisa sobreviver com pelo menos a linha de cabeçalho; a base
    // ainda é reexpandida por setupPlanilha depois.
    sheet.deleteRows(bloco.inicio, bloco.quantidade);
  }

  if (preservarCabecalhoDeDados && sheet.getMaxRows() < 2) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 2 - sheet.getMaxRows());
  }
  return alvos.length;
}

/** [2,3,4,9,10] → [{inicio:2,quantidade:3},{inicio:9,quantidade:2}] */
function agruparContiguos_(linhas) {
  var intervalos = [];
  var inicio = linhas[0];
  var anterior = linhas[0];
  for (var i = 1; i < linhas.length; i++) {
    if (linhas[i] === anterior + 1) { anterior = linhas[i]; continue; }
    intervalos.push({ inicio: inicio, quantidade: anterior - inicio + 1 });
    inicio = linhas[i];
    anterior = linhas[i];
  }
  intervalos.push({ inicio: inicio, quantidade: anterior - inicio + 1 });
  return intervalos;
}
