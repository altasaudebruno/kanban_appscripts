/**
 * Relatorio.js — relatório de acompanhamento por e-mail para o gestor.
 *
 * Disparo é sempre manual (botão do quadro ou menu da planilha). Não há
 * gatilho automático: e-mail que sai sozinho é e-mail que um dia sai errado
 * sem ninguém perceber.
 *
 * O conteúdo é o mesmo retrato da visão do gestor, escrito para ser lido no
 * celular por quem não abre o Kanban: sem jargão de coluna, sem ID de tarefa
 * como protagonista, com o estado de cada bloco em português.
 */

function enviarRelatorioAoGestor(destinatario, projectId) {
  return enviarRelatorio_({
    projectId: projectId,
    destinatario: destinatario || GESTOR_EMAIL,
    prefixoAssunto: '',
    eventType: 'report.sent_to_manager',
    teste: false
  });
}

/** Versão do botão do quadro: usa o destinatário padrão. */
function enviarRelatorioAoGestorPadrao(projectId) {
  return enviarRelatorioAoGestor(GESTOR_EMAIL, projectId);
}

/**
 * Mesmo relatório, enviado para quem clicou — para conferir como ele chega
 * antes de mandar ao gestor. Não toca no destinatário padrão e entra na
 * trilha como teste, para não contar como envio ao gestor.
 */
function enviarRelatorioTeste(projectId) {
  var eu = currentUserEmail_();
  if (!eu) {
    throw new Error('Não foi possível identificar seu e-mail para enviar o teste.');
  }
  return enviarRelatorio_({
    projectId: projectId,
    destinatario: eu,
    prefixoAssunto: '[TESTE] ',
    eventType: 'report.test_sent',
    teste: true
  });
}

function enviarRelatorio_(opcoes) {
  var view = getManagerView(opcoes.projectId || '');

  // Disparar e-mail em nome do projeto é ação de quem opera o quadro, não de
  // quem só o acompanha: VIEWER é recusado aqui, como em qualquer escrita.
  // A execução roda como o usuário que clicou — sem esta guarda, o próprio
  // gestor enviaria o relatório de si para si, gastando a cota dele.
  authorizeProject_(view.project.id, true);

  var para = String(opcoes.destinatario || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) {
    throw new Error('E-mail do destinatário inválido: ' + para);
  }

  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('A cota diária de e-mails desta conta acabou. Tente novamente amanhã.');
  }

  var assunto = (opcoes.prefixoAssunto || '') + 'Acompanhamento ' + view.project.name +
    ' — ' + relDataCurta_(view.today) + ' · ' + view.totals.pct + '% concluído';

  MailApp.sendEmail({
    to: para,
    subject: assunto,
    htmlBody: montarRelatorioHtml_(view, opcoes.teste),
    body: montarRelatorioTexto_(view, opcoes.teste),
    name: 'Kanban — Alta Serviços Médicos'
  });

  // A partir daqui o e-mail JÁ SAIU. Uma falha ao gravar a trilha não pode
  // virar "não foi possível enviar" na tela de quem clicou.
  var registrado = true;
  try {
    recordActivity_(opcoes.eventType, view.project.id, null, {
      projectId: view.project.id, to: para, pct: view.totals.pct, teste: !!opcoes.teste
    }, { source: opcoes.teste ? 'report:test' : 'report:email', projectId: view.project.id });
  } catch (ignored) {
    registrado = false;
  }

  return {
    ok: true, destinatario: para, projectId: view.project.id,
    assunto: assunto, pct: view.totals.pct, registrado: registrado,
    teste: !!opcoes.teste,
    enviadoEm: toIsoDateTime_(new Date())
  };
}

// ------------------------------------------------------------------ corpo ----

var REL_CORES = {
  'CONCLUÍDO': '#15803d', 'EM ANDAMENTO': '#0369a1', 'PARCIAL': '#0369a1',
  'ATRASADO': '#b91c1c', 'HOJE': '#a16207', 'PREVISTO': '#64748b',
  'NÃO INICIADO': '#64748b', 'SEM TAREFAS': '#94a3b8'
};

var REL_ROTULOS = {
  'CONCLUÍDO': 'Concluído', 'EM ANDAMENTO': 'Em andamento', 'PARCIAL': 'Parcialmente feito',
  'ATRASADO': 'Atrasado', 'HOJE': 'É hoje', 'PREVISTO': 'Ainda não começou',
  'NÃO INICIADO': 'Não iniciado', 'SEM TAREFAS': 'Sem tarefas'
};

