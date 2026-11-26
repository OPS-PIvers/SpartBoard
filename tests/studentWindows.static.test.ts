import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// One path for a student's own Opens and Closes: one resolver in every student app, one pointer sync in every lifecycle.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

// Every student app resolves the student's window through the shared resolver or hook.
const STUDENT_APPS: Record<string, RegExp> = {
  'components/quiz/QuizStudentApp.tsx': /\bresolveEffectiveWindow\(/,
  'components/flashcards/flashcardStudentView.ts': /\bresolveEffectiveWindow\(/,
  'utils/writingStudentView.ts': /\bresolveWritingCloseAt\(/,
  'components/videoActivity/VideoActivityStudentApp.tsx':
    /\buseStudentWindow\(/,
  'components/guidedLearning/GuidedLearningStudentApp.tsx':
    /\buseStudentWindow\(/,
  'components/miniApp/MiniAppStudentApp.tsx': /\buseStudentWindow\(/,
  'hooks/useStudentAssignments.ts': /\bclassCloseAt\(/,
};

describe('per-student windows stay on one path', () => {
  it.each(Object.entries(STUDENT_APPS))(
    '%s reads the window through the shared resolver',
    (path, call) => {
      expect(
        call.test(read(path)),
        `${path} must resolve the student's window with utils/assignmentWindow.ts, utils/studentWindow.ts or hooks/useStudentWindow.ts.`
      ).toBe(true);
    }
  );

  it('every reopen sync goes through syncPointerWindows', () => {
    const files = execFileSync(
      'git',
      ['grep', '-l', '-E', 'onWindowCleared(\\(|:)', '--', '*.ts', '*.tsx'],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !/\.test\.tsx?$|^tests\/|components\/dev\//.test(f))
      .filter((f) => f !== 'hooks/useAssignmentClassActions.ts');
    const offenders = files.filter((f) => {
      const src = read(f);
      // A lifecycle that implements the sync, not one that only types or forwards it.
      const implements_ = /onWindowCleared(:\s*\(|\s*\()[^)]*\)\s*(=>|\{)/.test(
        src
      );
      return implements_ && !src.includes('syncPointerWindows(');
    });
    expect(
      offenders,
      'Sync pointer windows with syncPointerWindows (utils/pointerWindowSync.ts), never a hand-written setAssignmentTargets call.'
    ).toEqual([]);
  });

  it('keeps staleWindowOverrides in one place', () => {
    const files = execFileSync(
      'git',
      ['grep', '-l', 'function staleWindowOverrides', '--', '*.ts', '*.tsx'],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !f.startsWith('tests/'));
    expect(files).toEqual(['utils/pointerWindowSync.ts']);
  });
});
