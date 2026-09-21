/**
 * Config.js — fonte única de constantes (nomes, cores, listas, extensões).
 * Mantém fidelidade ao Controle_Agil_Kanban.xlsx.
 */

var SHEETS = {
  BASE: 'BASE DE TAREFAS',
  KANBAN: 'KANBAN',
  LISTAS: 'LISTAS',
  RESUMO: 'RESUMO',
  PROJECTS: 'PROJECTS',
  PROJECT_MEMBERS: 'PROJECT_MEMBERS',
  COMMENTS: 'COMMENTS',
  INBOX: 'INBOX_ITEMS',
  ATTACHMENTS: 'ATTACHMENTS',
  BLOCKERS: 'BLOCKERS',
  UAT_RUNS: 'UAT_RUNS',
  ACTIVITY: 'ACTIVITY_EVENTS',
  CALC: 'CALC'
};

// Projeto assumido quando uma linha ou requisição não informa project_id.
// Era 'AG' enquanto a planilha carregava a cópia do controle anterior; depois
// da limpeza dos dados legados, apontar para 'AG' faria toda chamada sem
// projeto explícito mirar um projeto que não existe mais.
var DEFAULT_PROJECT_ID = 'DF';

/**
 * Ordem oficial das colunas do quadro e FONTE ÚNICA de cor de status.
 * Consumida pela planilha (Setup.js), pelo quadro (Kanban.html), pela visão do
 * gestor (Gestor.html) e pelo relatório por e-mail (Relatorio.js).
 *
 * Campos, e por que existe cada um:
 *   header  fundo do cabeçalho na aba KANBAN, sempre com texto BRANCO por cima
 *   light   fundo claro (formatação condicional da planilha e coluna no tema claro)
 *   font    texto sobre `light`
 *   accent  cor viva no tema CLARO: borda do card, faixa e chip. Escurecida o
 *           bastante para a borda alcançar 3:1 sobre card branco — um tom
 *           puro como #F59E0B dava 2,1:1 e sumia, que era a queixa da
 *           "mini linha" apagada
 *   accentDark / tintDark / onDark  os equivalentes do tema ESCURO, onde a
 *           mesma cor precisa clarear em vez de escurecer
 *
 * Todos os pares texto/fundo foram verificados em 4,5:1 e as bordas em 3:1,
 * nos dois temas. Nenhum accent se aproxima das cores de PRIORITY_COLORS, para
 * que status e prioridade não se confundam no mesmo card.
 */
var STATUSES = [
  { name: 'BACKLOG',       header: '#526270', light: '#EDF0F4', font: '#37434F',
    accent: '#52637A', accentDark: '#94A3B8', tintDark: '#1E293B', onDark: '#CBD5E1',
    gestor: 'Na fila' },
  { name: 'NÃO-INICIADO',  header: '#A16207', light: '#FEF3C7', font: '#854D0E',
    accent: '#A16207', accentDark: '#FDE047', tintDark: '#3A2C08', onDark: '#FCD34D',
    gestor: 'A iniciar' },
  { name: 'DEV',           header: '#1D4ED8', light: '#DBEAFE', font: '#1E40AF',
    accent: '#1D4ED8', accentDark: '#60A5FA', tintDark: '#16294F', onDark: '#93C5FD',
    gestor: 'Em desenvolvimento' },
  { name: 'DEVMERGE',      header: '#6D28D9', light: '#EDE9FE', font: '#5B21B6',
    accent: '#6D28D9', accentDark: '#A78BFA', tintDark: '#2C1C54', onDark: '#C4B5FD',
    gestor: 'Pronto, aguardando validação' },
  { name: 'UAT',           header: '#C2410C', light: '#FFEDD5', font: '#9A3412',
    accent: '#EA580C', accentDark: '#FB923C', tintDark: '#41210A', onDark: '#FDBA74',
    gestor: 'Em validação final' },
  { name: 'PRODUÇÃO',      header: '#15803D', light: '#DCFCE7', font: '#14532D',
    accent: '#15803D', accentDark: '#4ADE80', tintDark: '#14331F', onDark: '#86EFAC',
    gestor: 'Entregue' }
];

