// Live-tour anchor guard for PRs (fails on in-use anchor removal, warns otherwise): node scripts/checkTourAnchors.ts --base origin/dev-paul

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY_PATH = 'config/tourAnchors.ts';
export const IN_USE_PATH = 'config/tourAnchorsInUse.json';

export interface InUseTour {
  id: string;
  title: string;
  anchors: string[];
}

export type InUseSnapshot = Record<
  string,
  { refreshed: string; tours: InUseTour[] }
>;

/** Keys of the TOUR_ANCHORS object, read from source so a base revision needs no import. */
export function registryIds(source: string): string[] {
  const start = source.indexOf('export const TOUR_ANCHORS = {');
  if (start === -1) return [];
  const end = source.indexOf('} as const satisfies', start);
  const body = source.slice(start, end === -1 ? undefined : end);
  return [...body.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
}

/** Anchor id to the titles of the saved tours that use it. */
export function inUseAnchors(snapshot: InUseSnapshot): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [project, { tours }] of Object.entries(snapshot)) {
    for (const tour of tours) {
      for (const id of tour.anchors) {
        out.set(id, [...(out.get(id) ?? []), `"${tour.title}" (${project})`]);
      }
    }
  }
  return out;
}

/** In-use anchors missing from the registry, with the tours that would break. */
export function brokenInUse(
  ids: readonly string[],
  inUse: Map<string, string[]>
): string[] {
  const known = new Set(ids);
  return [...inUse.entries()]
    .filter(([id]) => !known.has(id))
    .map(([id, tours]) => `${id}: ${tours.join(', ')}`);
}

export const removedIds = (
  base: readonly string[],
  head: readonly string[]
): string[] => {
  const kept = new Set(head);
  return base.filter((id) => !kept.has(id));
};

/** Added line numbers per file from `git diff --unified=0`. */
export function addedLines(diff: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  for (const line of diff.split('\n')) {
    const file = /^\+\+\+ b\/(.+)$/.exec(line);
    if (file) {
      current = new Set();
      out.set(file[1], current);
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const from = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let n = from; n < from + count; n++) current.add(n);
    }
  }
  return out;
}

// Teacher-facing surfaces only: tours never run in student apps, dev harnesses or the tour UI itself.
const SKIP_PATH =
  /(^|\/)(student|dev|legal|landing|lti|classroomAddon|tours)\/|student|\.test\.tsx$/i;

export const scansFile = (path: string): boolean =>
  /\.tsx$/.test(path) &&
  (path.startsWith('components/') || path === 'App.tsx') &&
  !SKIP_PATH.test(path);

const INTERACTIVE_ROLE =
  /\brole=\{?\s*["'](tab|menuitem|menuitemradio|menuitemcheckbox|switch)["']/;
const HAS_ANCHOR =
  /data-tour=|\btourAttr\(|\btourTypeAttr\(|\btourFieldAttr\(|\{\s*\.\.\./;

/** Opening JSX tag text from `start` (the `<`) to its closing `>`, skipping braces and quotes. */
function openingTag(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (depth === 0 && c === '>') return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/** 1-based lines of added buttons, selects, tabs, menu items and switches that carry no anchor. */
export function unanchoredControls(
  text: string,
  added: ReadonlySet<number>
): { line: number; tag: string }[] {
  const out: { line: number; tag: string }[] = [];
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  const lineOf = (index: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  for (const match of text.matchAll(/<([a-z][a-z0-9]*)\b/g)) {
    const line = lineOf(match.index);
    if (!added.has(line)) continue;
    const tag = openingTag(text, match.index);
    const name = match[1];
    const interactive =
      name === 'button' || name === 'select' || INTERACTIVE_ROLE.test(tag);
    if (interactive && !HAS_ANCHOR.test(tag)) out.push({ line, tag: name });
  }
  return out;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');

if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const baseArg = process.argv.indexOf('--base');
  const base = baseArg === -1 ? 'origin/dev-paul' : process.argv[baseArg + 1];
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const summary: string[] = [];
  const annotate = (level: 'error' | 'warning', msg: string, at = '') =>
    console.log(`::${level} ${at}title=Live tour anchors::${msg}`);

  const head = registryIds(read(REGISTRY_PATH));
  const inUse = inUseAnchors(JSON.parse(read(IN_USE_PATH)) as InUseSnapshot);
  const broken = brokenInUse(head, inUse);
  for (const line of broken) {
    annotate(
      'error',
      `Saved live tours use ${line}. Keep that id on the control (move its tourAttr), or update those tours' steps and refresh ${IN_USE_PATH}.`,
      `file=${REGISTRY_PATH},`
    );
  }
  if (broken.length) {
    summary.push(
      `### ❌ Anchors that saved tours use are gone\n\n${broken.map((b) => `- ${b}`).join('\n')}\n\nKeep the id on the control that replaced it, or update those tours and refresh \`${IN_USE_PATH}\` with \`node scripts/snapshot-tour-anchors.mjs --project prod\`.`
    );
  }

  const mergeBase = git('merge-base', base, 'HEAD').trim();
  let baseSource = '';
  try {
    baseSource = git('show', `${mergeBase}:${REGISTRY_PATH}`);
  } catch {
    // The registry did not exist at the base revision.
  }
  const removed = removedIds(registryIds(baseSource), head).filter(
    (id) => !inUse.has(id)
  );
  if (removed.length) {
    annotate(
      'warning',
      `Removed from the registry: ${removed.join(', ')}. Tours saved after the last snapshot that point at these will stop finding them.`,
      `file=${REGISTRY_PATH},`
    );
    summary.push(
      `### ⚠️ Anchors removed\n\nNo snapshotted tour uses these, but a tour saved since may:\n\n${removed.map((id) => `- \`${id}\``).join('\n')}`
    );
  }

  const diff = git(
    'diff',
    '--unified=0',
    '--diff-filter=AM',
    `${mergeBase}...HEAD`,
    '--',
    'components',
    'App.tsx'
  );
  const missing: { path: string; line: number; tag: string }[] = [];
  for (const [path, lines] of addedLines(diff)) {
    if (!scansFile(path)) continue;
    for (const hit of unanchoredControls(read(path), lines)) {
      missing.push({ path, ...hit });
    }
  }
  // GitHub shows only the first 10 warnings per step; the summary lists them all.
  for (const m of missing.slice(0, 10)) {
    annotate(
      'warning',
      `New <${m.tag}> has no live-tour anchor. Add {...tourAttr('<id>')} and register the id in ${REGISTRY_PATH}, unless a tour would never point at it.`,
      `file=${m.path},line=${m.line},`
    );
  }
  if (missing.length) {
    summary.push(
      `### ⚠️ New controls without a live-tour anchor (${missing.length})\n\nAdd \`{...tourAttr('<id>')}\` and register the id in \`${REGISTRY_PATH}\` for any control a tour might point at. This is a reminder, not a failure.\n\n${missing.map((m) => `- \`${m.path}:${m.line}\` \`<${m.tag}>\``).join('\n')}`
    );
  }

  const report = summary.length
    ? summary.join('\n\n')
    : '### ✅ Live tour anchors\n\nNo anchor that saved tours use was removed, and every new control has an anchor.';
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  }
  process.exit(broken.length ? 1 : 0);
}
