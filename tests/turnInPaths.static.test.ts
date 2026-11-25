import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a turn-in path decides who stays open at a Close on its own instead of calling staysOpenAtClose (AB-388).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TURN_IN_WRITE =
  /buildTeacherSubmitUpdate|buildQuizFinalizeUpdate|completionPatch\(|turnInResponses\(|completedAt: (now|stamp|at)\b/;
const OWN_PREDICATE = /reopenedFor|isLetIn\(|passActive\(|studentSetTime\(/;

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', 'utils', 'hooks', 'components', 'context', 'functions/src'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
}

describe('one stays-open rule for every turn-in', () => {
  it('turn-in code reads passes and reopens only through staysOpenAtClose', () => {
    const offenders = sourceFiles().filter((f) => {
      const src = readFileSync(resolve(repoRoot, f), 'utf8');
      return (
        TURN_IN_WRITE.test(src) &&
        OWN_PREDICATE.test(src) &&
        !src.includes('staysOpenAtClose')
      );
    });
    expect(
      offenders,
      'Use staysOpenAtClose (utils/staysOpenAtClose.ts, or functions/src/staysOpenAtClose.ts on the server) to decide who a Close leaves open, and add any new case to functions/src/staysOpenAtClose.cases.json.'
    ).toEqual([]);
  });
});
