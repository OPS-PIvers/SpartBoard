#!/usr/bin/env bash
#
# Decide what a dev-* push deploys to spartboard-dev.
#
# Hosting goes to the branch owner's own site. The backend (functions, rules,
# indexes, storage) is shared by every dev branch, so it deploys only the parts
# whose files changed, and a branch other than dev-paul may deploy it only when
# it already contains origin/dev-paul (functions deploy with --force, so a stale
# branch would delete functions dev-paul added).
#
# Usage: plan-dev-deploy.sh <branch> <before-sha> <full-backend:true|false>
# Writes key=value lines to $GITHUB_OUTPUT (or stdout). CHANGED_FILES and
# CONTAINS_DEV_PAUL override the git lookups, for tests.

set -euo pipefail

BRANCH="${1:?usage: $0 <branch> <before-sha> <full-backend>}"
BEFORE="${2:-}"
FULL="${3:-false}"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"

case "$BRANCH" in
  dev-paul | dev-paul-*) SITE_SUFFIX=dev ;;
  dev-bailey | dev-bailey-*) SITE_SUFFIX=dev-bailey ;;
  *) SITE_SUFFIX= ;;
esac

contains_dev_paul() {
  if [[ -n "${CONTAINS_DEV_PAUL:-}" ]]; then
    [[ "$CONTAINS_DEV_PAUL" == "true" ]]
    return
  fi
  git merge-base --is-ancestor origin/dev-paul HEAD
}

changed_files() {
  if [[ -n "${CHANGED_FILES+set}" ]]; then
    printf '%s\n' "$CHANGED_FILES"
    return
  fi
  local base
  if [[ "$BRANCH" == "dev-paul" ]]; then
    base="$BEFORE"
  else
    base="$(git merge-base origin/dev-paul HEAD)"
  fi
  if [[ -z "$base" || "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    echo "__ALL__"
    return
  fi
  git diff --name-only "$base" HEAD
}

FILES="$(changed_files)"
has() { grep -qE "$1" <<<"$FILES"; }

if [[ "$FULL" == "true" ]] || has '^__ALL__$|^\.github/scripts/firebase-deploy-with-retry\.sh$'; then
  FUNCTIONS=true INDEXES=true STORAGE=true RULES=true
else
  FUNCTIONS=false INDEXES=false STORAGE=false RULES=false
  # Test files and docs never change what runs in the backend.
  if grep -E '^functions/|^firebase\.json$' <<<"$FILES" | grep -qvE '\.(test|spec)\.ts$|\.md$'; then FUNCTIONS=true; fi
  if has '^firestore\.indexes\.json$'; then INDEXES=true; fi
  if has '^storage\.rules$'; then STORAGE=true; fi
  if has '^firestore\.rules$|^scripts/(releaseFirestoreRules|stripRulesComments)\.mjs$'; then RULES=true; fi
fi

targets=()
[[ "$FUNCTIONS" == "true" ]] && targets+=(functions)
[[ "$INDEXES" == "true" ]] && targets+=(firestore:indexes)
[[ "$STORAGE" == "true" ]] && targets+=(storage)
DEPLOY_ONLY="$(IFS=,; echo "${targets[*]}")"

BACKEND=false
if [[ -n "$DEPLOY_ONLY" || "$RULES" == "true" ]]; then BACKEND=true; fi

if [[ "$BACKEND" == "true" && "$BRANCH" != "dev-paul" ]] && ! contains_dev_paul; then
  echo "::warning::Backend changes were not deployed: this branch is behind dev-paul. Rebase or merge origin/dev-paul and push again."
  BACKEND=false
fi

if [[ -z "$SITE_SUFFIX" ]]; then
  echo "::notice::No dev hosting site for '$BRANCH'; add one to .github/scripts/plan-dev-deploy.sh."
fi

{
  # The site is spartboard-<suffix>; outputs containing a secret value (the prod project id) are dropped.
  echo "site_suffix=$SITE_SUFFIX"
  echo "backend=$BACKEND"
  echo "deploy_only=$DEPLOY_ONLY"
  echo "release_rules=$RULES"
  echo "indexes=$INDEXES"
} >>"$OUT"
