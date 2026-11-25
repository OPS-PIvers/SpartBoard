import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

// Fails when a student page writes its own hydrate-then-sign-in instead of the shared hook.
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
