#!/usr/bin/env bash
#
# Publica o quadro: push + versão nova + republicação do deployment do web app.
#
#   bash ferramentas/publicar.sh "descrição da versão"
#
# Por que existe: `clasp push` só atualiza o código do projeto. A URL /exec
# serve a VERSÃO congelada no deployment, não o código novo — então, sem
# republicar, a página do gestor continua mostrando o que era ontem, mesmo com
# o push verde e o e-mail (que roda em HEAD) já correto.
#
# O deployment é atualizado no lugar, pelo mesmo ID: a URL não muda, porque o
# gestor pode já ter o link salvo.
set -euo pipefail

cd "$(dirname "$0")/.."

DESCRICAO="${1:-publicacao automatica}"

echo "==> 1/4 Enviando o código (clasp push)"
clasp push --force

echo "==> 2/4 Criando versão: ${DESCRICAO}"
clasp create-version "${DESCRICAO}"

# A versão recém-criada é a de maior número na listagem.
VERSAO="$(clasp list-versions 2>/dev/null \
  | grep -Eo '^[0-9]+' \
  | sort -n \
  | tail -1)"

if [ -z "${VERSAO}" ]; then
  echo "ERRO: não consegui descobrir o número da versão criada." >&2
  exit 1
fi
echo "    versão ${VERSAO}"

# Só deployments de web app interessam: o entry @HEAD serve a URL /dev e não
# precisa (nem aceita) ser fixado numa versão.
DEPLOYMENTS="$(clasp list-deployments 2>/dev/null \
  | grep -E '^- ' \
  | grep -v '@HEAD' \
  | awk '{print $2}')"

if [ -z "${DEPLOYMENTS}" ]; then
  echo "AVISO: nenhum deployment versionado encontrado." >&2
  echo "       Crie um pelo editor (Implantar -> Nova implantação -> App da Web)" >&2
  echo "       e rode este script de novo." >&2
  exit 0
fi

echo "==> 3/4 Republicando deployment(s) na versão ${VERSAO}"
for ID in ${DEPLOYMENTS}; do
  echo "    ${ID}"
  clasp update-deployment --versionNumber "${VERSAO}" "${ID}"
done

echo "==> 4/4 Estado final"
clasp list-deployments

echo
echo "Pronto. A URL /exec agora serve a versão ${VERSAO}."
echo "Recarregue a página do gestor com Ctrl+F5 para furar o cache do navegador."
