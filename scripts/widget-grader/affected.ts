// Which widgets a change affects, for the CI gate job (R23): node scripts/widget-grader/affected.ts --base origin/dev-paul

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveWidgetFiles, type WidgetFiles } from './widgetFiles.ts';

export type Scope =
  | { mode: 'all'; reason: string }
  | { mode: 'some'; types: string[] }
  | { mode: 'none' };

const REGISTRY = 'components/widgets/WidgetRegistry.ts';
const FIXTURES = 'components/dev/widgetGrader/fixtures/';
const STUBS = 'components/dev/widgetGrader/stubs/';

// Shared code every widget renders through: a change here re-checks them all.
const SHARED: RegExp[] = [
  /^components\/common\/DraggableWindow\.tsx$/,
  /^components\/common\/ScaledEmptyState\.tsx$/,
  /^components\/widgets\/WidgetRenderer\.tsx$/,
  /^config\/widget[^/]*\.ts$/,
  /^config\/tools\.ts$/,
  /^components\/dev\/widgetGrader\//,
  /^scripts\/widget-grader\/measure\//,
  /^playwright\.grader\.config\.ts$/,
  /^docs\/widget-rubric\/rubric\.json$/,
];

const baseName = (path: string): string =>
  path.slice(path.lastIndexOf('/') + 1).replace(/\.(ts|tsx)$/, '');

/** Widget types named on the changed lines of a WidgetRegistry.ts diff (`git diff -U0`). */
export function registryTypes(diff: string, known: Set<string>): string[] {
  const found = new Set<string>();
  for (const line of diff.split('\n')) {
    if (!/^[+-]/.test(line) || /^(\+\+\+|---)/.test(line)) continue;
    const m = line.slice(1).match(/^\s*'?([A-Za-z0-9-]+)'?\s*:/);
    if (m && known.has(m[1])) found.add(m[1]);
  }
  return [...found].sort();
}

export function affectedWidgets(
  changed: string[],
  files: Record<string, WidgetFiles>,
  registryDiff = ''
): Scope {
  const known = new Set(Object.keys(files));
  const types = new Set<string>();
  for (const path of changed) {
    const fixture = path.startsWith(FIXTURES) || path.startsWith(STUBS);
    if (fixture && known.has(baseName(path))) {
      types.add(baseName(path));
      continue;
    }
    const shared = SHARED.find((re) => re.test(path));
    if (shared) return { mode: 'all', reason: path };
    if (path === REGISTRY) {
      const named = registryTypes(registryDiff, known);
      if (named.length === 0) return { mode: 'all', reason: path };
      named.forEach((t) => types.add(t));
      continue;
    }
    for (const w of Object.values(files)) {
      const owned =
        (w.folder !== null && path.startsWith(`${w.folder}/`)) ||
        path === w.entry ||
        w.frontFace.includes(path) ||
        w.settings.includes(path);
      if (owned) types.add(w.type);
    }
  }
  return types.size
    ? { mode: 'some', types: [...types].sort() }
    : { mode: 'none' };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');

if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const at = args.indexOf('--base');
  const base = (at >= 0 && args[at + 1]) || 'origin/dev-paul';
  const git = (...a: string[]) =>
    execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  const range = `${base}...HEAD`;
  const changed = git('diff', '--name-only', range).split('\n').filter(Boolean);
  const registryDiff = git('diff', '-U0', range, '--', REGISTRY);
  const scope = affectedWidgets(
    changed,
    resolveWidgetFiles(root),
    registryDiff
  );
  console.log(JSON.stringify(scope));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `mode=${scope.mode}\ntypes=${scope.mode === 'some' ? scope.types.join(',') : ''}\n`
    );
  }
}
