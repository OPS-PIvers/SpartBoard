#!/usr/bin/env bash
#
# Deploy the Firebase backend (functions, Firestore rules + indexes,
# storage) with automatic retry on transient Google API failures.
#
# Background: `firebase deploy` makes many googleapis calls while it
# reconciles Firestore fields/indexes, uploads functions, and enables
# APIs. Those calls occasionally return transient errors from the GitHub
# runner — HTTP 5xx ("The service is currently unavailable"), 429 rate
# limits, or socket resets ("premature close", ECONNRESET). A single
# transient blip (e.g. a 503 on the field-reconciliation read that runs
# early in `--only firestore`) fails the whole deploy even though nothing
# is wrong with the code being shipped.
#
# This wrapper retries the deploy a few times with exponential backoff
# when the output matches a known transient signature, mirroring the
# retry-on-blip philosophy already used in wait-for-firestore-indexes.sh.
# A `firebase deploy` of these targets is idempotent (rules/indexes/storage
# reconcile to the committed manifest; functions redeploy the same source),
# so re-running after a partial transient failure is safe.
#
# Non-transient failures (e.g. a rules compile error, a bad function
# signature) don't match the transient signatures and fail immediately
# without burning the retry budget.
#
# Usage: ./firebase-deploy-with-retry.sh <project-id>
# Required env: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
# account JSON file with deploy permissions.
# Optional env: FIREBASE_DEPLOY_MAX_ATTEMPTS (default 4).

set -uo pipefail

PROJECT_ID="${1:?usage: $0 <project-id>}"
MAX_ATTEMPTS="${FIREBASE_DEPLOY_MAX_ATTEMPTS:-4}"

LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

# Case-insensitive substrings that mark a transient, retryable failure
# rather than a real deploy error. `HTTP Error: 5[0-9][0-9]` covers every
# 5xx server error (503 is the one seen in the wild); the rest cover
# rate limiting and socket-level resets from the runner.
TRANSIENT_PATTERN='HTTP Error: 5[0-9][0-9]|HTTP Error: 429|service is currently unavailable|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|premature close|Client network socket disconnected|Deadline exceeded|code.?UNAVAILABLE'

attempt=1
backoff=10
while true; do
  echo "::group::firebase deploy (attempt ${attempt}/${MAX_ATTEMPTS})"
  # `tee` keeps the deploy output streaming in the CI log while also
  # capturing it for the transient-error check. PIPESTATUS[0] is the
  # firebase exit code (tee always succeeds).
  pnpm exec firebase deploy --only functions,firestore,storage --project "$PROJECT_ID" --force 2>&1 | tee "$LOG_FILE"
  code=${PIPESTATUS[0]}
  echo "::endgroup::"

  if [[ "$code" -eq 0 ]]; then
    exit 0
  fi

  if (( attempt >= MAX_ATTEMPTS )); then
    echo "ERROR: firebase deploy failed after ${attempt} attempt(s) (exit ${code})." >&2
    exit "$code"
  fi

  if grep -qiE "$TRANSIENT_PATTERN" "$LOG_FILE"; then
    echo "::warning::Transient Google API error during firebase deploy; retrying in ${backoff}s (attempt ${attempt}/${MAX_ATTEMPTS})."
    sleep "$backoff"
    attempt=$((attempt + 1))
    backoff=$((backoff * 2))
    continue
  fi

  echo "ERROR: firebase deploy failed with a non-transient error (exit ${code}); not retrying." >&2
  exit "$code"
done
