#!/bin/bash
# Runs one Node script in a cloud session as the proxy-injected claude-cloud identity: scripts/cloud-run.sh scripts/<name> [args]
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "cloud-run.sh is for cloud sessions only; on a PC run the script with node directly." >&2
  exit 1
fi
if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "Usage: scripts/cloud-run.sh scripts/<script> [args]" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
port="${METADATA_SHIM_PORT:-8939}"
if ! curl -sf -H 'Metadata-Flavor: Google' "http://127.0.0.1:$port/computeMetadata/v1/project/project-id" >/dev/null 2>&1; then
  METADATA_SHIM_PORT=$port nohup node "$root/scripts/cloud-metadata-shim.mjs" >/dev/null 2>&1 &
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -sf -H 'Metadata-Flavor: Google' "http://127.0.0.1:$port/computeMetadata/v1/project/project-id" >/dev/null 2>&1 && break
    sleep 0.3
  done
fi

export GCE_METADATA_HOST="127.0.0.1:$port" GCE_METADATA_IP="127.0.0.1:$port"
export METADATA_SERVER_DETECTION=assume-present NODE_USE_ENV_PROXY=1 FIRESTORE_PREFER_REST=true
export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-spartboard-dev}"
# Scripts read this before the key file; the preload turns it into the injected token.
export FIREBASE_SERVICE_ACCOUNT='{"type":"cloud-proxy"}'
export NODE_OPTIONS="--require $root/scripts/cloud-run-preload.cjs ${NODE_OPTIONS:-}"

echo "cloud-run: node $*" >&2
exec node "$@"
