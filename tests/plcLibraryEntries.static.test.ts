import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a new file opens its own listener or tombstone write on a PLC library subcollection.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX =
  'Read and unshare PLC library rows through usePlcLibraryEntries (hooks/usePlcLibraryEntries.ts): add a PlcLibrarySpec for the kind instead of a new onSnapshot or deletedAt write. Row confirm/toast plumbing goes through usePlcLibraryActions.';

const LIBRARY_SUBS =
  /(QUIZZES_SUBCOLLECTION|VIDEO_ACTIVITIES_SUBCOLLECTION|RUBRICS_SUBCOLLECTION|PLC_FLASHCARD_SETS|BANKS_COLLECTION|'quizzes'|'video_activities'|'rubrics'|'flashcard_sets'|'question_banks')/;

const LISTENER_ALLOWED: Record<string, string> = {
  'hooks/usePlcLibraryEntries.ts': 'The one listener.',
  'hooks/usePlcTrash.ts':
    'Trash lists tombstones, the inverse of the live library.',
  'hooks/useBankSources.ts':
    'Listens across every PLC the teacher is in at once.',
  'hooks/useQuestionBanks.ts':
    "One-shot header queries; its listener is the teacher's own banks.",
};

const TOMBSTONE_ALLOWED: Record<string, string> = {
  'hooks/usePlcLibraryEntries.ts': 'The one soft delete and restore.',
};

function sourceFiles(): string[] {
  const out = execFileSync(
    'git',
    ['ls-files', 'hooks', 'components', 'context', 'utils'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f));
}

describe('PLC library rows go through usePlcLibraryEntries', () => {
  const files = sourceFiles().map((f) => ({
    path: f,
    text: readFileSync(resolve(repoRoot, f), 'utf8'),
  }));

  it('opens no other listener on a PLC library subcollection', () => {
    const offenders = files.filter(({ path, text }) => {
      if (path in LISTENER_ALLOWED || !text.includes('onSnapshot(')) {
        return false;
      }
      return text
        .split(/collection\(\s*db,/)
        .slice(1)
        .some((after) => {
          const args = after.slice(0, after.indexOf(')'));
          return /plcs|PLCS/.test(args) && LIBRARY_SUBS.test(args);
        });
    });
    expect(
      offenders.map((f) => f.path),
      FIX
    ).toEqual([]);
  });

  it('writes no other unshare or restore tombstone on a PLC library row', () => {
    const offenders = files.filter(({ path, text }) => {
      if (path in TOMBSTONE_ALLOWED) return false;
      return (
        /deletedAt: (Date\.now\(\)|now|null),\s*updatedAt: (Date\.now\(\)|now)/.test(
          text
        ) && LIBRARY_SUBS.test(text)
      );
    });
    expect(
      offenders.map((f) => f.path),
      FIX
    ).toEqual([]);
  });
});
