// Fails when firestore.rules keeps rules for a collection or settings doc that no app or function code uses any more.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8').replace(
  /\/\/.*$/gm,
  ''
);

// Copy and seed tools mirror prod data wholesale, so a name there does not mean the app still uses it.
const IGNORED_FILE = /\.test\.|devSyncFromProd|[\\/]scripts[\\/]/;
const SOURCE_ROOTS = [
  'App.tsx',
  'types.ts',
  'components',
  'context',
  'hooks',
  'config',
  'utils',
  'functions/src',
  'extension/src',
];

function readSources(): string {
  const parts: string[] = [];
  const walk = (p: string) => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) {
        if (f === 'node_modules' || f === 'lib' || f === 'dist') continue;
        walk(path.join(p, f));
      }
    } else if (/\.(tsx?|mjs|js)$/.test(p) && !IGNORED_FILE.test(p)) {
      parts.push(readFileSync(p, 'utf8'));
    }
  };
  for (const r of SOURCE_ROOTS) walk(path.join(ROOT, r));
  return parts.join('\n');
}

const sources = readSources();
const usedInCode = (name: string) =>
  new RegExp(`['"\`/]${name}['"\`/]`).test(sources);

function matchPathNames(): string[] {
  const names = new Set<string>();
  for (const m of rules.matchAll(/match\s+(\/\S+)\s*\{/g)) {
    for (const seg of m[1].split('/')) {
      if (
        seg &&
        !seg.startsWith('{') &&
        seg !== 'databases' &&
        seg !== 'documents'
      ) {
        names.add(seg);
      }
    }
  }
  return [...names];
}

function adminSettingsReadList(): string[] {
  const block = rules.slice(rules.indexOf('match /admin_settings/{docId}'));
  const read = block.slice(0, block.indexOf('\n    }'));
  return [...read.matchAll(/docId(?:\.matches\(|\s*==\s*)'([^']+)'/g)].flatMap(
    (m) => m[1].split('|')
  );
}

describe('firestore.rules has no rules for retired data', () => {
  it('finds the match paths and the admin_settings read list', () => {
    expect(matchPathNames().length).toBeGreaterThan(100);
    expect(adminSettingsReadList()).toContain('subjects');
  });

  it('every collection named in a match path is still used by app or function code', () => {
    const unused = matchPathNames().filter((n) => !usedInCode(n));
    expect(
      unused,
      'Delete the match block for each retired collection and flip its rules tests to assertFails.'
    ).toEqual([]);
  });

  it('every admin_settings doc teachers may read is still used by app or function code', () => {
    const list = adminSettingsReadList();
    expect(new Set(list).size).toBe(list.length);
    for (const n of list) expect(n).toMatch(/^[A-Za-z0-9_]+$/);
    const unused = list.filter((n) => !usedInCode(n));
    expect(
      unused,
      'A retired rollout switch or setting still sits in the admin_settings read list in firestore.rules. Remove it.'
    ).toEqual([]);
  });
});
