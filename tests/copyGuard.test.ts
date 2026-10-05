import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import {
  copyProblem,
  copyProblemTexts,
} from '@/scripts/widget-grader/static/copyGuard.ts';

// Blocks new long or slop-marked on-screen copy (docs/plans/shipped/ALWAYS_VISIBLE_COPY.md, Phase 6).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(repoRoot, 'tests/fixtures/copyGuardBaseline.json');
const SCAN_ROOTS = ['components', 'App.tsx'];
const SKIP_DIRS = ['components/legal', 'components/dev'];
// Baseline keys use POSIX separators; path.relative returns `\` on Windows.
const toRel = (abs: string) => relative(repoRoot, abs).split(sep).join('/');
interface Baseline {
  locale: string[];
  source: string[];
}

const localeViolations = (): string[] => {
  const en = JSON.parse(
    readFileSync(join(repoRoot, 'locales/en.json'), 'utf8')
  ) as unknown;
  const out: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      if (copyProblem(node)) out.push(path);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(en, '');
  return out.sort();
};

const sourceFiles = (): string[] => {
  const out: string[] = [];
  const visit = (abs: string) => {
    const rel = toRel(abs);
    if (SKIP_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`))) return;
    if (statSync(abs).isDirectory()) {
      for (const name of readdirSync(abs)) visit(join(abs, name));
    } else if (/\.tsx?$/.test(rel) && !/\.(test|spec)\.tsx?$/.test(rel)) {
      out.push(abs);
    }
  };
  for (const root of SCAN_ROOTS) visit(join(repoRoot, root));
  return out;
};

const sourceViolations = (): string[] => {
  const out = new Set<string>();
  for (const abs of sourceFiles()) {
    const rel = toRel(abs);
    const sf = ts.createSourceFile(
      abs,
      readFileSync(abs, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      abs.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    for (const text of copyProblemTexts(sf)) {
      out.add(`${rel}::${text.replace(/\s+/g, ' ').trim().slice(0, 60)}`);
    }
  }
  return [...out].sort();
};

describe('on-screen copy guard', () => {
  const current: Baseline = {
    locale: localeViolations(),
    source: sourceViolations(),
  };

  if (process.env.COPY_GUARD_WRITE_BASELINE === '1') {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;

  it('flags em dashes, Tip/Note prefixes and long strings', () => {
    expect(copyProblem('Saved — reload to see it')).toBe('em dash');
    expect(copyProblem('Tip: drag to reorder')).toBe('Tip/Note prefix');
    expect(copyProblem(Array(31).fill('word').join(' '))).toBe('over 30 words');
    expect(copyProblem('Signed-in students only.')).toBeNull();
  });

  it('adds no new long or slop-marked copy (shorten it, never add it to the baseline)', () => {
    expect(current.locale.filter((k) => !baseline.locale.includes(k))).toEqual(
      []
    );
    expect(current.source.filter((k) => !baseline.source.includes(k))).toEqual(
      []
    );
  });

  it('has no stale baseline entries (delete fixed ones from tests/fixtures/copyGuardBaseline.json)', () => {
    expect(baseline.locale.filter((k) => !current.locale.includes(k))).toEqual(
      []
    );
    expect(baseline.source.filter((k) => !current.source.includes(k))).toEqual(
      []
    );
  });
});
