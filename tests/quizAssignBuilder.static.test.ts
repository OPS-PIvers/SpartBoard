import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a quiz assign hand-builds createAssignment's options instead of using the shared builder.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX = [
  'Every quiz assign builds its createAssignment options with buildAssignCreateOptions (hooks/quizAssign/builders.ts), so each entry point writes the same fields (lenient translated answers, work kind, start status, late work, audience).',
  'Schoology and Classroom go through assignFromCourse; PLC steppers through plcStepperCreateFields. When an assign needs a field the builder lacks, add it to the builder.',
  "The allowlist below only shrinks: an entry needs Paul's OK named in the PR.",
].join('\n');

/** The call's top-level arguments, split on commas outside brackets. */
function topLevelArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(args.slice(start).trim());
  return parts.filter((p) => p.length > 0);
}

/** A literal options object (the third argument) means the assign built its own. */
function handBuiltOptions(args: string): boolean {
  const code = args.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const options = topLevelArgs(code)[2];
  return !!options && options.startsWith('{');
}

// file -> number of createAssignment calls that may hand-build options, and why.
const ALLOWED: Record<string, { count: number; why: string }> = {
  // A paper batch's paused record is never a live door for students.
  'components/widgets/QuizWidget/Widget.tsx': { count: 1, why: 'paper batch' },
  // A view-only link has no class, window or grading.
  'hooks/useQuizLinkShare.ts': { count: 1, why: 'view-only link' },
  // AB-391 deletes this modal's assign half.
  'components/plc/assignments/PlcAssignmentConfigModal.tsx': {
    count: 1,
    why: 'AB-391',
  },
};

const QUIZ_HOOK =
  /from '@\/hooks\/(useQuizAssignments|quizAssignments\/types)'|assignFromCourse/;

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', 'components', 'hooks', 'utils', 'context'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
}

/** The argument text of each `createAssignment(` call, up to its closing paren. */
function createAssignmentCalls(src: string): string[] {
  const calls: string[] = [];
  const re = /\bcreate(?:Quiz)?Assignment\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    calls.push(src.slice(m.index + m[0].length, i - 1));
  }
  return calls;
}

describe('quiz assigns use the shared options builder', () => {
  it('no quiz createAssignment call hand-builds its options', () => {
    const offenders: string[] = [];
    const seen: Record<string, number> = {};
    for (const file of sourceFiles()) {
      const src = readFileSync(resolve(repoRoot, file), 'utf8');
      if (!QUIZ_HOOK.test(src)) continue;
      for (const args of createAssignmentCalls(src)) {
        if (!handBuiltOptions(args)) continue;
        seen[file] = (seen[file] ?? 0) + 1;
        if (seen[file] > (ALLOWED[file]?.count ?? 0)) offenders.push(file);
      }
    }
    expect(offenders, FIX).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const stale: string[] = [];
    for (const [file, { count }] of Object.entries(ALLOWED)) {
      const src = readFileSync(resolve(repoRoot, file), 'utf8');
      const used = createAssignmentCalls(src).filter(handBuiltOptions).length;
      if (used < count) stale.push(`${file} (${used} of ${count})`);
    }
    expect(stale, 'Shrink the allowlist to match.').toEqual([]);
  });
});
