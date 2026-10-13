import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const SCAN_ROOTS = ['components', 'context', 'App.tsx'];
const SOURCE_EXT = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

// Every anchor use in source: tourAttr('id'…, tourTypeAttr('id'…, tourFieldAttr('id'…, or a data-tour="id" literal.
export const ANCHOR_USE =
  /(?:\btourAttr\(\s*|\btourTypeAttr\(\s*|\btourFieldAttr\(\s*|\bdata-tour=\{?\s*|\b\w*[tT]ourId\s*=\s*\{?\s*)(['"`])([^'"`]+)\1/g;

const eachSource = (visit: (path: string, text: string) => void) => {
  const walk = (abs: string) => {
    if (statSync(abs).isDirectory()) {
      for (const entry of readdirSync(abs)) walk(join(abs, entry));
      return;
    }
    if (!SOURCE_EXT.test(abs) || TEST_FILE.test(abs)) return;
    visit(
      relative(repoRoot, abs).split(sep).join('/'),
      readFileSync(abs, 'utf8')
    );
  };
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root));
};

/** Anchor id to the repo-relative files (forward slashes) that render it. */
export function anchorRenderFiles(): Map<string, string[]> {
  const used = new Map<string, Set<string>>();
  eachSource((path, text) => {
    for (const match of text.matchAll(ANCHOR_USE)) {
      const id = match[2];
      if (!used.has(id)) used.set(id, new Set());
      used.get(id)?.add(path);
    }
  });
  return new Map([...used].map(([id, files]) => [id, [...files].sort()]));
}

/** The call's remaining arguments after the anchor id, split at top-level commas. */
const restArgs = (text: string, from: number): string[] => {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth--;
    }
    if (ch === ',' && depth === 0) {
      args.push(current);
      current = '';
    } else current += ch;
  }
  args.push(current);
  // The text before the first comma is the rest of the id argument.
  return args
    .slice(1)
    .map((a) => a.trim())
    .filter(Boolean);
};

const literal = (arg: string | undefined): string | null => {
  const m = arg?.match(/^(['"`])([^'"`$]*)\1$/);
  return m ? m[2] : null;
};

/** Anchor id to the `type` or `type#field` keys its tags use; `complete` is false when any tag computes one. */
export function anchorKeys(): Map<
  string,
  { keys: string[]; complete: boolean }
> {
  const out = new Map<string, { keys: Set<string>; complete: boolean }>();
  eachSource((_path, text) => {
    for (const match of text.matchAll(ANCHOR_USE)) {
      const id = match[2];
      const entry = out.get(id) ?? { keys: new Set<string>(), complete: true };
      out.set(id, entry);
      const call = match[0];
      const args = restArgs(text, (match.index ?? 0) + call.length);
      if (call.startsWith('tourTypeAttr')) {
        const type = literal(args[0]);
        if (type) entry.keys.add(type);
        else entry.complete = false;
      } else if (call.startsWith('tourFieldAttr')) {
        const type = literal(args[0]);
        const field = literal(args[1]);
        if (type && field) entry.keys.add(`${type}#${field}`);
        else entry.complete = false;
      } else if (call.startsWith('tourAttr')) {
        if (args.length < 2) continue;
        const type = literal(args[1]);
        if (type) entry.keys.add(type);
        else entry.complete = false;
      } else entry.complete = false;
    }
  });
  return new Map(
    [...out].map(([id, { keys, complete }]) => [
      id,
      { keys: [...keys].sort(), complete },
    ])
  );
}
