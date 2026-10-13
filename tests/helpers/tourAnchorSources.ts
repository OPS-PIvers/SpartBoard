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

/** Anchor id to the repo-relative files (forward slashes) that render it. */
export function anchorRenderFiles(): Map<string, string[]> {
  const used = new Map<string, Set<string>>();
  const walk = (abs: string) => {
    if (statSync(abs).isDirectory()) {
      for (const entry of readdirSync(abs)) walk(join(abs, entry));
      return;
    }
    if (!SOURCE_EXT.test(abs) || TEST_FILE.test(abs)) return;
    const path = relative(repoRoot, abs).split(sep).join('/');
    for (const match of readFileSync(abs, 'utf8').matchAll(ANCHOR_USE)) {
      const id = match[2];
      if (!used.has(id)) used.set(id, new Set());
      used.get(id)?.add(path);
    }
  };
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root));
  return new Map([...used].map(([id, files]) => [id, [...files].sort()]));
}
