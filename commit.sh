#!/usr/bin/env bash
set -euo pipefail

MSG="${1:-Atualiza dados da pós-graduação do INPE}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Erro: esta pasta ainda não é um repositório Git."
  echo "Execute: git init"
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "Nada para commitar."
  exit 0
fi

git commit -m "$MSG"
echo "Commit criado com sucesso: $MSG"

if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
  git push
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  echo "Upstream nao configurado para '$BRANCH'."
  echo "Executando: git push -u origin $BRANCH"
  git push -u origin "$BRANCH"
fi
