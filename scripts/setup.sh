#!/bin/bash
# SessionStart hook: installs deps; in cloud sessions also provisions Node 24 and Google credentials.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

persist() { [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "$1" >> "$CLAUDE_ENV_FILE" || true; }

echo "Setting up environment..." >&2

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  # Cloud images ship Node 22; the repo and functions/ need 24.
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "$major" -lt 24 ]; then
    export NVM_DIR="${NVM_DIR:-/opt/nvm}"
    # nvm isn't safe under set -eu.
    set +eu
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 24 >&2
    node24_bin="$(dirname "$(nvm which 24)")"
    set -eu
    export PATH="$node24_bin:$PATH"
    persist "export PATH=\"$node24_bin:\$PATH\""
  fi

  # Optional dev-project service account, stored as an environment variable (raw JSON or base64).
  if [ -z "${SPARTBOARD_DEV_SA_KEY:-}" ] && [ -n "${CLOUDSDK_AUTH_ACCESS_TOKEN:-}" ]; then
    # GCP network secret: gcloud already sends the placeholder token; this lets Firebase CLI and Admin SDK send it too.
    shim_port=8939
    if ! curl -sf -H 'Metadata-Flavor: Google' "http://127.0.0.1:$shim_port/computeMetadata/v1/project/project-id" >/dev/null 2>&1; then
      METADATA_SHIM_PORT=$shim_port nohup node scripts/cloud-metadata-shim.mjs >/dev/null 2>&1 &
    fi
    for var in "GCE_METADATA_HOST=127.0.0.1:$shim_port" "GCE_METADATA_IP=127.0.0.1:$shim_port" \
      "METADATA_SERVER_DETECTION=assume-present" "GOOGLE_CLOUD_PROJECT=spartboard-dev" "NODE_USE_ENV_PROXY=1"; do
      persist "export $var"
    done
  elif [ -n "${SPARTBOARD_DEV_SA_KEY:-}" ]; then
    key_file="$HOME/.config/gcloud/spartboard-dev-sa.json"
    mkdir -p "$(dirname "$key_file")"
    if printf '%s' "$SPARTBOARD_DEV_SA_KEY" | tr -d '[:space:]' | head -c1 | grep -q '{'; then
      printf '%s' "$SPARTBOARD_DEV_SA_KEY" > "$key_file"
    else
      printf '%s' "$SPARTBOARD_DEV_SA_KEY" | base64 -d > "$key_file"
    fi
    chmod 600 "$key_file"
    export GOOGLE_APPLICATION_CREDENTIALS="$key_file"
    persist "export GOOGLE_APPLICATION_CREDENTIALS=\"$key_file\""
    # The image's placeholder token would otherwise win over the service account in gcloud.
    persist "unset CLOUDSDK_AUTH_ACCESS_TOKEN"
    if command -v gcloud >/dev/null; then
      env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud auth activate-service-account --key-file="$key_file" >&2 || true
      env -u CLOUDSDK_AUTH_ACCESS_TOKEN gcloud config set project spartboard-dev >&2 || true
    fi
  fi
fi

corepack enable
corepack prepare pnpm@10.30.2 --activate

pnpm run install:all >&2

# Pre-fetch the Firestore emulator so `pnpm run test:rules` works on the first try.
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  pnpm exec firebase setup:emulators:firestore >&2 || true
fi

echo "Setup complete." >&2
