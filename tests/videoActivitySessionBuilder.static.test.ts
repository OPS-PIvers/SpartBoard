import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when client code creates a Video Activity session doc outside the shared builder.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = 'utils/videoActivitySessionDoc.ts';

const FIX =
  'Create Video Activity sessions with buildVideoActivitySessionDoc + setVideoActivitySessionDocs (utils/videoActivitySessionDoc.ts), through useVideoActivitySessionTeacher().createSession or useVideoActivityAssignments().createAssignment. Pass the window as their last argument instead of patching the new session afterwards.';

const sourceFiles = (): string[] =>
  execFileSync(
    'git',
    ['ls-files', '--', 'components', 'hooks', 'utils', 'context', 'config'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

// Names bound to the VA sessions collection in a file, plus the literal itself.
const collectionRefs = (src: string): string[] => {
  const names = [
    ...src.matchAll(/const\s+(\w+)\s*=\s*['"]video_activity_sessions['"]/g),
  ].map((m) => m[1]);
  if (
    /import[^;]*\bVIDEO_ACTIVITY_SESSIONS_COLLECTION\b[^;]*videoActivitySessionDoc/.test(
      src
    )
  )
    names.push('VIDEO_ACTIVITY_SESSIONS_COLLECTION');
  return [`['"]video_activity_sessions['"]`, ...names];
};

// A set() of the session doc itself: doc(db, <collection>, <id>) with nothing after the id.
const rootSessionSets = (src: string): number =>
  collectionRefs(src).reduce((n, ref) => {
    const re = new RegExp(
      String.raw`(?:setDoc|\.set)\(\s*doc\(\s*\w+\s*,\s*(?:${ref})\s*,\s*[^,()]+\)`,
      'g'
    );
    return n + (src.match(re)?.length ?? 0);
  }, 0);

describe('Video Activity sessions come from one builder', () => {
  it('only the builder sets a session doc', () => {
    const offenders = sourceFiles().filter(
      (f) =>
        f !== BUILDER &&
        rootSessionSets(readFileSync(resolve(repoRoot, f), 'utf8')) > 0
    );
    expect(offenders, FIX).toEqual([]);
  });

  it('the builder still sets the session doc', () => {
    expect(
      rootSessionSets(readFileSync(resolve(repoRoot, BUILDER), 'utf8'))
    ).toBe(1);
  });

  it.each([
    'hooks/useVideoActivitySession.ts',
    'hooks/useVideoActivityAssignments.ts',
  ])('%s creates through the builder', (file) => {
    const src = readFileSync(resolve(repoRoot, file), 'utf8');
    expect(src, FIX).toContain('buildVideoActivitySessionDoc(');
    expect(src, FIX).toContain('setVideoActivitySessionDocs(');
  });
});
