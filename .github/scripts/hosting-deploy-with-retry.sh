#!/usr/bin/env bash
# Deploy Firebase Hosting, retrying transient Google API failures with backoff.
# Usage: ./hosting-deploy-with-retry.sh <project-id> [extra firebase deploy args...]
# An identical bundle is rejected as "the current active version": a no-op success.

set -uo pipefail

PROJECT_ID="${1:?usage: $0 <project-id> [args...]}"
shift
TRANSIENT_PATTERN='HTTP Error: (5[0-9][0-9]|429)|service is currently unavailable|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|premature close|Client network socket disconnected|Deadline exceeded|code.?UNAVAILABLE'
LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

for wait in 30 60 120 240 0; do
  pnpm exec firebase deploy --only hosting --project "$PROJECT_ID" "$@" 2>&1 | tee "$LOG_FILE"
  code=${PIPESTATUS[0]}
  if [[ "$code" -eq 0 ]]; then
    exit 0
  fi
  if grep -q "is the current active version" "$LOG_FILE"; then
    echo "::notice::Hosting bundle unchanged; already live, nothing to release."
    exit 0
  fi
  if [[ "$wait" -eq 0 ]] || ! grep -qiE "$TRANSIENT_PATTERN" "$LOG_FILE"; then
    break
  fi
  echo "::warning::Transient Google API error during the hosting deploy; retrying in ${wait}s."
  sleep "$wait"
done
echo "ERROR: hosting deploy failed (exit ${code})." >&2
exit "$code"
