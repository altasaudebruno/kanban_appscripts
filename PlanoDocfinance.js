/**
 * PlanoDocfinance.js — seed do MVP "Consultoria Docfinance" (projeto DF).
 *
 * Origem: docs/execucao.md e docs/specs/SPEC-B00..B07 do repositório
 * Consultoria-Docfinance. Cada item traz o que entregar, os critérios de
 * aceite e — o que o quadro não tinha — o que testar no dia para provar
 * que a entrega está de pé.
 *
 * São 80 tarefas: B00 7, B01 10, B02 10, B03 9, B04 12, B05 10, B06 10, B07 12.
 *
 * Carregar com: menu Kanban → "Carregar planejamento Docfinance",
 * ou `clasp run-function carregarPlanejamentoDocfinance`.
 * É idempotente por título: rodar duas vezes não duplica nada.
 */

var PLAN_SEEDS = {
  DF: {
    projectName: 'Consultoria Docfinance — MVP',
    description: 'MVP de consultoria financeira. Piloto com cliente real em 01/10/2026.',
    tasks: [

      // ------------------------------------------------------------ B00 ----
      { bloco: 'B00', dueDate: '2026-09-21', prioridade: 5, dificuldade: 2, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T1 · Ratificar os defaults P1–P7 em decisoes.md',
        descricao: 'Percorrer os 7 defaults adotados sob pressa (região GCP, porte do SQL, provedor de identidade, N PJs, metas, stack, deploy) e marcar cada um como confirmado, alterado ou provisório consciente.',
        subtarefas: '• B00-AC01 atendido\n• Cada default P1–P7 com status explícito e data\n• docs/discovery/decisoes.md é a fonte de verdade\n• Nenhum item "a definir" sem dono',
        oQueTestar: 'Abrir docs/discovery/decisoes.md e conferir que os 7 itens têm status explícito + data. Nenhum "a definir" sem dono.' },

      { bloco: 'B00', dueDate: '2026-09-21', prioridade: 5, dificuldade: 2, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T2 · DECISÃO: recuperação de MFA da equipe',
        descricao: 'D24 fechou que não há Workspace, então admin e consultor usam MFA TOTP próprio. Falta definir como recuperar um TOTP perdido, por processo auditado e sem backdoor de administrador.',
        subtarefas: '• Método escrito e auditável\n• Sem backdoor de admin\n• Refletido na SPEC-B02',
        oQueTestar: 'Simular o caso "consultor perdeu o celular" e verificar que o documento responde: quem autoriza, o que fica registrado e em quanto tempo.' },

      { bloco: 'B00', dueDate: '2026-09-22', prioridade: 2, dificuldade: 1, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T3 · DECISÃO: domínio, DNS e remetente de e-mail transacional',
        descricao: 'Definir app.docfinance.com.br (ou similar), quem administra o DNS e qual o remetente. Não bloqueia o piloto, porque o convite é assistido.',
        subtarefas: '• Domínio e responsável registrados\n• OU "adiado — convite assistido" registrado explicitamente',
        oQueTestar: 'Confirmar que o plano de 01/10 funciona sem e-mail automático: o admin copia o link do convite à mão.' },

      { bloco: 'B00', dueDate: '2026-09-22', prioridade: 3, dificuldade: 1, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T4 · DECISÃO: teto mensal de infra em BRL e alertas 50/80/100%',
        descricao: 'Fixar o teto mensal para configurar os budget alerts do GCP no B07.',
        subtarefas: '• Valor em BRL registrado\n• Alertas 50/80/100% planejados para o B07',
        oQueTestar: 'Conferir que o valor cobre o cenário db-g1-small (~USD 46/mês) mais dois Cloud Run, com folga.' },

      { bloco: 'B00', dueDate: '2026-09-22', prioridade: 3, dificuldade: 2, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T5 · DECISÃO: revisores no GitHub e política de aprovação de PR/deploy',
        descricao: 'Listar as contas reais da organização, definir CODEOWNERS e quem aprova deploy de produção.',
        subtarefas: '• Nomes/contas registrados\n• Política de aprovação escrita\n• CODEOWNERS definido',
        oQueTestar: 'Abrir um PR de teste e verificar se o revisor definido consegue aprovar e se a proteção da main é aplicável no plano atual.' },

      { bloco: 'B00', dueDate: '2026-09-22', prioridade: 5, dificuldade: 1, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T6 · GATE: autorização para provisionar recursos no GCP',
        descricao: 'Ordem explícita do solicitante para criar a instância SQL, os 2 Cloud Run e os segredos. É o portão do fim do B01: nada é criado antes dela.',
        subtarefas: '• B00-AC03 atendido\n• Ordem datada e registrada ANTES de qualquer gcloud create',
        oQueTestar: 'Conferir que nenhum recurso novo existe antes da ordem: gcloud sql instances list e gcloud run services list. Confirmar que nada de doc-finance/empréstimos foi tocado.' },

      { bloco: 'B00', dueDate: '2026-09-21', prioridade: 4, dificuldade: 2, status: 'NÃO-INICIADO', responsavel: 'Bruno',
        tarefa: 'B00-T7 · Auditar contratos congelados contra decisões ainda abertas',
        descricao: 'Varrer B02 e B04 atrás de referência a decisão ainda aberta que esteja sendo tratada como fechada.',
        subtarefas: '• B00-AC02 atendido\n• Cada pendência marcada como pendente, não assumida',
        oQueTestar: 'Buscar nos specs B02/B04 por pendências e checar que cada uma está explicitamente marcada como pendente.' },

      // ------------------------------------------------------------ B01 ----
      { bloco: 'B01', dueDate: '2026-09-21', prioridade: 5, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T1 · Scaffold Next.js + TS estrito + módulos + Prisma/Postgres 16',
        descricao: 'Monólito modular em src/modules/ (identidade, carteira, financeiro, patrimonio-metas, reunioes, operacao). App na raiz do repositório, sem monorepo.',
        subtarefas: '• B01-AC06: lint e typecheck limpos, sem supressão injustificada\n• Dinheiro em centavos, ID cuid, pt-BR, UTC\n• As 6 pastas de módulo existem',
        oQueTestar: 'npm run lint && npm run typecheck → zero erro. Conferir que as 6 pastas de módulo existem.' },

      { bloco: 'B01', dueDate: '2026-09-21', prioridade: 5, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T2 · Docker Compose: app + Postgres + seed com um comando',
        descricao: 'Subida local documentada no README, seed sintético, nenhum dado real em desenvolvimento.',
        subtarefas: '• B01-AC01 atendido\n• Clone limpo sobe com um comando\n• Seed sintético, sem dado real',
        oQueTestar: 'Em um clone limpo, rodar docker compose up e abrir a app no navegador com os dados de seed presentes.' },

      { bloco: 'B01', dueDate: '2026-09-21', prioridade: 5, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T3 · Migrations Prisma versionadas e seed idempotente',
        descricao: 'Nenhuma alteração de schema fora de migration. O seed nunca roda em produção.',
        subtarefas: '• B01-AC04: migrate + seed duas vezes dá o mesmo resultado\n• Sem duplicação de linhas',
        oQueTestar: 'Rodar prisma migrate deploy e o seed duas vezes seguidas e comparar a contagem de linhas das tabelas: tem que ser idêntica.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 4, dificuldade: 2, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T4 · Health check /api/health com checagem de banco',
        descricao: 'Responde o estado e a release/commit, sem dado sensível e sem stack trace.',
        subtarefas: '• B01-AC03: ok com banco vivo\n• Falha limpa com banco derrubado, sem stack trace',
        oQueTestar: 'curl localhost:3000/api/health. Depois docker compose stop db e repetir: erro limpo, sem stack trace.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 5, dificuldade: 4, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T5 · Tokens de design, componentes base e catálogo /design',
        descricao: 'Button, Input, MoneyInput, DateInput, Select, FormField, Dialog/ConfirmDialog, Table com estratégia mobile, Empty/Loading/ErrorState e feedback de salvamento. Regra: tela nova só usa o catálogo.',
        subtarefas: '• B01-AC02: tudo renderiza em desktop e em 360/390 px\n• Contraste azul-marinho/dourado verificado',
        oQueTestar: 'Abrir /design no desktop e no DevTools em 360 px e 390 px. Conferir cada variante e o contraste.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 5, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T6 · MoneyInput com ida-e-volta em centavos',
        descricao: 'Parse pt-BR (1.234,56), persistência como inteiro e reexibição idêntica. Float é proibido.',
        subtarefas: '• B01-AC07: R$ 1.234,56 → 123456 centavos → R$ 1.234,56\n• Nenhum uso de Float para dinheiro',
        oQueTestar: 'Digitar 1.234,56 no /design, salvar, recarregar. Conferir no banco que o valor está gravado como 123456.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 4, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T7 · Dialog acessível: foco, Escape e retorno de foco',
        descricao: 'Foco inicial, contenção do foco, Escape fecha, rolagem interna e comportamento móvel.',
        subtarefas: '• B01-AC08 atendido\n• Tab não escapa do modal\n• Foco volta ao botão que abriu',
        oQueTestar: 'Abrir um Dialog em /design usando só o teclado: Tab não escapa do modal, Esc fecha, o foco volta ao botão de origem.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 4, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T8 · CI no GitHub Actions: lint, typecheck, testes e build de container',
        descricao: 'O PR falha em qualquer violação. A imagem precisa buildar e subir respondendo o health.',
        subtarefas: '• B01-AC05 e B01-AC09 atendidos\n• PR com erro de lint fica vermelho\n• Imagem builda e responde /api/health',
        oQueTestar: 'Abrir um PR com erro proposital de lint: CI vermelho. Corrigir: CI verde. Rodar docker build e bater no health da imagem.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 5, dificuldade: 3, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T9 · Scripts de deploy (esqueleto) com guarda de recursos proibidos',
        descricao: 'Cloud Build para Cloud Run dev/prod (consultoria-docfinance-dev e -prod). Nada é provisionado sem a ordem do B00-T6.',
        subtarefas: '• B01-AC10: script falha ANTES de agir se apontado para doc-finance/empréstimos\n• Guarda testada, não só escrita',
        oQueTestar: 'Executar o script com alvo doc-finance e confirmar que aborta imediatamente, sem chamar o GCP.' },

      { bloco: 'B01', dueDate: '2026-09-22', prioridade: 4, dificuldade: 4, status: 'NÃO-INICIADO', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B01-T10 · Fundação de observabilidade: auditoria, eventos e logger',
        descricao: 'Tabela de auditoria (ator, papel, org, entidade, ação, instante, versão), tabela de eventos com envelope padronizado, logger com correlation ID e validação de env no boot.',
        subtarefas: '• Nenhum nome, e-mail, valor ou token em eventos e logs\n• Env inválida derruba o boot ruidosamente',
        oQueTestar: 'Remover uma variável obrigatória do .env e confirmar que a app falha no boot com mensagem clara. Inspecionar uma linha de log: tem correlation ID e nenhum dado pessoal.' },

      // ------------------------------------------------------------ B02 ----
      { bloco: 'B02', dueDate: '2026-09-23', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T1 · Firebase/Identity Platform com tenants dev e prod separados',
        descricao: 'Cookie de sessão HttpOnly/Secure/SameSite verificado no servidor a cada requisição. A app valida que o token pertence ao tenant do ambiente.',
        subtarefas: '• B02-AC08: token do tenant dev é rejeitado em prod\n• Verificação no servidor, a cada requisição',
        oQueTestar: 'Fazer login em dev, pegar o token e apresentá-lo ao ambiente de prod: tem que ser negado.' },

      { bloco: 'B02', dueDate: '2026-09-23', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T2 · Modelo Identity/Member/Invitation e migration',
        descricao: 'Papel admin|consultant|client, um papel por identidade no piloto, hash do token (nunca o token em claro) e unicidades.',
        subtarefas: '• Rollback não reativa token consumido\n• Senha e token de reset só existem no provedor\n• Só hash persistido',
        oQueTestar: 'Consultar a tabela de convites no banco e confirmar que só existe hash, nunca o token legível.' },

      { bloco: 'B02', dueDate: '2026-09-23', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T3 · Convite: criar, reenviar e revogar (admin)',
        descricao: 'Token de uso único, expiração de 7 dias a confirmar, reenvio invalida o anterior. Entrega assistida no piloto.',
        subtarefas: '• B02-AC01: token não funciona duas vezes\n• B02-AC02: expirado/revogado mostra estado claro sem revelar o destinatário',
        oQueTestar: 'Aceitar um convite e tentar reusar o mesmo link: bloqueado. Abrir um convite expirado e outro revogado: mensagens claras, sem nome do destinatário.' },

      { bloco: 'B02', dueDate: '2026-09-23', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T4 · Aceite transacional do convite (identidade → membro → vínculo)',
        descricao: 'Uma transação só, token consumido. Login com Google não concede papel por si.',
        subtarefas: '• B02-AC01 atendido\n• Identidade sem convite aceito não recebe dado nenhum',
        oQueTestar: 'Logar com uma conta Google qualquer, sem convite, e confirmar que não há carteira nem ficha acessível.' },

      { bloco: 'B02', dueDate: '2026-09-23', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T5 · Login, logout e reset com respostas neutras e rate limit',
        descricao: 'Erro genérico de credencial, "esqueci a senha" com confirmação neutra e bloqueio progressivo.',
        subtarefas: '• B02-AC06, AC07 e AC10 atendidos\n• Respostas indistinguíveis para e-mail existente e inexistente\n• Reset revoga sessões antigas',
        oQueTestar: 'Pedir reset para um e-mail real e um inventado e comparar as duas respostas (texto e tempo). Depois errar a senha N vezes e ver o bloqueio.' },

      { bloco: 'B02', dueDate: '2026-09-24', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T6 · Guarda de autorização central: papel e vínculo só do banco',
        descricao: 'Rejeitar role, organization e consultant_id vindos do corpo da requisição em toda operação.',
        subtarefas: '• B02-AC04: mass assignment não muda privilégio\n• Papel e vínculo lidos sempre do banco',
        oQueTestar: 'Enviar por curl/DevTools um POST com "role":"admin" no corpo e confirmar que o campo é ignorado ou rejeitado e o privilégio não muda.' },

      { bloco: 'B02', dueDate: '2026-09-24', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T7 · Suspensão e reativação com efeito imediato em sessão viva',
        descricao: 'O admin suspende e a próxima requisição do usuário já é negada em toda API de negócio.',
        subtarefas: '• B02-AC03 atendido\n• Não depende de logout nem de expiração de token',
        oQueTestar: 'Com um usuário logado em outra aba, suspender pelo admin e, sem deslogar, clicar em qualquer tela: acesso negado.' },

      { bloco: 'B02', dueDate: '2026-09-24', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T8 · Suíte de acesso cruzado entre contas',
        descricao: 'Cliente tenta ler recurso de outro cliente por ID, URL, filtro e corpo da requisição.',
        subtarefas: '• B02-AC05: negado sem revelar existência\n• Cobertura por ID, URL, filtro e corpo',
        oQueTestar: 'Logado como cliente A, trocar o ID na URL para o cliente B e conferir a RESPOSTA DA API, não só a tela.' },

      { bloco: 'B02', dueDate: '2026-09-24', prioridade: 4, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T9 · MFA TOTP obrigatório para admin e consultor',
        descricao: 'Via Identity Platform (D24). Reset de MFA por processo auditado. MFA de cliente fica fora do MVP.',
        subtarefas: '• Equipe não acessa sem TOTP\n• Reset de MFA deixa rastro de auditoria',
        oQueTestar: 'Cadastrar TOTP num consultor, sair, entrar de novo e confirmar que o segundo fator é exigido.' },

      { bloco: 'B02', dueDate: '2026-09-24', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B02-T10 · Tela admin de usuários e convites, sem dado financeiro',
        descricao: 'Papel, situação de acesso, estado e expiração do convite, reenviar e revogar. Nenhum token exibido.',
        subtarefas: '• B02-AC09 e AC11 atendidos\n• Respostas sem token, finanças ou notas\n• Fluxo completo em 360/390 px e por teclado',
        oQueTestar: 'Abrir a aba Network e inspecionar o JSON completo da listagem (não só a tela) procurando token ou valor. Depois repetir convite→cadastro→login→reset no celular.' },

      // ------------------------------------------------------------ B03 ----
      { bloco: 'B03', dueDate: '2026-09-23', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T1 · Admin cria cliente e vínculo inicial, de forma idempotente',
        descricao: 'Um consultor ativo por cliente, convite entregue pelo B02. Sem transferência de carteira no MVP.',
        subtarefas: '• B03-AC09: mesma chave de operação não duplica cliente, vínculo nem evento\n• Invariante de vínculo único persistida no banco',
        oQueTestar: 'Clicar em "criar" duas vezes (ou reenviar a mesma requisição) e conferir no banco que existe 1 cliente e 1 vínculo ativo.' },

      { bloco: 'B03', dueDate: '2026-09-23', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T2 · Onboarding mínimo com salvamento parcial e retomada',
        descricao: 'Nome de exibição mais pelo menos um contexto. CPF/CNPJ/CRM ficam fora dos mínimos. "Salvar e continuar depois" só confirma depois de persistir.',
        subtarefas: '• B03-AC02: mesmos dados e progresso em outro dispositivo ou sessão\n• Confirmação só após persistência real',
        oQueTestar: 'Preencher metade, sair, entrar de outro navegador e conferir que o progresso e os dados estão lá.' },

      { bloco: 'B03', dueDate: '2026-09-23', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T3 · ClientContext: 1 PF e N PJs com seletor (D23)',
        descricao: 'Cada empresa é um contexto próprio, com nome de exibição. Contexto nunca é um enum de dois valores.',
        subtarefas: '• B03-AC03: alterna contexto com a mesma identidade\n• Registros de contextos diferentes não se misturam',
        oQueTestar: 'Cadastrar 1 PF e 2 PJs, alternar entre elas conferindo que o contexto ativo fica visível e que os dados não se misturam.' },

      { bloco: 'B03', dueDate: '2026-09-24', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T4 · Carteira do consultor com busca no servidor e paginação',
        descricao: 'Nome, situação de acesso, progresso do onboarding, próxima reunião e data da última atualização financeira. Progresso discreto, sem porcentagem inventada.',
        subtarefas: '• B03-AC01: cliente aparece só na carteira do consultor vinculado\n• Busca e paginação no servidor',
        oQueTestar: 'Logar como consultor 1 e buscar pelo nome um cliente do consultor 2: nenhum resultado.' },

      { bloco: 'B03', dueDate: '2026-09-24', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T5 · Isolamento por operação: cliente × cliente e consultor × consultor',
        descricao: 'O servidor valida organização, identidade ativa, papel e vínculo em toda operação.',
        subtarefas: '• B03-AC05 e AC06 atendidos\n• Admin nunca recebe financeiro, notas ou links privilegiados',
        oQueTestar: 'Como admin, inspecionar o JSON completo das rotas operacionais procurando valor financeiro ou nota. Como consultor, forjar ID de cliente alheio em cada operação.' },

      { bloco: 'B03', dueDate: '2026-09-24', prioridade: 4, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T6 · Controle otimista de versão no onboarding',
        descricao: 'Toda atualização carrega a versão esperada. O conflito preserva o conteúdo local e permite comparar ou recarregar.',
        subtarefas: '• B03-AC07: o segundo salvamento recebe conflito\n• Nada é perdido',
        oQueTestar: 'Abrir a mesma ficha em duas abas, editar campos diferentes e salvar as duas: a segunda mostra conflito com opção de comparar.' },

      { bloco: 'B03', dueDate: '2026-09-24', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T7 · Ausência não é zero, e estados de erro e rede',
        descricao: 'Concluir os mínimos não cria receita, despesa ou meta zerada. Erro preserva o que foi digitado e mostra referência de suporte, sem confirmação falsa.',
        subtarefas: '• B03-AC04 e AC08 atendidos\n• Nenhuma linha financeira criada pelo onboarding',
        oQueTestar: 'Concluir o onboarding e conferir no banco que nenhuma tabela financeira ganhou linha. Depois cortar a rede (DevTools offline) ao salvar e verificar que não aparece "salvo".' },

      { bloco: 'B03', dueDate: '2026-09-24', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T8 · Carteira e onboarding em mobile e por teclado',
        descricao: 'Lista e cartões com ação de abrir sempre visível, sem depender de hover. Formulários não perdem conteúdo ao abrir ou fechar modal.',
        subtarefas: '• B03-AC10: jornada concluída em 360/390 px\n• Jornada concluída só com teclado',
        oQueTestar: 'Rodar a jornada inteira num celular real (ou 360 px) e depois só com Tab/Enter no desktop.' },

      { bloco: 'B03', dueDate: '2026-09-23', prioridade: 4, dificuldade: 2, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02',
        tarefa: 'B03-T9 · DECISÃO: campos mínimos e quem corrige nome e contextos depois',
        descricao: 'Proposta: o cliente e seu consultor corrigem, com autoria registrada. Contexto que já tem dados não é removido por alteração cadastral.',
        subtarefas: '• Decisão registrada ANTES de congelar o contrato com o B04',
        oQueTestar: 'Tentar remover uma PJ que já tem lançamentos: tem que ser bloqueada ou arquivada, nunca apagada.' },

      // ------------------------------------------------------------ B04 ----
      { bloco: 'B04', dueDate: '2026-09-25', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T1 · Modelo FinancialItem + MonthlyValue + Category (migration)',
        descricao: 'Agregado mensal por item. Valor em centavos, estado planned|actual, fonte manual_total (futuro: transaction_sum e statement_import), unicidade item+período e flag transfer na categoria.',
        subtarefas: '• B04-AC01: 1.234,56 volta como 123456 centavos em outro dispositivo\n• Modelo aceita importação futura sem remodelar',
        oQueTestar: 'Salvar R$ 1.234,56 num navegador, abrir em outro e conferir a exibição. Checar o inteiro no banco.' },

      { bloco: 'B04', dueDate: '2026-09-25', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T2 · Tela de lançamentos: mês, contexto, modal e edição inline',
        descricao: 'Criação de entrada e saída em modal padrão, edição inline dos 12 meses, selos previsto/realizado e recorrente/parcela, contexto sempre visível.',
        subtarefas: '• B04-AC09 e AC12 atendidos\n• Contextos nunca se misturam\n• Edição em 360 px com rolagem contida',
        oQueTestar: 'Editar um valor da tabela anual em 360 px usando o teclado e confirmar que o "salvo" só aparece depois da resposta do servidor.' },

      { bloco: 'B04', dueDate: '2026-09-25', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T3 · Recorrência simples com escopo explícito',
        descricao: '"Só este mês" contra "este e os próximos". Propaga previstos no ano corrente, sem retroatividade e sem sobrescrever período já preenchido.',
        subtarefas: '• B04-AC04: item criado em março preenche abr–dez e deixa jan/fev vazios\n• Repetição com a mesma chave não duplica',
        oQueTestar: 'Criar item recorrente em março com "este e os próximos", abrir a tabela anual e conferir mês a mês. Repetir a criação e ver que nada duplicou.' },

      { bloco: 'B04', dueDate: '2026-09-25', prioridade: 4, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T4 · Parcelamento em série (ex.: 3/10)',
        descricao: 'N previstos consecutivos, editáveis individualmente. Cancelar a série a partir de um mês não apaga parcelas passadas já realizadas.',
        subtarefas: '• Identificação da série visível na tela\n• Passado preservado ao cancelar a série',
        oQueTestar: 'Criar uma compra em 10x, marcar 3 como realizadas, cancelar a série a partir do mês 4 e confirmar que as 3 primeiras continuam nos totais.' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 5, dificuldade: 5, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T5 · Motor de indicadores com as fórmulas documentadas',
        descricao: 'Entradas, saídas, sobra, taxa de poupança, comparação mensal, anual realizado (jan até o mês corrente) e anual previsto (12 meses), sempre na janela declarada por visão. Ano e mês vêm do relógio do servidor.',
        subtarefas: '• B04-AC02, AC05 e AC13 atendidos\n• Entradas = 0 exibe "não se aplica"\n• Futuro não entra no realizado',
        oQueTestar: 'Rodar a suíte de casos de referência e conferir à mão: entradas 12.500,00 e saídas 7.300,45 → sobra 5.199,55 e taxa 41,6%. Depois um mês só com saídas → "—".' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T6 · Transferências PF↔PJ excluídas do consolidado',
        descricao: 'Categoria transfer aparece em cada contexto, mas some dos totais consolidados. Pró-labore não vira renda nova.',
        subtarefas: '• B04-AC06 atendido\n• Aparece isolado nos dois contextos, não conta no consolidado',
        oQueTestar: 'Lançar pró-labore de R$ 8.000,00 como transferência PJ→PF. Conferir que aparece nos dois contextos isolados e não é contado em nenhum lado do consolidado.' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T7 · Ausência e zero explícito separados na tela e nos totais',
        descricao: 'null é "não informado" e 0 é "informado como zero". Comparação sem base anterior diz "sem base de comparação", nunca "+100%".',
        subtarefas: '• B04-AC03 atendido\n• Campo vazio e R$ 0,00 se distinguem na tela e nos agregados',
        oQueTestar: 'Deixar um mês vazio e outro com R$ 0,00 informado. Conferir que a tela distingue os dois e que os agregados os tratam de forma diferente.' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T8 · Concorrência durante a call: conflito por versão',
        descricao: 'Toda escrita envia a versão esperada. Divergência devolve o valor atual para comparação.',
        subtarefas: '• B04-AC07: nada é sobrescrito silenciosamente com os dois editando',
        oQueTestar: 'Cliente e consultor abrem o mesmo valor, ambos alteram, o segundo salva: recebe conflito mostrando o valor atual.' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T9 · Arquivamento de item com histórico preservado',
        descricao: 'Exclusão pela interface é arquivamento. Editar nome e categoria é liberado, com autoria ("atualizado por X em D").',
        subtarefas: '• B04-AC10: meses passados continuam nos totais\n• Item some dos lançamentos novos',
        oQueTestar: 'Arquivar um item com 6 meses de histórico e conferir que a visão anual não mudou e que ele não aparece na tela do mês corrente.' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 4, dificuldade: 2, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T10 · Exportação CSV sanitizada',
        descricao: 'Separador correto, aspas escapadas e prefixo apóstrofo em conteúdo iniciado por = + - @. Respeita papel e contexto. "PDF" no MVP é a impressão do navegador.',
        subtarefas: '• B04-AC11 atendido\n• Conteúdo perigoso vira texto, não fórmula',
        oQueTestar: 'Criar um item chamado =SOMA(A1), exportar e abrir no Excel/Sheets: tem que aparecer como texto.' },

      { bloco: 'B04', dueDate: '2026-09-26', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T11 · Autorização financeira por contexto e admin sem valores',
        descricao: 'O servidor valida organização, cliente, contexto e vínculo em toda rota. O admin não recebe valor em rota, projeção, cache ou exportação.',
        subtarefas: '• B04-AC08 atendido\n• Troca de contextId no corpo é negada sem revelar existência',
        oQueTestar: 'Como consultor, trocar o contextId no corpo para um contexto de outro cliente: negado. Como admin, varrer as respostas atrás de qualquer número financeiro.' },

      { bloco: 'B04', dueDate: '2026-09-25', prioridade: 5, dificuldade: 2, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03',
        tarefa: 'B04-T12 · DECISÕES bloqueadoras do contrato financeiro',
        descricao: 'Lista inicial de categorias (padrão × personalizadas), regra de cartão de crédito (fatura única × compras individuais), consolidado PF+PJ na primeira tela × alternância, e previsto→realizado manual, automático ou ambos.',
        subtarefas: '• As 4 decisões registradas ANTES de fixar rotas e DTOs',
        oQueTestar: 'Validar numa passada pela tela real: dá para lançar um gasto de cartão sem contar duas vezes?' },

      // ------------------------------------------------------------ B05 ----
      { bloco: 'B05', dueDate: '2026-09-27', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T1 · Modelo Liability/Asset/Goal com invariantes (migration)',
        descricao: 'Centavos, contexto por ClientContext, autoria, versão, situações active/settled/archived e active/completed/archived. Parcelas pagas nunca maiores que as totais, valores nunca negativos.',
        subtarefas: '• B05-AC01: centavos exatos na API e na tela\n• Rollback não apaga nem reativa arquivados',
        oQueTestar: 'Cadastrar passivo com saldo R$ 1.234,56 e parcela R$ 123,45, recarregar e inspecionar a resposta da API.' },

      { bloco: 'B05', dueDate: '2026-09-27', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T2 · Passivos: CRUD, quitação explícita e curto prazo correto',
        descricao: 'Banco, modalidade e taxa editáveis depois do cadastro (o protótipo travava). A taxa é informativa e não entra em cálculo. Curto prazo = parcela × min(12, parcelas restantes), zero se quitada.',
        subtarefas: '• B05-AC03 e AC10 atendidos\n• Dívida quitada zera o curto prazo\n• Edição pós-cadastro com autoria',
        oQueTestar: 'Quitar uma dívida e conferir que o curto prazo vira R$ 0,00, sem parcela residual. Depois editar a instituição de um passivo já criado e ver a autoria registrada.' },

      { bloco: 'B05', dueDate: '2026-09-27', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T3 · Patrimônio: bens por classe, edição pós-cadastro e distribuição',
        descricao: 'Classe imóvel, investimento ou outro. Valor informado manualmente com data, sem cotação externa. Nome e classe continuam editáveis.',
        subtarefas: '• B05-AC10: edição aceita, com autoria\n• Distribuição por classe bate com a soma da lista',
        oQueTestar: 'Cadastrar bens nas três classes e conferir que o gráfico de distribuição bate com a soma da lista.' },

      { bloco: 'B05', dueDate: '2026-09-27', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T4 · Metas: progresso real, concluir sem forçar 100% e reabrir',
        descricao: 'Progresso = realizado/alvo limitado a 0–100%, calculado no servidor. Alvo ausente mostra "sem alvo definido". Concluir não altera o realizado. Prazo com validação real de data.',
        subtarefas: '• B05-AC04 e AC05 atendidos\n• Concluir preserva o realizado',
        oQueTestar: 'Meta com alvo 10.000 e realizado 6.000: concluir e conferir que a tela mostra "concluída" e 60%, não 100%. Criar meta sem alvo e ver "sem alvo definido".' },

      { bloco: 'B05', dueDate: '2026-09-28', prioridade: 5, dificuldade: 5, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T5 · Recálculo automático transacional dos agregados (D13)',
        descricao: 'Cada salvamento recalcula saldo total, curto prazo, distribuição por classe, patrimônio líquido e o que a visão geral do B04 consome. Sem cron e sem janela de divergência.',
        subtarefas: '• B05-AC02 atendido\n• Recálculo na mesma transação do salvamento',
        oQueTestar: 'Salvar um bem e, na mesma tela, conferir que o total e a visão geral do B04 já refletem o valor, sem refresh manual e sem atraso.' },

      { bloco: 'B05', dueDate: '2026-09-28', prioridade: 4, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T6 · Patrimônio líquido por contexto e consolidação sem duplicar',
        descricao: 'Bens ativos menos passivos ativos, por contexto. Consolidado PF+PJ exibido separadamente. Rótulo honesto: "Dívidas", não "Financiamentos".',
        subtarefas: '• B05-AC06: listas e totais não se misturam entre contextos',
        oQueTestar: 'Cadastrar bem e dívida em PF e em PJ e conferir que os três números (PF, PJ e consolidado) fecham na mão.' },

      { bloco: 'B05', dueDate: '2026-09-28', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T7 · Arquivamento e restauração com histórico, sem delete físico',
        descricao: 'Confirmação descrevendo o efeito. O item sai dos totais correntes e continua consultável.',
        subtarefas: '• B05-AC09 atendido\n• Trilha de auditoria registra arquivar e restaurar',
        oQueTestar: 'Arquivar um bem e ver o total cair, abrir o arquivo, restaurar e ver o total voltar. Conferir a trilha de auditoria.' },

      { bloco: 'B05', dueDate: '2026-09-28', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T8 · Isolamento, concorrência e falha de rede nos três módulos',
        descricao: 'Autorização por organização, identidade, papel, vínculo e contexto. Versão esperada em toda alteração. Nunca confirmar salvamento que não aconteceu.',
        subtarefas: '• B05-AC07, AC08 e AC12 atendidos',
        oQueTestar: 'Forjar ID de item de outra carteira em cada operação. Salvar o mesmo item em duas abas. Cortar a rede no meio de um salvamento e conferir que não aparece "salvo".' },

      { bloco: 'B05', dueDate: '2026-09-28', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T9 · Mobile e modais das três listas',
        descricao: 'Cartões em 360/390 px, ações sem hover, modais com altura máxima e rolagem interna, foco gerenciado e MoneyInput em centavos.',
        subtarefas: '• B05-AC11 atendido',
        oQueTestar: 'Criar, editar, quitar e concluir itens inteiramente em 360 px, só com teclado.' },

      { bloco: 'B05', dueDate: '2026-09-27', prioridade: 5, dificuldade: 2, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04',
        tarefa: 'B05-T10 · DECISÕES bloqueadoras do B05',
        descricao: 'Confirmar o default "metas sem vínculo automático a investimentos"; fechar a lista de modalidades de passivo e classes de patrimônio; definir patrimônio líquido consolidado PF+PJ × por contexto; decidir se quitação sugere despesa no B04 (proposta: não).',
        subtarefas: '• As 4 decisões registradas ANTES de fixar contratos com o B04',
        oQueTestar: 'Revisar as 4 decisões usando a tela real como apoio.' },

      // ------------------------------------------------------------ B06 ----
      { bloco: 'B06', dueDate: '2026-09-27', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T1 · Modelo Meeting + MeetingHistory (migration)',
        descricao: 'Início em UTC com fuso IANA, duração positiva (sugestão de 45 min, editável), link HTTPS validado e opcional, estado e versão. Participantes fixos: cliente e consultor vinculado.',
        subtarefas: '• B06-AC10: instante correto e fuso adotado informado\n• Link opcional, validado quando presente',
        oQueTestar: 'Agendar uma reunião, mudar o fuso do sistema operacional e reabrir: horário coerente com o fuso exibido.' },

      { bloco: 'B06', dueDate: '2026-09-27', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T2 · Agendar, reagendar e alterar link mantendo ID e histórico',
        descricao: 'Sobreposição gera aviso, sem bloqueio rígido. A reunião pode existir sem link ("link ainda não informado").',
        subtarefas: '• B06-AC01 e AC07 atendidos\n• Repetir a operação não duplica evento\n• Histórico com autoria',
        oQueTestar: 'Agendar com link do Meet colado à mão, reagendar e cancelar. Conferir status, histórico com autoria e a visão do cliente depois de recarregar.' },

      { bloco: 'B06', dueDate: '2026-09-27', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T3 · Máquina de estados: concluir, cancelar e ausência',
        descricao: 'scheduled para completed, cancelled ou no_show. Transição a partir de estado final é rejeitada no contrato inicial. Conclusão só a partir do horário de início.',
        subtarefas: '• Transição inválida devolve erro claro\n• Cancelamento preserva o registro, sem exclusão',
        oQueTestar: 'Tentar concluir uma reunião já cancelada: rejeitado. Tentar concluir uma reunião ainda no futuro: rejeitado.' },

      { bloco: 'B06', dueDate: '2026-09-28', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T4 · Resumo compartilhado: rascunho × publicado, com publicação explícita',
        descricao: 'Concluir não publica. Publicar exige conteúdo não vazio e reunião concluída. Correção cria nova revisão, preservando a anterior.',
        subtarefas: '• B06-AC04 e AC05 atendidos\n• Cliente vê só a última revisão publicada, nunca o rascunho',
        oQueTestar: 'Escrever rascunho, concluir sem publicar e abrir como cliente: "resumo ainda não disponível". Publicar, editar de novo e conferir que o cliente segue vendo a versão publicada anterior.' },

      { bloco: 'B06', dueDate: '2026-09-28', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T5 · Notas privadas do consultor em contrato separado',
        descricao: 'Só o consultor autor com vínculo ativo. Nunca em HTML, JSON, hidratação, prefetch, cache, busca ou exportação. Nunca copiadas para o resumo.',
        subtarefas: '• B06-AC03 atendido\n• Ausentes de qualquer payload de cliente ou admin',
        oQueTestar: 'Logado como cliente, usar "ver código-fonte" e a aba Network para procurar o texto da nota privada em qualquer payload. Repetir como admin.' },

      { bloco: 'B06', dueDate: '2026-09-28', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T6 · "Próxima reunião" e "último atendimento"',
        descricao: 'Próxima = primeira agendada futura ou em andamento. Agendada vencida sem desfecho aparece como pendente, nunca concluída sozinha. Último atendimento = completed mais recente; cancelada e ausência não contam.',
        subtarefas: '• B06-AC02 atendido\n• Nenhuma conclusão automática por passagem do tempo',
        oQueTestar: 'Criar uma reunião concluída antiga e uma recente cancelada, e conferir que a ficha ainda aponta a concluída como último atendimento.' },

      { bloco: 'B06', dueDate: '2026-09-28', prioridade: 4, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T7 · Concorrência em resumo, notas e agenda',
        descricao: 'Versão esperada em toda escrita. O servidor impede publicar uma revisão diferente da que o consultor viu.',
        subtarefas: '• B06-AC06 e AC09 atendidos\n• Falha de rede não exibe "salvo" nem "publicado"',
        oQueTestar: 'Editar o mesmo resumo em duas abas e publicar da aba desatualizada: conflito. Depois cortar a rede ao publicar e confirmar que não aparece confirmação.' },

      { bloco: 'B06', dueDate: '2026-09-28', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T8 · DTOs por papel, acesso cruzado e visão admin sem conteúdo',
        descricao: 'Nunca devolver superset filtrado no navegador. O admin vê só contagens por período e status, sem link e sem texto.',
        subtarefas: '• B06-AC08 e AC12 atendidos\n• Logs correlacionam falha sem texto, link ou PII',
        oQueTestar: 'Como consultor 2, chamar a API da reunião do consultor 1 pelo ID. Depois inspecionar uma amostra real de logs e eventos procurando URL do Meet ou trecho de resumo.' },

      { bloco: 'B06', dueDate: '2026-09-28', prioridade: 4, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T9 · Telas mobile de reunião: consultor e cliente',
        descricao: 'Campos "Resumo para o cliente" e "Notas privadas" com visibilidade explícita e prévia antes de publicar. Sem hover para abrir reunião ou publicar.',
        subtarefas: '• B06-AC11 atendido',
        oQueTestar: 'Em 360 px e por teclado, abrir a reunião, registrar e publicar o resumo. Conferir na visão do cliente que nada privado aparece.' },

      { bloco: 'B06', dueDate: '2026-09-27', prioridade: 4, dificuldade: 2, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B03',
        tarefa: 'B06-T10 · DECISÕES de política de reuniões',
        descricao: 'Quem agenda e quem publica; visibilidade do rascunho; se resumo publicado pode ser corrigido (proposta: nova revisão explícita com histórico restrito); limites de tamanho de texto; política de correção retroativa de status.',
        subtarefas: '• Decisões registradas ANTES de implementar os contratos',
        oQueTestar: 'Revisar as políticas simulando o caso "publiquei errado, e agora?".' },

      // ------------------------------------------------------------ B07 ----
      { bloco: 'B07', dueDate: '2026-09-29', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B02, B03, B04, B05, B06',
        tarefa: 'B07-T1 · Ensaio das 6 jornadas prioritárias no dev implantado',
        descricao: 'Admin, dois consultores e clientes de carteiras diferentes. Roteiro com o resultado real de cada passo, contra o ambiente implantado e não só a suíte local.',
        subtarefas: '• B07-AC01: cada passo com evidência datada\n• Nenhum item marcado como "confiado"',
        oQueTestar: 'Rodar o roteiro completo no ambiente dev publicado, anexando print ou saída de cada passo.' },

      { bloco: 'B07', dueDate: '2026-09-29', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B02, B03, B04',
        tarefa: 'B07-T2 · Bateria de isolamento com inspeção das respostas',
        descricao: 'Cliente × cliente, consultor × consultor e admin × financeiro, todos negados no servidor.',
        subtarefas: '• Respostas inspecionadas, não apenas as telas',
        oQueTestar: 'Para cada operação, chamar a API com ID alheio e ler o JSON completo da resposta.' },

      { bloco: 'B07', dueDate: '2026-09-29', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01, B03',
        tarefa: 'B07-T3 · Validação mobile e de acessibilidade em aparelhos reais',
        descricao: '360, 390, 768 e 1440 px. Safari no iOS e Chrome no Android nas telas principais. Teclado em formulários e modais.',
        subtarefas: '• Nenhum dado cortado\n• Nenhuma ação inacessível',
        oQueTestar: 'Abrir o app num iPhone (Safari) e num Android (Chrome) e executar a jornada do cliente e a do consultor.' },

      { bloco: 'B07', dueDate: '2026-09-29', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B04, B05',
        tarefa: 'B07-T4 · Conferir as regras financeiras contra o ambiente implantado',
        descricao: 'Casos de referência do B04 e do B05 em centavos, no deploy, não apenas no teste unitário. Aceite formal do solicitante (D19).',
        subtarefas: '• Números batem no ambiente implantado\n• Validação registrada',
        oQueTestar: 'Refazer à mão 4 ou 5 casos direto na URL implantada: sobra, taxa com entradas 0, consolidado com transferência e curto prazo de dívida quitada.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B07-T5 · Provisionamento no GCP depois da ordem registrada',
        descricao: 'Instância SQL exclusiva, serviços consultoria-docfinance-dev e -prod, segredos no Secret Manager, service accounts separadas e usuário de migração diferente do usuário de runtime.',
        subtarefas: '• Nada criado antes da ordem do B00-T6\n• Nenhum recurso doc-finance/empréstimos tocado',
        oQueTestar: 'Depois do deploy, listar os recursos criados e conferir nomes e região southamerica-east1. Validar que o app em prod responde o health.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B01',
        tarefa: 'B07-T6 · Deploy reproduzível com rollback e verificação de tráfego',
        descricao: 'Conferir status.traffic da revisão depois do deploy: o exit code mente e um deploy interrompido deixa revisão órfã.',
        subtarefas: '• Rollback documentado e testado\n• 100% do tráfego na revisão nova, confirmado',
        oQueTestar: 'gcloud run services describe consultoria-docfinance-prod e conferir que 100% do tráfego está na revisão nova. Executar um rollback de teste e voltar.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 5, dificuldade: 5, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B07',
        tarefa: 'B07-T7 · Backup automático e restauração ensaiada antes de dado real',
        descricao: 'Ensaio em instância temporária, antes de qualquer dado real entrar.',
        subtarefas: '• B07-AC02: prod intacto\n• Banco restaurado validado e depois destruído\n• Evidências registradas',
        oQueTestar: 'Restaurar o backup numa instância temporária, consultar uma tabela para provar integridade, destruir a instância e registrar as evidências.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B07',
        tarefa: 'B07-T8 · Índices conferidos no prod e health monitorado',
        descricao: 'Deploy não aplica índice sozinho: consulta sem índice vira 500 no primeiro uso real. Erro em produção precisa gerar referência de suporte rastreável.',
        subtarefas: '• Índices presentes em prod, verificados no banco\n• Health monitorado',
        oQueTestar: 'Conectar no banco de prod e listar os índices das tabelas de lançamentos e valores mensais. Provocar um erro controlado e seguir a referência até o log.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 3, dificuldade: 2, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B00',
        tarefa: 'B07-T9 · Alertas de orçamento 50/80/100% e etiquetas por produto e ambiente',
        descricao: 'Conforme o teto definido no B00-T4.',
        subtarefas: '• Alertas ativos\n• Recursos etiquetados por produto e ambiente',
        oQueTestar: 'Conferir o budget configurado no console de billing e as labels nos recursos criados.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B07',
        tarefa: 'B07-T10 · Varredura de segurança e privacidade com amostragem real',
        descricao: 'Nenhum segredo no repositório ou na imagem, headers de segurança e dependências auditadas. Nenhum valor financeiro ou PII em analytics e logs — amostrando registros reais, não lendo o código.',
        subtarefas: '• Amostra real de logs inspecionada\n• Bruno e Geovane cientes do que é coletado e por quanto tempo',
        oQueTestar: 'Baixar uma amostra de logs e eventos de prod e procurar e-mail, nome, CPF, valor ou URL do Meet. Rodar a auditoria de dependências e inspecionar os headers da resposta.' },

      { bloco: 'B07', dueDate: '2026-09-30', prioridade: 5, dificuldade: 3, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B07',
        tarefa: 'B07-T11 · Release candidata congelada em prod na véspera',
        descricao: 'Checklist 100% verde. Nenhuma funcionalidade nova depois disso; apenas correções bloqueadoras.',
        subtarefas: '• Aceite do usuário registrado em 30/09\n• Tag/commit implantado conferido',
        oQueTestar: 'Confirmar a tag/commit implantado em prod e passar o checklist item a item.' },

      { bloco: 'B07', dueDate: '2026-10-01', prioridade: 5, dificuldade: 4, status: 'BACKLOG', responsavel: 'Bruno', dependencias: 'B07',
        tarefa: 'B07-T12 · Convite assistido do primeiro cliente real (piloto 01/10)',
        descricao: 'Admin cria cliente e vínculo, convite entregue de forma assistida. O consultor conduz a call preenchendo a ficha junto com o cliente (D09), com acompanhamento dos logs em tempo real.',
        subtarefas: '• B07-AC03: onboarding e as cinco áreas funcionando com persistência\n• Toda falha com referência rastreável\n• Resultado vira backlog priorizado do pós-piloto',
        oQueTestar: 'A própria call de 01/10, com os logs abertos numa segunda tela e um registro do que travou ou confundiu.' }
    ]
  }
};
