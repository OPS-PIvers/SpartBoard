// Finds a Chromium for run-live-tour.mjs when Playwright's expected build isn't installed. Never downloads one.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EXECUTABLES = new Set([
  'chrome-headless-shell',
  'chrome-headless-shell.exe',
  'headless_shell',
  'headless_shell.exe',
  'chrome',
  'chrome.exe',
  'Chromium',
]);
const SYSTEM = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/opt/google/chrome/chrome',
];

/** Playwright's browser cache folders, the env override first. */
export function browserCaches(env = process.env, platform = process.platform) {
  const home = homedir();
  const caches = [];
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0')
    caches.push(env.PLAYWRIGHT_BROWSERS_PATH);
  if (platform === 'win32')
    caches.push(
      join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'ms-playwright')
    );
  else if (platform === 'darwin')
    caches.push(join(home, 'Library', 'Caches', 'ms-playwright'));
  else
    caches.push(
      join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'ms-playwright')
    );
  return caches;
}

const build = (name) => Number(/-(\d+)$/.exec(name)?.[1] ?? 0);

function findExecutable(dir, depth) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const e of entries)
    if (e.isFile() && EXECUTABLES.has(e.name)) return join(dir, e.name);
  if (depth === 0) return undefined;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const hit = findExecutable(join(dir, e.name), depth - 1);
    if (hit) return hit;
  }
  return undefined;
}

/** Installed Chromium executables, newest build first, headless shells before full builds of the same build. */
export function installedChromiums(caches = browserCaches()) {
  const found = [];
  for (const cache of caches) {
    let names;
    try {
      names = readdirSync(cache);
    } catch {
      continue;
    }
    const builds = names
      .filter((n) => /^chromium(_headless_shell)?-\d+$/.test(n))
      .filter((n) => statSync(join(cache, n)).isDirectory())
      .sort(
        (a, b) =>
          build(b) - build(a) ||
          Number(b.includes('headless')) - Number(a.includes('headless'))
      );
    for (const n of builds) {
      const exe = findExecutable(join(cache, n), 4);
      if (exe) found.push(exe);
    }
  }
  return [...found, ...SYSTEM.filter((p) => existsSync(p))];
}
