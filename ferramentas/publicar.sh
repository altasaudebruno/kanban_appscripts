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

# `update-deployment` imprime "Redeployed ... @N" mesmo quando o deployment
# continua na versão anterior — visto em 23/09, logo após criar a versão.
# Por isso cada republicação é CONFERIDA na listagem, e repetida se não pegou.
versao_no_servidor() {
  clasp list-deployments 2>/dev/null \
    | grep -F "$1" \
    | grep -Eo '@[0-9]+' \
    | tr -d '@' \
    | tail -1
}

FALHOU=0
for ID in ${DEPLOYMENTS}; do
  echo "    ${ID}"
  for TENTATIVA in 1 2 3; do
    clasp update-deployment --versionNumber "${VERSAO}" "${ID}" >/dev/null 2>&1 || true
    sleep 2
    ATUAL="$(versao_no_servidor "${ID}")"
    if [ "${ATUAL}" = "${VERSAO}" ]; then
      echo "    confirmado na versão ${VERSAO} (tentativa ${TENTATIVA})"
      break
    fi
    echo "    ainda em @${ATUAL:-?}; tentando de novo..."
    if [ "${TENTATIVA}" = "3" ]; then
      echo "    ERRO: não subiu para a versão ${VERSAO}." >&2
      FALHOU=1
    fi
  done
done

echo "==> 4/4 Estado final"
clasp list-deployments

if [ "${FALHOU}" = "1" ]; then
  echo >&2
  echo "ATENÇÃO: algum deployment NÃO está na versão ${VERSAO}." >&2
  echo "         A página do gestor seguirá mostrando a versão antiga." >&2
  exit 1
fi

echo
echo "Pronto: a URL publicada serve a versão ${VERSAO}."
echo "Recarregue a página do gestor com Ctrl+F5 para furar o cache do navegador."