/**
 * `gestor` é o nome da etapa em português corrente, para quem acompanha de
 * fora: BACKLOG/DEVMERGE/UAT não querem dizer nada para o gestor. O nome
 * técnico continua sendo a chave e segue valendo no quadro de operação.
 */
function statusLabelGestor_(name) {
  for (var i = 0; i < STATUSES.length; i++) {
    if (STATUSES[i].name === name) return STATUSES[i].gestor || STATUSES[i].name;
  }
  return String(name || '');
}

// Prioridade → [fundo, fonte] (formatação condicional da coluna E).
var PRIORITY_COLORS = {
  5: ['#C00000', '#FFFFFF'],
  4: ['#ED7D31', '#FFFFFF'],
  3: ['#FFC000', '#000000'],
  2: ['#9DC3E6', '#000000'],
  1: ['#BFBFBF', '#000000']
};

var RESPONSAVEIS = ['Ricardo', 'Bruno'];

var HEADER_FILL = '#1F4E79';

// Extensão das fórmulas/validações (linhas 2..DATA_ROWS) — amplia o $29 do Excel
// para comportar novas tarefas sem cirurgia de fórmula.
var DATA_ROWS = 1000;

// Capacidade visual por status na aba KANBAN. Mantém folga para crescimento sem
// transformar a planilha derivada em uma réplica integral da base de 1.000 linhas.
var CARD_ROWS = 100;

var BASE_HEADERS = [
  'ID', 'Tarefa', 'Descrição detalhada', 'Subtarefas e critérios de aceite',
  'Prioridade', 'Dificuldade', 'Pontuação combinada', 'Status', 'Responsável',
  'Dependências', 'Observações', 'Data de criação', 'Data de início',
  'Data de conclusão', 'Percentual concluído', 'Versão', 'Excluído em',
  'Excluído por', 'Prazo', 'Project ID', 'Bloco', 'O que testar'
];

var TASK_COLUMNS = {
  ID: 1,
  TITLE: 2,
  DESCRIPTION: 3,
  ACCEPTANCE: 4,
  PRIORITY: 5,
  DIFFICULTY: 6,
  SCORE: 7,
  STATUS: 8,
  ASSIGNEE: 9,
  DEPENDENCIES: 10,
  NOTES: 11,
  CREATED_DATE: 12,
  START_DATE: 13,
  COMPLETED_DATE: 14,
  PERCENT: 15,
  VERSION: 16,
  DELETED_AT: 17,
  DELETED_BY: 18,
  DUE_DATE: 19,
  PROJECT_ID: 20,
  BLOCK: 21,
  TEST_PLAN: 22
};

// Última coluna preservada pelo layout legado (A..T). As colunas acima de
// LEGACY_COLUMN_COUNT são migradas sob demanda por ensureBaseColumns_().
var LEGACY_COLUMN_COUNT = 20;

var TASK_COLUMN_COUNT = BASE_HEADERS.length;

var ACTIVITY_HEADERS = [
  'event_id', 'occurred_at', 'actor', 'source', 'event_type', 'entity_id',
  'project_id', 'before_json', 'after_json', 'correlation_id', 'request_id'
];

var BLOCKER_HEADERS = [
  'blocker_id', 'task_id', 'project_id', 'reason', 'blocked_by', 'blocked_at',
  'unblock_owner', 'resolved_at', 'resolved_by', 'resolution', 'version'
];

var UAT_HEADERS = [
  'uat_id', 'task_id', 'project_id', 'status', 'criteria', 'submitted_by',
  'submitted_at', 'tester', 'decided_by', 'decided_at', 'feedback', 'version'
];

var UAT_OUTCOMES = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

var PROJECT_HEADERS = [
  'project_id', 'name', 'description', 'key_prefix', 'active', 'settings_json',
  'created_at', 'created_by', 'updated_at'
];

var PROJECT_MEMBER_HEADERS = [
  'project_id', 'user_email', 'role', 'active', 'created_at', 'created_by', 'member_id'
];

