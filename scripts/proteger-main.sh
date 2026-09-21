#!/usr/bin/env bash
# Configura la protección de la rama main según GitHub Flow.
# Requiere GitHub CLI autenticado con permisos de admin: gh auth login
# Uso: ./scripts/proteger-main.sh OWNER/REPO
set -euo pipefail

REPO="${1:?Uso: $0 OWNER/REPO}"

gh api -X PUT "repos/${REPO}/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint y formato", "Typecheck", "Tests y cobertura (>= 80 %)", "Build"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

# Borra automáticamente la rama después del merge y solo permite squash merge.
gh api -X PATCH "repos/${REPO}" \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false > /dev/null

echo "Rama main protegida en ${REPO}"