var REL_ETAPAS = {
  'BACKLOG': 'na fila', 'NÃO-INICIADO': 'a começar', 'DEV': 'em desenvolvimento',
  'DEVMERGE': 'em integração', 'UAT': 'em validação', 'PRODUÇÃO': 'entregue'
};

function relRotulo_(estado) { return REL_ROTULOS[estado] || estado; }
function relCor_(estado) { return REL_CORES[estado] || '#64748b'; }
function relEtapa_(status) { return REL_ETAPAS[status] || String(status || '').toLowerCase(); }

/**
 * Chip de etapa na cor do status, usando a paleta que veio com a view — a
 * mesma do quadro e da visão do gestor. Cliente de e-mail não lê custom
 * properties nem <style>, então o estilo vai inline e na variante CLARA,
 * que é o fundo do e-mail.
 */
function relChipEtapa_(statuses, status) {
  var s = null;
  (statuses || []).forEach(function (item) { if (item.name === status) s = item; });
  var texto = relEsc_(relEtapa_(status));
  if (!s) return '<span style="color:#64748b">' + texto + '</span>';
  return '<span style="display:inline-block;background:' + (s.light || '#F1F5F9') +
    ';color:' + (s.font || '#334155') +
    ';border:1px solid ' + (s.accent || '#94A3B8') +
    ';border-radius:999px;padding:1px 9px;font-size:11.5px;font-weight:700">' +
    texto + '</span>';
}

function relEsc_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relDataCurta_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] : '—';
}

/**
 * A trilha de auditoria grava em UTC (toIsoDateTime_ usa 'Z'). Exibir esse
 * texto cru mostraria 3 horas a mais do que o relógio de quem lê, então a
 * conversão para o fuso do script acontece aqui, na apresentação.
 */
function relDataHora_(iso) {
  var texto = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(texto)) return 'sem registro';
  var data = new Date(texto);
  if (isNaN(data.getTime())) return 'sem registro';
  return Utilities.formatDate(data, Session.getScriptTimeZone(), "dd/MM 'às' HH'h'mm");
}

/** Data de um instante em UTC, já no fuso local. */
function relDataDeInstante_(iso) {
  var texto = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(texto)) return '';
  var data = new Date(texto);
  if (isNaN(data.getTime())) return '';
  return Utilities.formatDate(data, Session.getScriptTimeZone(), 'dd/MM');
}

function relBarra_(pct, cor) {
  var largura = Math.max(0, Math.min(100, Number(pct) || 0));
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
    'style="background:#e2e8f0;border-radius:6px;height:8px;line-height:8px"><tr>' +
    '<td width="' + largura + '%" style="background:' + cor + ';border-radius:6px;height:8px;' +
    'line-height:8px;font-size:0">&nbsp;</td><td>&nbsp;</td></tr></table>';
}

