import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

// Fails when a kind grows its own Assigned tab class actions instead of using hooks/useAssignmentClassActions.ts.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX = [
  'Assigned tab class actions (Open, Pause, Close, Close all, Move to Finished, Undo) have one path: hooks/useAssignmentClassActions.ts.',
  'A kind gives it an AssignmentLifecycle; a kind whose session only the server writes also gives it an AssignmentWriter (see components/widgets/Writing/utils/writingClassLifecycle.ts). Undo is restoreRun.',
].join('\n');

const SHARED_HOOK = 'hooks/useAssignmentClassActions.ts';
const WRITING_WRITER =
  'components/widgets/Writing/utils/writingClassLifecycle.ts';
const WRITING_CALLABLE = 'hooks/useWritingAssignmentSessions.ts';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });

const files = ['components', 'hooks', 'utils']
  .flatMap((d) => walk(resolve(repoRoot, d)))
  .map((f) => relative(repoRoot, f).replace(/\\/g, '/'));
const read = (f: string) => readFileSync(resolve(repoRoot, f), 'utf8');

describe('Assigned tab class actions have one path', () => {
  it('has no per-kind class actions hook beside the shared one', () => {
    const offenders = files.filter((f) => {
      if (f === SHARED_HOOK) return false;
      const src = read(f);
      return (
        /function use\w*ClassActions\s*\(/.test(src) &&
        !src.includes('useAssignmentClassActions(')
      );
    });
    expect(
      existsSync(resolve(repoRoot, 'hooks/useWritingClassActions.ts'))
    ).toBe(false);
    expect(offenders, FIX).toEqual([]);
  });

  it('sends Writing Assigned tab writes only through the Writing writer', () => {
    const offenders = files.filter((f) => {
      if (f === WRITING_WRITER || f === WRITING_CALLABLE) return false;
      // Each updateWritingSession call's argument, up to the first `})`.
      const calls = read(f).split('updateWritingSession(').slice(1);
      return calls.some((c) =>
        /\bendIfAllClosed\b|\bmarks\b|\breopen\b|\bend\s*:/.test(
          c.slice(0, c.indexOf('})') + 1 || undefined)
        )
      );
    });
    expect(offenders, FIX).toEqual([]);
  });

  it('keeps one Undo for the shared kinds', () => {
    const offenders = files.filter(
      (f) =>
        f !== SHARED_HOOK && /(undoWritingClose|undoMoveToDone)\b/.test(read(f))
    );
    expect(offenders, FIX).toEqual([]);
  });
});
