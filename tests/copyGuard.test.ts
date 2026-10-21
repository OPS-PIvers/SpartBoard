import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, resolve, dirname, sep } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import {
  attemptWordingProblem,
  attemptWordingTexts,
  copyProblem,
  copyProblemTexts,
} from '@/scripts/widget-grader/static/copyGuard.ts';

// Blocks new long or slop-marked on-screen copy (docs/plans/shipped/ALWAYS_VISIBLE_COPY.md, Phase 6).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(repoRoot, 'tests/fixtures/copyGuardBaseline.json');
const SCAN_ROOTS = ['components', 'App.tsx'];
const SKIP_DIRS = ['components/legal', 'components/dev'];
const ATTEMPT_SCAN_ROOTS = [
  ...SCAN_ROOTS,
  'utils',
  'hooks',
  'context',
  'config',
];
const LOCALES = ['en', 'de', 'es', 'fr'];
// Baseline keys use POSIX separators; path.relative returns `\` on Windows.
const toRel = (abs: string) => relative(repoRoot, abs).split(sep).join('/');
interface Baseline {
  locale: string[];
  source: string[];
}

const localeViolations = (
  locale = 'en',
  problem: (text: string) => unknown = copyProblem
): string[] => {
  const en = JSON.parse(
    readFileSync(join(repoRoot, `locales/${locale}.json`), 'utf8')
  ) as unknown;
  const out: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      if (problem(node)) out.push(path);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(en, '');
  return out.sort();
};

const sourceFiles = (roots = SCAN_ROOTS): string[] => {
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
  for (const root of roots) visit(join(repoRoot, root));
  return out;
};

const parse = (abs: string) =>
  ts.createSourceFile(
    abs,
    readFileSync(abs, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

const attemptWordingViolations = (): string[] => {
  const out: string[] = [];
  for (const abs of sourceFiles(ATTEMPT_SCAN_ROOTS)) {
    for (const text of attemptWordingTexts(parse(abs))) {
      out.push(`${toRel(abs)}::${text.replace(/\s+/g, ' ').trim()}`);
    }
  }
  for (const locale of LOCALES) {
    for (const key of localeViolations(locale, attemptWordingProblem)) {
      out.push(`locales/${locale}.json::${key}`);
    }
  }
  return out;
};

const sourceViolations = (): string[] => {
  const out = new Set<string>();
  for (const abs of sourceFiles()) {
    const rel = toRel(abs);
    const sf = parse(abs);
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

  it('flags "try" or "take" used to mean an attempt', () => {
    for (const text of [
      'Tries per card',
      'Try {{current}} of {{total}}',
      'Play my try',
      '3 takes left',
      'Unlimited tries',
      'First-try accuracy',
      '{{count}} first try',
      'Number of takes',
      'Takes',
      'Best try',
      'Try #2',
      '2nd try',
      'Takes per student',
      'Most students who tried these missed them.',
    ]) {
      expect(attemptWordingProblem(text), text).toBe(true);
    }
    for (const text of [
      'Try again',
      'Take a photo',
      'Take Screenshot',
      'Try another study mode.',
      'This may take a few seconds.',
      'Each wrong pick takes points away.',
      'Try it as a student',
      'Attempts per card',
      "What's your take?",
      'Students first take the pre-test',
      'Take 3 of the photos',
      'Swipe takes left',
      'She tries the new one',
      'Students tried to sign in',
    ]) {
      expect(attemptWordingProblem(text), text).toBe(false);
    }
  });

  it('says "attempts", never "tries" or "takes" (fix the string, there is no baseline)', () => {
    expect(attemptWordingViolations()).toEqual([]);
  }, 30_000);
});
