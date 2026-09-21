#!/usr/bin/env bash
#
# Deploy the Firebase backend (functions, Firestore indexes, storage) with
# automatic retry on transient Google API failures, then release
# firestore.rules through scripts/releaseFirestoreRules.mjs.
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
# A `firebase deploy` of these targets is idempotent (indexes/storage
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
# rate limiting and socket-level resets from the runner. The `.?` in
# `code.?UNAVAILABLE` matches the gRPC UNAVAILABLE status whether the
# Firebase SDK logs it as "code: UNAVAILABLE" or "code=UNAVAILABLE".
#
# A 409 on the firebaserules `/releases` endpoint is an echo rather than a
# conflict. firebase-tools releases a ruleset with `updateOrCreateRelease`,
# which PATCHes the existing release and, on any thrown error, POSTs a new
# one; the POST then 409s precisely because the release does exist. The
# real error is whatever the PATCH returned, and it is discarded. Firestore
# rules no longer take that path (see the release step below), but the
# storage rules release still does, so keep retrying it. Scoped to that one
# endpoint: a 409 anywhere else (e.g. functions) is left non-retryable.
RULES_RELEASE_409='firebaserules\.googleapis\.com[^ ]*/releases had HTTP Error: 409'
TRANSIENT_PATTERN="HTTP Error: 5[0-9][0-9]|HTTP Error: 429|service is currently unavailable|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|premature close|Client network socket disconnected|Deadline exceeded|code.?UNAVAILABLE|${RULES_RELEASE_409}"

# Comments count toward the 256 KiB ruleset cap, so deploy a comment-stripped
# copy. Every surviving line is byte-identical to the source; tests still run
# against the commented file. Idempotent, so retries are unaffected.
node scripts/stripRulesComments.mjs firestore.rules --write

# firestore:rules is deployed here rather than by the CLI: since 2026-09-21
# the API rejects the CLI's release call with 400 INVALID_ARGUMENT, and the
# CLI hides that behind a 409. The script makes the same calls, prints the real
# status, tries the release request shapes the API might accept, and has its own
# retry for transient statuses. It runs after the CLI deploy, which is where the
# rules release sat when the CLI still owned it.
release_firestore_rules() {
  echo "::group::release firestore.rules"
  node scripts/releaseFirestoreRules.mjs "$PROJECT_ID"
  local code=$?
  echo "::endgroup::"
  if [[ "$code" -ne 0 ]]; then
    echo "ERROR: firestore.rules release failed (exit ${code})." >&2
  fi
  return "$code"
}

attempt=1
backoff=10
while true; do
  echo "::group::firebase deploy (attempt ${attempt}/${MAX_ATTEMPTS})"
  # `tee` keeps the deploy output streaming in the CI log while also
  # capturing it for the transient-error check. PIPESTATUS[0] is the
  # firebase exit code (tee always succeeds).
  pnpm exec firebase deploy --only functions,firestore:indexes,storage --project "$PROJECT_ID" --force 2>&1 | tee "$LOG_FILE"
  code=${PIPESTATUS[0]}
  echo "::endgroup::"

  if [[ "$code" -eq 0 ]]; then
    release_firestore_rules
    exit $?
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
