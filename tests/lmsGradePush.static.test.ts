import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// AB-389: every LMS grade push offers the server's final-score path, so a new push surface can't build its own grades.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX =
  "Send `source: 'final-scores'` with the session id (runClassroomGradePush `finalScores`, runPublishGradePush `finalScores`, a tool column payload's `finalScores`) when canAccessFeature('lms-push-final-scores') is on. The server builds the grades from the gradebook final score.";

// The shared helpers that carry both paths themselves.
const HELPERS = new Set([
  'utils/runClassroomGradePush.ts',
  'utils/publishGradePush.ts',
  'utils/classroomGradePush.ts',
  'utils/ltiGradePush.ts',
  'utils/schoologyToolColumns.ts',
  'hooks/useSchoologyToolColumnPush.tsx',
]);

const PUSH_CALLS = [
  /runClassroomGradePush\(/,
  /runPublishGradePush</,
  /runPublishGradePush\(/,
  /useSchoologyToolColumnPush\(/,
  /'ltiPushGradesForAssignmentV1'/,
  /pushClassroomGradesForAssignment\(/,
  /pushClassroomFinalGradesForAssignment\(/,
];

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', 'components', 'hooks', 'utils', 'context'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

describe('LMS grade pushes', () => {
  it('offer the final-score path wherever a push starts', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (HELPERS.has(file)) continue;
      const text = readFileSync(resolve(repoRoot, file), 'utf8');
      if (!PUSH_CALLS.some((re) => re.test(text))) continue;
      if (!text.includes("'lms-push-final-scores'")) offenders.push(file);
    }
    expect(offenders, `${offenders.join('\n')}\n\n${FIX}`).toEqual([]);
  });
});
