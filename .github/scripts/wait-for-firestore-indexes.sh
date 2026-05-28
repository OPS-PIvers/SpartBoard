#!/usr/bin/env bash
#
# Poll Firestore until every composite index is in state READY.
#
# Background: `firebase deploy --only firestore:indexes` returns success
# once the index creation request is queued, NOT once the index finishes
# building. Indexes can take seconds to tens of minutes to build
# depending on collection size. If the new client bundle ships before
# the index is ready, the first user to hit the query gets a
# FAILED_PRECONDITION error.
#
# This script authenticates with the service account JSON pointed at by
# GOOGLE_APPLICATION_CREDENTIALS, then polls `gcloud firestore indexes
# composite list` until every entry reports state=READY (or a timeout
# trips). It exits 0 on success, 1 on timeout.
#
# Usage: ./wait-for-firestore-indexes.sh <project-id>
# Required env: GOOGLE_APPLICATION_CREDENTIALS pointing at a SA JSON
# file with at least roles/datastore.viewer permissions.
#
# Timeout defaults to 10 minutes — long enough for typical builds on
# small collections like the per-session quiz_sessions/*/responses
# subcollection, short enough that a stuck deploy doesn't hold the
# runner indefinitely.

set -euo pipefail

PROJECT_ID="${1:?usage: $0 <project-id>}"
TIMEOUT_SECONDS="${WAIT_INDEXES_TIMEOUT:-600}"
POLL_INTERVAL_SECONDS="${WAIT_INDEXES_POLL_INTERVAL:-15}"

if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  echo "ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set" >&2
  exit 1
fi
if [[ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
  echo "ERROR: GOOGLE_APPLICATION_CREDENTIALS points at a missing file: $GOOGLE_APPLICATION_CREDENTIALS" >&2
  exit 1
fi

# gcloud is preinstalled on GitHub-hosted ubuntu runners. Authenticate
# with the service account and target the project before polling.
gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null
gcloud config set project "$PROJECT_ID" >/dev/null

deadline=$((SECONDS + TIMEOUT_SECONDS))
echo "Waiting up to ${TIMEOUT_SECONDS}s for Firestore composite indexes on $PROJECT_ID to be READY..."

while (( SECONDS < deadline )); do
  # `gcloud firestore indexes composite list` lists all user-defined
  # composite indexes for the (default) database. `--format='value(state)'`
  # prints one state per line — possible values: CREATING, READY,
  # NEEDS_REPAIR, DELETING.
  if ! states=$(gcloud firestore indexes composite list --format='value(state)' 2>/dev/null); then
    # Transient API blip — back off and retry rather than failing the
    # deploy.
    echo "  gcloud list query failed; retrying in ${POLL_INTERVAL_SECONDS}s..."
    sleep "$POLL_INTERVAL_SECONDS"
    continue
  fi

  if [[ -z "$states" ]]; then
    echo "  no composite indexes returned yet; retrying in ${POLL_INTERVAL_SECONDS}s..."
    sleep "$POLL_INTERVAL_SECONDS"
    continue
  fi

  # Count anything that isn't READY. NEEDS_REPAIR is treated as a hard
  # failure — a broken index won't fix itself by waiting.
  not_ready=$(echo "$states" | grep -v '^READY$' || true)
  if [[ -z "$not_ready" ]]; then
    total=$(echo "$states" | wc -l | tr -d '[:space:]')
    echo "All $total composite indexes are READY."
    exit 0
  fi

  if echo "$not_ready" | grep -q '^NEEDS_REPAIR$'; then
    echo "ERROR: one or more composite indexes are in NEEDS_REPAIR. Fix them in the Firebase console before redeploying." >&2
    gcloud firestore indexes composite list --format='table(name,state)' >&2
    exit 1
  fi

  pending=$(echo "$not_ready" | wc -l | tr -d '[:space:]')
  echo "  $pending index(es) still building; sleeping ${POLL_INTERVAL_SECONDS}s..."
  sleep "$POLL_INTERVAL_SECONDS"
done

echo "ERROR: timed out after ${TIMEOUT_SECONDS}s waiting for Firestore composite indexes to be READY." >&2
gcloud firestore indexes composite list --format='table(name,state)' >&2 || true
exit 1
