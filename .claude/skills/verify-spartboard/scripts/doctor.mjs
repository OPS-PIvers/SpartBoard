#!/usr/bin/env node
// Read-only health check for a running SpartBoard Vite dev server.
// Usage: node .claude/skills/verify-spartboard/scripts/doctor.mjs [port]   (default 56320)
// Exit 0 = worth driving, 1 = not reachable / wrong app, 2 = reachable but points at PROD.
import { execSync } from 'node:child_process';

const port = Number(process.argv[2] ?? 56320);
const base = `http://localhost:${port}`;
const out = (k, v) => console.log(`${k.padEnd(14)} ${v}`);

const fetchText = async (path) => {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
  return { status: res.status, text: await res.text() };
};

let exitCode = 0;
try {
  const root = await fetchText('/');
  const title = /<title>([^<]*)/.exec(root.text)?.[1]?.trim();
  out('url', base);
  out('http /', `${root.status} title="${title ?? '?'}"`);
  if (root.status !== 200 || title !== 'SpartBoard') {
    console.log('FAIL: not a SpartBoard dev server on this port');
    process.exit(1);
  }
  // Vite inlines import.meta.env into each served module, so this shows the real target project.
  const fb = await fetchText('/config/firebase.ts');
  const envJson = /import\.meta\.env = (\{[^}]*\})/.exec(fb.text)?.[1];
  const env = envJson ? JSON.parse(envJson) : {};
  const project = env.VITE_FIREBASE_PROJECT_ID ?? '(not inlined: production build?)';
  const bypass = env.VITE_AUTH_BYPASS === 'true';
  out('mode', env.MODE ?? '?');
  out('firebase', project);
  out('auth bypass', bypass ? 'on (mock admin, mock-user-id)' : 'off (real Google sign-in)');
  const kind =
    project === 'dummy'
      ? 'ISOLATED: nothing persists, nothing reaches any Firebase project'
      : project === 'spartboard-dev'
        ? 'DEV PROJECT: writes land in shared spartboard-dev data'
        : project === 'spartboard'
          ? 'PRODUCTION: do not drive mutations here'
          : 'UNKNOWN target';
  out('target', kind);
  if (project === 'spartboard') exitCode = 2;
} catch (err) {
  console.log(`FAIL: ${base} unreachable (${err.message})`);
  process.exit(1);
}

try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() ? ' (uncommitted changes)' : '';
  out('checkout', `${branch} @ ${sha}${dirty}`);
} catch {
  out('checkout', 'not a git checkout');
}
process.exit(exitCode);
