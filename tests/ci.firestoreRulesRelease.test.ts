/**
 * Regression test: firestore.rules must reach the project through
 * scripts/releaseFirestoreRules.mjs, not through `firebase deploy`.
 *
 * Bug (2026-09-21): from 16:42Z the Rules API began answering firebase-tools'
 * release call with 400 INVALID_ARGUMENT. The CLI discards that error and
 * POSTs a new release instead, which fails 409 ALREADY_EXISTS, so the only
 * thing in the log was a 409 that looked like a harmless race. Thirteen
 * consecutive deploys died there, and because the preview-channel step runs
 * after the backend deploy, nothing reached the dev URL for four hours. The
 * CLI sends the same request in 15.30.2, so there was no version to move to.
 *
 * The fix hands the three calls to our own script, which adds the
 * `updateMask` the API now wants. If `firestore:rules` ever goes back into the
 * bundled `firebase deploy` targets while that is still true, deploys break
 * again in exactly the same silent way — hence this test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  blockingIssues,
  isTransientStatus,
} from '../scripts/releaseFirestoreRules.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function deployScript(): string {
  return readFileSync(
    resolve(repoRoot, '.github/scripts/firebase-deploy-with-retry.sh'),
    'utf-8'
  );
}

// Every uncommented `firebase deploy` line — filter, not find, so a second
// such command can't slip past unchecked.
function deployCommands(): string[] {
  return deployScript()
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .filter((line) => !line.trimStart().startsWith('echo '))
    .filter((line) => line.includes('firebase deploy'));
}

describe('firestore.rules deploy path', () => {
  it('keeps firestore:rules out of every bundled firebase deploy', () => {
    const commands = deployCommands();
    expect(commands).toHaveLength(1);
    for (const command of commands) {
      expect(command).toContain('--only functions,firestore:indexes,storage');
      // `--only firestore` would sweep rules back in alongside indexes.
      expect(command).not.toMatch(/--only \S*(^|,)firestore(,|\s|$)/);
      expect(command).not.toContain('firestore:rules');
    }
  });

  it('releases the rules through the script instead', () => {
    expect(deployScript()).toContain(
      'node scripts/releaseFirestoreRules.mjs "$PROJECT_ID"'
    );
  });
});

describe('releaseFirestoreRules helpers', () => {
  it('blocks the release on compile errors but not on warnings', () => {
    const issues = [
      { severity: 'WARNING', description: 'Unused function: roleHasCap.' },
      { severity: 'ERROR', description: 'Unexpected token.' },
    ];
    expect(blockingIssues(issues)).toEqual([issues[1]]);
    expect(blockingIssues([issues[0]])).toEqual([]);
    expect(blockingIssues(undefined)).toEqual([]);
  });

  it('retries only the statuses the deploy wrapper treats as transient', () => {
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    // The two that broke the CLI: retrying either forever would hide a real fault.
    expect(isTransientStatus(400)).toBe(false);
    expect(isTransientStatus(409)).toBe(false);
    expect(isTransientStatus(403)).toBe(false);
  });
});
