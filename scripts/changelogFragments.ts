// Release notes come from public/changelog.json plus one fragment file per PR in changelog.d/, so parallel PRs never edit the same file.
// node scripts/changelogFragments.ts check     validate the fragments and print the merged counts
// node scripts/changelogFragments.ts collect   fold every fragment into public/changelog.json and delete them

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHANGELOG = 'public/changelog.json';
export const FRAGMENT_DIR = 'changelog.d';

type Json = Record<string, unknown>;
export interface Changelog extends Json {
  entries: Json[];
  widgetNotes?: Json[];
}
export interface Fragment {
  name: string;
  data: unknown;
}

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Compares "2026.11.19.2" style versions numerically, part by part. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Only the same-day .N counter moves; the date parts never do.
const bumpVersion = (v: string) =>
  v.split('.').length > 3
    ? v.replace(/\d+$/, (n) => String(Number(n) + 1))
    : `${v}.2`;

/** Base file plus fragments; new entries slot in newest-first, new widget notes go on top. A clash renumbers instead of failing, so two PRs that merge cleanly can't break the build. */
export function mergeChangelog(
  base: unknown,
  fragments: Fragment[],
  warn: (msg: string) => void = (msg) => console.warn(msg)
): Changelog {
  if (!isObject(base) || !Array.isArray(base.entries)) {
    throw new Error(`${CHANGELOG} must be an object with an "entries" array`);
  }
  const entries = [...(base.entries as Json[])];
  const baseNotes = Array.isArray(base.widgetNotes)
    ? (base.widgetNotes as Json[])
    : [];
  const versions = new Set(entries.map((e) => e.version));
  const noteIds = new Set(baseNotes.map((n) => n.id));
  const newEntries: Json[] = [];
  const newNotes: Json[] = [];

  const sorted = [...fragments].sort((a, b) => a.name.localeCompare(b.name));
  for (const { name, data } of sorted) {
    const where = `${FRAGMENT_DIR}/${name}`;
    if (!isObject(data)) throw new Error(`${where} must be a JSON object`);
    const extra = Object.keys(data).filter(
      (k) => k !== 'entries' && k !== 'widgetNotes'
    );
    if (extra.length) {
      throw new Error(
        `${where} may only hold "entries" and "widgetNotes", not ${extra.join(', ')}`
      );
    }
    const fEntries = data.entries ?? [];
    const fNotes = data.widgetNotes ?? [];
    if (!Array.isArray(fEntries) || !Array.isArray(fNotes)) {
      throw new Error(`${where}: "entries" and "widgetNotes" must be arrays`);
    }
    if (!fEntries.length && !fNotes.length) {
      throw new Error(`${where} has no entries or widget notes`);
    }
    for (const e of fEntries) {
      if (
        !isObject(e) ||
        typeof e.version !== 'string' ||
        typeof e.date !== 'string'
      ) {
        throw new Error(
          `${where}: every entry needs a string "version" and "date"`
        );
      }
      let version = e.version;
      while (versions.has(version)) version = bumpVersion(version);
      if (version !== e.version) {
        warn(
          `${where}: version ${e.version} is already used, so it ships as ${version}`
        );
      }
      versions.add(version);
      newEntries.push(version === e.version ? e : { ...e, version });
    }
    for (const n of fNotes) {
      if (
        !isObject(n) ||
        typeof n.id !== 'string' ||
        typeof n.widget !== 'string' ||
        typeof n.date !== 'string' ||
        typeof n.text !== 'string'
      ) {
        throw new Error(
          `${where}: every widget note needs string "id", "widget", "date" and "text"`
        );
      }
      let id = n.id;
      for (let i = 2; noteIds.has(id); i += 1) id = `${n.id}-${i}`;
      if (id !== n.id) {
        warn(
          `${where}: widget note id ${n.id} is already used, so it ships as ${id}`
        );
      }
      noteIds.add(id);
      newNotes.push(id === n.id ? n : { ...n, id });
    }
  }

  newEntries.sort((a, b) =>
    compareVersions(b.version as string, a.version as string)
  );
  const baseTop = entries.find((x) => typeof x.version === 'string')?.version;
  for (const e of newEntries) {
    const at = entries.findIndex(
      (x) =>
        typeof x.version === 'string' &&
        compareVersions(x.version, e.version as string) < 0
    );
    if (
      typeof baseTop === 'string' &&
      compareVersions(baseTop, e.version as string) > 0
    ) {
      warn(
        `changelog entry ${e.version as string} is older than the newest entry, so teachers get no update prompt for it`
      );
    }
    entries.splice(at < 0 ? entries.length : at, 0, e);
  }
  newNotes.sort((a, b) => (b.date as string).localeCompare(a.date as string));

  const merged: Changelog = { ...base, entries };
  if (newNotes.length || 'widgetNotes' in base) {
    merged.widgetNotes = [...newNotes, ...baseNotes];
  }
  return merged;
}

export const serializeChangelog = (c: unknown) =>
  `${JSON.stringify(c, null, 2)}\n`;

export function readFragments(root: string): Fragment[] {
  const dir = join(root, FRAGMENT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((name) => {
      try {
        return {
          name,
          data: JSON.parse(readFileSync(join(dir, name), 'utf8')),
        };
      } catch (err) {
        throw new Error(
          `${FRAGMENT_DIR}/${name} is not valid JSON: ${(err as Error).message}`
        );
      }
    });
}

/** What the app serves as /changelog.json: the committed file with every fragment folded in. */
export function loadChangelog(root: string): Changelog {
  const base: unknown = JSON.parse(readFileSync(join(root, CHANGELOG), 'utf8'));
  return mergeChangelog(base, readFragments(root));
}

/** The merged changelog as it stood at a git ref, or null when the ref has no changelog. */
export function loadChangelogAtRef(
  root: string,
  ref: string
): Changelog | null {
  const git = (...a: string[]) =>
    execFileSync('git', a, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  let base: unknown;
  try {
    base = JSON.parse(git('show', `${ref}:${CHANGELOG}`));
  } catch {
    return null;
  }
  const names = git('ls-tree', '--name-only', ref, `${FRAGMENT_DIR}/`)
    .split('\n')
    .filter((p) => p.endsWith('.json'));
  const fragments = names.map((p) => ({
    name: p.slice(FRAGMENT_DIR.length + 1),
    data: JSON.parse(git('show', `${ref}:${p}`)) as unknown,
  }));
  return mergeChangelog(base, fragments);
}

const isMain =
  !!process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) ===
    realpathSync(resolve(process.argv[1]));

if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const cmd = process.argv[2];
  const fragments = readFragments(root);
  const merged = loadChangelog(root);
  if (cmd === 'collect') {
    writeFileSync(join(root, CHANGELOG), serializeChangelog(merged));
    for (const f of fragments) unlinkSync(join(root, FRAGMENT_DIR, f.name));
    console.log(`Folded ${fragments.length} fragment(s) into ${CHANGELOG}.`);
  } else if (cmd === 'check') {
    console.log(
      `${fragments.length} fragment(s) OK. Merged: ${merged.entries.length} entries, ${merged.widgetNotes?.length ?? 0} widget notes.`
    );
  } else {
    console.error('Usage: node scripts/changelogFragments.ts check|collect');
    process.exit(2);
  }
}