function montarRelatorioHtml_(view, teste) {
  var F = 'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif';
  var h = [];

  h.push('<div style="' + F + ';background:#f1f5f9;padding:20px 12px;margin:0">');
  h.push('<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;' +
    'overflow:hidden;border:1px solid #e2e8f0">');

  // Uma cópia de teste não pode ser confundida com o relatório que o gestor
  // recebe — nem por quem a encaminha depois.
  if (teste) {
    h.push('<div style="background:#a16207;color:#ffffff;padding:10px 24px;font-size:12px;' +
      'font-weight:700;letter-spacing:.6px;text-transform:uppercase">' +
      'Cópia de teste — o gestor não recebeu este e-mail</div>');
  }

  // Cabeçalho
  h.push('<div style="background:#1F4E79;padding:22px 24px;color:#ffffff">' +
    '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.75">' +
    'Acompanhamento do projeto</div>' +
    '<div style="font-size:21px;font-weight:700;margin-top:4px">' + relEsc_(view.project.name) + '</div>' +
    '<div style="font-size:13px;opacity:.85;margin-top:6px">Situação em ' +
    relEsc_(relDataCurta_(view.today)) +
    (view.goLive ? ' · piloto marcado para ' + relEsc_(relDataCurta_(view.goLive)) : '') +
    '</div></div>');

  if (view.avisoProjeto) {
    h.push('<div style="margin:18px 24px 0;padding:13px 15px;background:#fef2f2;' +
      'border:1px solid #fecaca;border-radius:10px;font-size:13px;color:#991b1b;' +
      'line-height:1.5">' + relEsc_(view.avisoProjeto) + '</div>');
  }

  // Resumo em uma frase
  var t = view.totals;
  var frase = t.pct >= 100
    ? 'Tudo que estava planejado já foi entregue.'
    : view.inFlight.length
      ? 'Há ' + view.inFlight.length + ' tarefa(s) em andamento neste momento.'
      : 'Nenhuma tarefa está em andamento agora.';
  if (view.blocked.length) {
    frase += ' ' + view.blocked.length + ' está(ão) parada(s) esperando alguma resposta.';
  }

  h.push('<div style="padding:22px 24px 6px">');
  h.push('<div style="font-size:15px;color:#0f172a;line-height:1.55">' +
    '<strong>' + t.pct + '% do plano concluído</strong> — ' + t.done + ' de ' + t.total +
    ' tarefas entregues. ' + relEsc_(frase) + '</div>');
  h.push('<div style="margin:14px 0 4px">' + relBarra_(t.pct, '#1F4E79') + '</div>');
  h.push('<div style="font-size:12px;color:#64748b">Última movimentação registrada: ' +
    relEsc_(relDataHora_(view.lastUpdate)) + '</div>');
  h.push('</div>');

  // O que está acontecendo hoje
  if (view.todayCheckpoint) {
    h.push('<div style="margin:18px 24px;padding:14px 16px;background:#fffbeb;' +
      'border:1px solid #fde68a;border-radius:10px">' +
      '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.7px;' +
      'color:#a16207;font-weight:700">O que está previsto para hoje</div>' +
      '<div style="font-size:14px;color:#0f172a;margin-top:5px;line-height:1.5">' +
      relEsc_(view.todayCheckpoint.meta) + '</div>' +
      '<div style="font-size:12px;color:#854d0e;margin-top:5px">Etapas de hoje: ' +
      relEsc_(view.todayCheckpoint.blocks.join(' e ')) + ' · ' +
      view.todayCheckpoint.pct + '% pronto</div></div>');
  }

  // Progresso por bloco
  h.push(relTituloSecao_('Como está cada etapa'));
  h.push('<div style="padding:0 24px">');
  view.blocks.forEach(function (b) {
    var cor = relCor_(b.state);
    h.push('<div style="padding:12px 0;border-top:1px solid #e2e8f0">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td style="' + F + ';font-size:14px;font-weight:700;color:#0f172a">' + relEsc_(b.id) + '</td>' +
      '<td align="right" style="' + F + ';font-size:13px;font-weight:700;color:' + cor + '">' +
      b.pct + '%</td></tr></table>' +
      '<div style="margin:7px 0 6px">' + relBarra_(b.pct, cor) + '</div>' +
      '<div style="font-size:12px;color:#475569">' +
      '<span style="color:' + cor + ';font-weight:700">' + relEsc_(relRotulo_(b.state)) + '</span>' +
      ' · ' + b.done + ' de ' + b.total + ' entregues' +
      (b.blocked ? ' · <span style="color:#b91c1c;font-weight:700">' + b.blocked +
        ' parada(s)</span>' : '') +
      ' · ' + (b.lastUpdate ? 'mexido em ' + relEsc_(relDataHora_(b.lastUpdate))
        : 'ainda sem movimentação') +
      '</div></div>');
  });
  h.push('</div>');

  // Em andamento
  h.push(relTituloSecao_('Em que ele está trabalhando agora'));
  h.push('<div style="padding:0 24px">');
  if (view.inFlight.length) {
    view.inFlight.forEach(function (task) {
      h.push('<div style="padding:11px 0;border-top:1px solid #e2e8f0">' +
        '<div style="font-size:14px;color:#0f172a;line-height:1.45">' +
        relEsc_(task.title) + '</div>' +
        '<div style="font-size:12px;color:#64748b;margin-top:5px">' +
        relChipEtapa_(view.statuses, task.status) + ' &nbsp;' +
        relEsc_(task.bloco || 'sem etapa') +
        (task.dueDate ? ' · previsto para ' + relEsc_(relDataCurta_(task.dueDate)) : '') +
        '</div></div>');
    });
  } else {
    h.push('<div style="padding:11px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b">' +
      'Nada em andamento neste momento.</div>');
  }
  h.push('</div>');

  // Bloqueios
  if (view.blocked.length) {
    h.push(relTituloSecao_('Esperando resposta para destravar'));
    h.push('<div style="padding:0 24px">');
    view.blocked.forEach(function (item) {
      h.push('<div style="padding:11px 0;border-top:1px solid #e2e8f0">' +
        '<div style="font-size:14px;color:#0f172a">' + relEsc_(item.title) + '</div>' +
        '<div style="font-size:12px;color:#b91c1c;margin-top:3px">' + relEsc_(item.reason) +
        (item.since ? ' · desde ' + relEsc_(relDataDeInstante_(item.since)) : '') + '</div></div>');
    });
    h.push('</div>');
  }

  // Calendário até o piloto
  if (view.checkpoints.length) {
    h.push(relTituloSecao_('Calendário até o piloto'));
    h.push('<div style="padding:0 24px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="' + F + ';font-size:13px;border-collapse:collapse">');
    view.checkpoints.forEach(function (cp) {
      var cor = relCor_(cp.state);
      var destaque = cp.state === 'HOJE' ? 'background:#fffbeb;' : '';
      h.push('<tr style="' + destaque + '">' +
        '<td style="padding:9px 8px 9px 0;border-top:1px solid #e2e8f0;white-space:nowrap;' +
        'color:#0f172a;font-weight:700;width:52px">' + relEsc_(relDataCurta_(cp.date)) + '</td>' +
        '<td style="padding:9px 8px;border-top:1px solid #e2e8f0;color:#475569;line-height:1.45">' +
        relEsc_(cp.meta) + '</td>' +
        '<td align="right" style="padding:9px 0 9px 8px;border-top:1px solid #e2e8f0;' +
        'white-space:nowrap;color:' + cor + ';font-weight:700">' +
        relEsc_(relRotulo_(cp.state)) + '</td></tr>');
    });
    h.push('</table></div>');
  }

  h.push('<div style="padding:20px 24px 26px;margin-top:12px;border-top:1px solid #e2e8f0;' +
    'font-size:11.5px;color:#94a3b8;line-height:1.55">' +
    'Retrato gerado automaticamente a partir do quadro de tarefas em ' +
    relEsc_(relDataHora_(view.generatedAt)) + '. ' +
    'Os percentuais consideram o andamento de cada tarefa, não apenas as concluídas.' +
    '</div>');

  h.push('</div></div>');
  return h.join('');
}

