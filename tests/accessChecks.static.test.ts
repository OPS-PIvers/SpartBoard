import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when an access check is hand-written again instead of using its one shared path.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Non-test .ts/.tsx files tracked by git under the given folders. */
function sources(...dirs: string[]): string[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...dirs],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
}

function filesMatching(files: string[], pattern: RegExp): string[] {
  return files.filter((f) =>
    pattern.test(readFileSync(resolve(repoRoot, f), 'utf8'))
  );
}

const CLIENT_DIRS = ['components', 'context', 'hooks', 'utils', 'config'];

describe('access checks have one path', () => {
  it('share-link tracking goes through canAccessFeature', () => {
    expect(
      filesMatching(sources(...CLIENT_DIRS), /canSeeShareTracking/)
    ).toEqual([]);
  });

  it('paper answer sheets are gated only by usePaperAnswerSheetsGate', () => {
    // The flag alone ignores the admin rollout switch.
    expect(
      filesMatching(
        sources(...CLIENT_DIRS),
        /canAccessFeature\(\s*'paper-answer-sheets'\s*\)/
      )
    ).toEqual(['hooks/usePaperAnswerSheetsGate.ts']);
    expect(
      filesMatching(
        sources('functions/src'),
        /'admin_settings\/paper_answer_sheets'/
      )
    ).toEqual(['functions/src/paperAnswerSheetsSettings.ts']);
  });

  it('widget permission docs are resolved only by resolveWidgetAccess', () => {
    // Dock seeding once skipped tiers and buildings with its own copy.
    expect(
      filesMatching(
        sources('context'),
        /\.accessLevel\s*(?:!==|===)|case 'beta':/
      ).filter((f) => f !== 'context/AuthContext.tsx')
    ).toEqual([]);
  });

  it('super-admin and live-admin checks come from functions/src/authz.ts', () => {
    const server = sources('functions/src');
    expect(filesMatching(server, /\bisSiteWideAdmin\(/)).toEqual([
      'functions/src/authz.ts',
    ]);
    expect(
      filesMatching(server, /function isLiveAdmin\b/).filter(
        (f) => f !== 'functions/src/authz.ts'
      )
    ).toEqual([]);
  });
});
