/**
 * Data.js — as 28 tarefas originais extraídas de Controle_Agil_Kanban.xlsx.
 * Campos: id, tarefa, desc, sub, p (prioridade), d (dificuldade), status,
 * resp, dep, obs, criacao, inicio, fim, pct. Coluna G (Pontuação) é sempre
 * fórmula e não entra aqui. Campos ausentes = '' (como no Excel).
 */

var TASKS = [
  { id: 'AG-001', tarefa: 'Campo agência/conta com total de dígitos',
    desc: 'Campo agência/conta com total de dígitos.',
    sub: '', p: 5, d: 2, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-002', tarefa: 'Produzir relatórios 13-07 a 17-07 (modelo Sankhya copia-e-cola)',
    desc: 'Produzir relatórios de 13-07 a 17-07 no modelo Sankhya copia-e-cola // validar com Paloma ou Kelly // alimentar plataforma.',
    sub: '', p: 5, d: 2, status: 'NÃO-INICIADO', resp: '', dep: '',
    obs: 'Status original “NÃO INICIADO” normalizado para “NÃO-INICIADO”.' },

  { id: 'AG-003', tarefa: 'Preenchimento de todos os campos em Despesas => Relatórios de pagamento',
    desc: 'Preenchimento de todos os campos em Despesas => Relatórios de pagamento.',
    sub: '', p: 5, d: 3, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-004', tarefa: 'Criar ambiente DEVMERGE',
    desc: 'Criar ambiente DEVMERGE // verificar Cloud Runs // abas // renomear e mapear todos os ambientes.',
    sub: '', p: 4, d: 3, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-005', tarefa: 'Análise de velocidade de importação',
    desc: 'Análise de velocidade de importação.',
    sub: '', p: 4, d: 4, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-006', tarefa: 'Cards das empresas no lugar do dropdown',
    desc: 'Cards das empresas no lugar do dropdown (Total a pagar + nº de médicos vs. plantões).',
    sub: '• Exibir Total a pagar + nº de médicos vs. plantões\n• Garantir total sem erros sobre o total de plantões mostrado corretamente (já prevê default para todas as empresas – alteração conjunta com dropdown → cards individuais)\n• Atualizar card “Com problema”',
    p: 4, d: 4, status: 'DEV', resp: '', dep: '',
    obs: 'Status original “EM ANDAMENTO” normalizado para “DEV”.' },

  { id: 'AG-007', tarefa: 'Estudar e otimizar refreshs – Pagamentos e replicar para demais abas',
    desc: 'Estudar e otimizar refreshs na aba Pagamentos e replicar para as demais abas.',
    sub: '', p: 4, d: 4, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-008', tarefa: 'Bloqueados: desbloqueio, provisão e atrelamento de plantões',
    desc: 'Fluxo de plantões bloqueados: desbloqueio via tela Provisionado, retorno para revisão, atrelamento ao valor original, filtros em Despesas e aplicação de desconto.',
    sub: '• Desbloquear → tela Provisionado (modal com decisão de dividir valor com outra pessoa / por outra empresa / Diversos) → virar provisão\n• Plantão voltar para Revisão (com novo valor) e ser pago na remessa prevista\n• Provisionado recebe uma flag/status que o atrele ao plantão com valor original (estudar a chave/ID necessário para realizar este atrelamento)\n• Em Despesas, usuário ser capaz de verificar e filtrar plantões atrelados independente do tipo de pagamento (Diversos atrelados)\n• Aplicar desconto % ou manual\n• Ideias: coluna com emoji de atrelamento + hover-over com info resumida do plantão + campo de atrelamento no modal de detalhamento\n• Mais ideias: plantões com coluna Valor da despesa = valor a ser pago iguais de uma determinada cor // plantões com divisão de valor/atrelamento mostrados de outra cor para chamar atenção\n• Mostrar sempre valor pago, exceto casos com divisão/atrelamentos/pensão/etc. – mostrar valor pago + valor original da despesa para chamar atenção',
    p: 4, d: 6, status: 'NÃO-INICIADO', resp: '', dep: '',
    obs: 'Dificuldade 6 está fora da escala 1–5; valor mantido conforme o texto original. Corrigido “atrealemento” → “atrelamento”.' },

  { id: 'AG-009', tarefa: 'Mapear empresa pagadora de plantões QG (Alta Saúde)',
    desc: 'Mapear empresa pagadora de plantões QG (Alta Saúde).',
    sub: '', p: 3, d: 1, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-010', tarefa: 'Filtros À vista/Antecipado/Mensal: nº de plantões em cada oblongo',
    desc: 'Filtros À vista/Antecipado/Mensal: garantir que o número de plantões apareça em cada oblongo correspondente.',
    sub: '', p: 3, d: 1, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-011', tarefa: 'Pronto para Enviar: cards com valor com desconto OP',
    desc: 'Em Pronto para Enviar, cards mostrarem valor com desconto OP e garantir que isso não interfira na geração da remessa e nem na escrita em Despesas.',
    sub: '', p: 3, d: 2, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-012', tarefa: 'Transcrever padronização (tipos/subtipos/status de despesas)',
    desc: 'Transcrever padronização (tipos/subtipos/status de despesas, entre outros) baseado na aba Validações.',
    sub: '', p: 3, d: 4, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-013', tarefa: 'Criar aba de Provisão',
    desc: 'Criar aba de Provisão com comparação entre valor previsto vs. real.',
    sub: '• Cada provisão gera um ID (Mensal Alta Saúde julho, Antecipado Kros SP agosto, etc.)\n• A aba Despesas recebe uma linha desta provisão com o valor lançado\n• Usuário, ao iniciar uma remessa que corresponda a uma destas provisões (após import e revisão), atrela o ID correspondente\n• Ao conciliar, o sistema apaga a linha de Despesas, substituindo-a pelos valores e linha de pagamentos reais, e também lança o valor na aba Provisão para comparação entre valor previsto vs. real',
    p: 3, d: 5, status: 'NÃO-INICIADO', resp: '', dep: '',
    obs: 'Corrigido “comapração” → “comparação”.' },

  { id: 'AG-014', tarefa: 'Automatizar conferência do extrato pós-remessa',
    desc: 'Automatizar conferência do extrato pós-remessa (operação copia e cola do financeiro no Santander).',
    sub: '', p: 2, d: 2, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-015', tarefa: 'Arrumar modal Desbloquear Médicos',
    desc: 'Arrumar modal Desbloquear Médicos: texto + selecionar todas + trocar origem do import para DADOS_BANCO + melhorar velocidade.',
    sub: '', p: 2, d: 3, status: 'NÃO-INICIADO', resp: '', dep: '', obs: '' },

  { id: 'AG-016', tarefa: 'Fazer backup recorrente em Despesas PROD',
    desc: 'Fazer backup recorrente em Despesas PROD.',
    sub: '', p: 1, d: 1, status: 'NÃO-INICIADO', resp: '', dep: '',
    obs: 'Notação original “1X1” interpretada como 1x1.' },

  { id: 'AG-017', tarefa: 'Agendamento de job para pasta das francesinhas + botão de automação de decisões',
    desc: 'Agendamento de job para abrir a pasta com as francesinhas e também um botão para automatizar a tomada de decisões, visando também utilizar o extrato.',
    sub: '', p: 1, d: 5, status: 'NÃO-INICIADO', resp: '', dep: '',
    obs: 'Corrigidos erros de digitação: “tambme” → “também”, “botao” → “botão”, “decisoes” → “decisões”.' },

  { id: 'AG-018', tarefa: 'Task de testes gerais + fechamento da semana',
    desc: 'Task de testes gerais + fechamento da semana.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-019', tarefa: 'Verificar ZZZPONTO STA MED (Joyce Camila Lima)',
    desc: 'Verificar: ZZZPONTO STA MED (Joyce Camila Lima) – limitar dropdown = lista de empresas pagadoras // verificar guia Sócios: grafia diferente/variações/etc.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '',
    obs: 'Corrigido “empregas” → “empresas”.' },

  { id: 'AG-020', tarefa: 'Modelar tratamento de extrato para conferência (a partir do Excel)',
    desc: 'A partir do Excel, modelar tratamento de extrato para conferência.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-021', tarefa: 'Irany – bloqueio',
    desc: 'Irany bloqueio.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-022', tarefa: 'Criar ambiente UAT',
    desc: 'Criar ambiente UAT.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-023', tarefa: 'Testar francesinhas – sexta 17-07 + validações via Sankhya',
    desc: 'Testar francesinhas – sexta 17-07 + validar pagtos. manuais/à parte via Sankhya em Despesas PROD + conciliação aba Diversos + FOPA.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-024', tarefa: 'Mostrar dados bancários como em Dados Qualificação',
    desc: 'Mostrar dados bancários como em Dados Qualificação (telas Em Revisão e Pronto para Enviar).',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-025', tarefa: 'Dados bancários agrupado no Pronto para Enviar',
    desc: 'Dados bancários agrupado no Pronto para Enviar.',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-026', tarefa: 'Ao editar valor de provisão, mudar status para “A vencer”',
    desc: 'Ao editar valor de uma provisão, mudar o status de provisão para “A vencer” – estudar essas mudanças de status em relação aos alertas/avisos + campo de status editável para o usuário (não incluindo “Pago”).',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-027', tarefa: 'Perguntar código de convênio Alta Participações',
    desc: 'Perguntar código de convênio Alta Participações (exemplo: NUHU, H2BC).',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' },

  { id: 'AG-028', tarefa: 'Botão export Despesas para Sheets',
    desc: 'Botão export Despesas para Sheets (controle de acesso/permissões).',
    sub: '', p: '', d: '', status: 'BACKLOG', resp: '', dep: '', obs: '' }
];