function relTituloSecao_(texto) {
  return '<div style="padding:22px 24px 2px;font-size:12px;text-transform:uppercase;' +
    'letter-spacing:.8px;color:#64748b;font-weight:700">' + relEsc_(texto) + '</div>';
}

/** Alternativa em texto puro, para cliente de e-mail que não renderiza HTML. */
function montarRelatorioTexto_(view, teste) {
  var linhas = [];
  if (teste) {
    linhas.push('*** CÓPIA DE TESTE — o gestor não recebeu este e-mail ***');
    linhas.push('');
  }
  linhas.push(view.project.name);
  linhas.push('Situação em ' + relDataCurta_(view.today));
  linhas.push('');
  linhas.push(view.totals.pct + '% do plano concluído (' + view.totals.done +
    ' de ' + view.totals.total + ' tarefas entregues).');
  linhas.push('Última movimentação: ' + relDataHora_(view.lastUpdate) + '.');

  if (view.todayCheckpoint) {
    linhas.push('');
    linhas.push('PREVISTO PARA HOJE');
    linhas.push('  ' + view.todayCheckpoint.meta);
  }

  linhas.push('');
  linhas.push('COMO ESTÁ CADA ETAPA');
  view.blocks.forEach(function (b) {
    linhas.push('  ' + b.id + ' — ' + b.pct + '% · ' + relRotulo_(b.state) +
      ' (' + b.done + '/' + b.total + ')');
  });

  linhas.push('');
  linhas.push('EM ANDAMENTO AGORA');
  if (view.inFlight.length) {
    view.inFlight.forEach(function (task) {
      linhas.push('  ' + task.title + ' — ' + relEtapa_(task.status) +
        (task.dueDate ? ', previsto para ' + relDataCurta_(task.dueDate) : ''));
    });
  } else {
    linhas.push('  Nada em andamento neste momento.');
  }

  if (view.blocked.length) {
    linhas.push('');
    linhas.push('ESPERANDO RESPOSTA');
    view.blocked.forEach(function (item) {
      linhas.push('  ' + item.title + ' — ' + item.reason);
    });
  }

  linhas.push('');
  linhas.push('Gerado em ' + relDataHora_(view.generatedAt) + '.');
  return linhas.join('\n');
}
