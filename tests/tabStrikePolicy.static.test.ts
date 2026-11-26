import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails on a second tab-away policy or a hand-rolled offline listener in app code.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const grep = (pattern: string): string[] => {
  try {
    return execFileSync(
      'git',
      [
        'grep',
        '-l',
        '-E',
        pattern,
        '--',
        'components',
        'hooks',
        'utils',
        'context',
        '*.tsx',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .split('\n')
      .filter((f) => f && !/\.test\.tsx?$/.test(f));
  } catch {
    return [];
  }
};

describe('one tab-away policy', () => {
  it('only useTabStrikePolicy drives the tracker', () => {
    const users = grep('\\buseTabAwayTracker\\(').filter(
      (f) => f !== 'hooks/useTabAwayTracker.ts'
    );
    expect(
      users,
      'Student apps use useTabStrikePolicy and TabStrikeWarning (hooks/useTabStrikePolicy.ts, components/common/TabWarningModal.tsx), not the tracker directly.'
    ).toEqual(['hooks/useTabStrikePolicy.ts']);
  });

  it('only useOnlineStatus listens for offline', () => {
    const listeners = grep('addEventListener\\([\'"]offline[\'"]').filter(
      // The teacher remote's own connection state.
      (f) => f !== 'components/remote/useRemoteConnection.ts'
    );
    expect(
      listeners,
      'Read connectivity with hooks/useOnlineStatus.ts; student pages show components/common/StudentOfflineBanner.tsx.'
    ).toEqual(['hooks/useOnlineStatus.ts']);
  });
});
