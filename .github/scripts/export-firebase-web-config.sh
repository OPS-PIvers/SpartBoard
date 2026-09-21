#!/usr/bin/env bash
# Writes a Firebase web app's public config as VITE_FIREBASE_* lines (to $3, default $GITHUB_ENV) so the dev build needs no stored copy.
set -euo pipefail

PROJECT_ID="${1:?usage: $0 <project-id> <web-app-id> [out-file]}"
APP_ID="${2:?usage: $0 <project-id> <web-app-id> [out-file]}"
OUT="${3:-${GITHUB_ENV:?pass an output file or set GITHUB_ENV}}"

pnpm exec firebase apps:sdkconfig WEB "$APP_ID" --project "$PROJECT_ID" --json |
  node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      const c = JSON.parse(raw).result.sdkConfig;
      const map = {
        VITE_FIREBASE_API_KEY: c.apiKey,
        VITE_FIREBASE_AUTH_DOMAIN: c.authDomain,
        VITE_FIREBASE_PROJECT_ID: c.projectId,
        VITE_FIREBASE_STORAGE_BUCKET: c.storageBucket,
        VITE_FIREBASE_MESSAGING_SENDER_ID: c.messagingSenderId,
        VITE_FIREBASE_APP_ID: c.appId,
      };
      for (const [k, v] of Object.entries(map)) {
        if (!v) throw new Error(`sdkconfig is missing ${k}`);
        process.stdout.write(`${k}=${v}\n`);
      }
    });
  ' >> "$OUT"

echo "Exported Firebase web config for $PROJECT_ID."
