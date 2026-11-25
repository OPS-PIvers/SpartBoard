import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

// Fails when a student page rebuilds sign-in, the class gate or the locked screen instead of the shared pieces.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['components', 'hooks', 'context', 'utils'];

// Each entry is the one place that may call it, with the reason.
const ALLOWED: Record<string, string> = {
  'hooks/useStudentAuthBootstrap.ts': 'the shared student sign-in',
  'hooks/useGuestFirebaseUser.ts': 'live guest sign-in for Activity Wall',
  'components/flashcards/FlashcardStaffRoute.tsx':
    'staff route: waits for hydration, never signs in anonymously',
};

const listFiles = (dir: string): string[] =>
  readdirSync(join(repoRoot, dir)).flatMap((name) => {
    const child = join(dir, name);
    if (statSync(join(repoRoot, child)).isDirectory()) return listFiles(child);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)
      ? [child]
      : [];
  });

describe('student sign-in goes through useStudentAuthBootstrap', () => {
  it('no other file waits for auth hydration', () => {
    const offenders = ROOTS.flatMap(listFiles)
      .map((f) => relative(repoRoot, join(repoRoot, f)).replace(/\\/g, '/'))
      .filter((f) => !(f in ALLOWED))
      .filter((f) =>
        /\.authStateReady\(\)/.test(readFileSync(join(repoRoot, f), 'utf8'))
      );
    expect(
      offenders,
      'Use useStudentAuthBootstrap (or bootstrapStudentAuth) from hooks/useStudentAuthBootstrap.ts'
    ).toEqual([]);
  });
});

// Student apps that gate by class; each reads the gate from usePeriodGate.
const GATED_APPS = [
  'components/quiz/QuizStudentApp.tsx',
  'components/videoActivity/VideoActivityStudentApp.tsx',
  'components/guidedLearning/GuidedLearningStudentApp.tsx',
  'components/miniApp/MiniAppStudentApp.tsx',
  'components/flashcards/FlashcardAssignmentPage.tsx',
];

describe('student class gate and screens are shared', () => {
  it('gated apps take the open check from usePeriodGate', () => {
    for (const f of GATED_APPS) {
      const text = readFileSync(join(repoRoot, f), 'utf8');
      expect(text, f).toMatch(/\busePeriodGate\(/);
      expect(text, `${f}: use usePeriodGate`).not.toMatch(
        /\bstudentCanEnter\(/
      );
    }
  });

  it('no app keeps its own locked screen, class picker or paused overlay', () => {
    const copies = ROOTS.flatMap(listFiles)
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('components/student/'))
      .filter(
        (f) =>
          /(PeriodLockedScreen|PeriodPausedOverlay|PeriodPicker)\.tsx$/.test(
            f
          ) ||
          /export const \w+(PeriodLockedScreen|PeriodPausedOverlay|PeriodPicker)\b/.test(
            readFileSync(join(repoRoot, f), 'utf8')
          )
      );
    expect(
      copies,
      'Use components/student/StudentPeriodScreens.tsx and StudentPeriodPausedOverlay.tsx'
    ).toEqual([]);
  });
});