var COMMENT_HEADERS = [
  'comment_id', 'task_id', 'project_id', 'body', 'author', 'created_at',
  'source', 'version'
];

var INBOX_HEADERS = [
  'inbox_id', 'project_id', 'capture_type', 'raw_text', 'source_url', 'status',
  'suggested_type', 'suggested_title', 'suggested_due_date', 'captured_by',
  'captured_at', 'classified_by', 'classified_at', 'confidence',
  'converted_task_id', 'ai_payload_json', 'version', 'deleted_at'
];

var ATTACHMENT_HEADERS = [
  'attachment_id', 'inbox_id', 'project_id', 'file_url', 'file_name',
  'mime_type', 'size_bytes', 'created_at', 'created_by'
];

var INBOX_CAPTURE_TYPES = ['TEXT', 'AUDIO', 'LINK', 'IMAGE', 'DOCUMENT', 'MEETING_NOTE'];
var INBOX_ITEM_TYPES = [
  'TASK', 'BUG', 'FEATURE', 'IDEA', 'REFERENCE', 'DOCUMENTATION',
  'DECISION', 'MEETING_NOTE', 'BLOCKER'
];
var INBOX_TASK_TYPES = ['TASK', 'BUG', 'FEATURE', 'BLOCKER'];
var INBOX_STATUSES = ['NEW', 'NEEDS_REVIEW', 'READY', 'CONVERTED', 'ARCHIVED', 'ERROR'];

var PROJECT_ROLES = { VIEWER: 'VIEWER', MEMBER: 'MEMBER', MANAGER: 'MANAGER', OWNER: 'OWNER' };

// Membros operacionais confirmados para o projeto inicial. A rotina de garantia
// apenas cria linhas ausentes; nunca reativa nem altera o papel de uma linha já
// administrada na planilha.
// As entradas do projeto AG saíram junto com a limpeza dos dados legados: como
// esta lista é reaplicada a cada setup, mantê-las recriaria os membros do
// projeto antigo logo após apagá-los.
var CONFIGURED_PROJECT_MEMBERS = [
  // O gestor acompanha o MVP Docfinance em leitura. VIEWER é recusado em
  // qualquer mutação por authorizeProject_ — ele vê, não mexe.
  { projectId: 'DF', userEmail: 'geovane.barbosa@altaservicosmedicos.com.br', role: 'VIEWER' },
  { projectId: 'DF', userEmail: 'bruno@altaservicosmedicos.com.br', role: 'OWNER' }
];

// Destinatário padrão do relatório de acompanhamento.
var GESTOR_EMAIL = 'geovane.barbosa@altaservicosmedicos.com.br';

var COMO_USAR = [
  'Preencha apenas na aba BASE DE TAREFAS: Status e Responsável (listas suspensas), Percentual concluído (entre 0% e 100% — ex.: digite 50%), Datas (dd/mm/aaaa), Dependências e Observações.',
  'O quadro KANBAN e a aba RESUMO são recalculados automaticamente por fórmulas — não é necessário editá-los.',
  'Responsáveis permitidos: Ricardo e Bruno. O campo inicia vazio por padrão; no Kanban, tarefas sem responsável aparecem como “Não atribuído”.',
  'A coluna Pontuação combinada = Prioridade × Dificuldade (informativa; a ordenação do Kanban usa prioridade ↓, dificuldade ↑, ID ↑).',
  'Bloqueio é transversal: a tarefa permanece em sua etapa atual. Use o Web Kanban para registrar motivo, responsável pelo desbloqueio e resolução.',
  'Para entrar em UAT, preencha os critérios de aceite. A aprovação envia a tarefa para PRODUÇÃO; a reprovação, com feedback obrigatório, retorna para DEV.',
  'O Web Kanban isola tarefas por projeto. Nas abas derivadas, escolha o projeto em LISTAS!G2; todas as fórmulas de KANBAN e RESUMO respeitam essa seleção.',
  'Saúde do fluxo alerta sobre WIP, SLAs, atraso e inatividade. As regras são consultivas: nunca movem ou alteram tarefas automaticamente.'
];

function statusNames_() {
  return STATUSES.map(function (s) { return s.name; });
}
