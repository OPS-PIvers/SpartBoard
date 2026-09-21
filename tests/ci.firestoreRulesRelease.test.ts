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
 * The three calls now go through our own script, so the real status is
 * printed. `updateMask` turned out not to be the answer, and the script walks
 * the remaining request shapes instead. If `firestore:rules` ever goes back
 * into the bundled `firebase deploy` targets while the CLI's release call is
 * still refused, deploys break again in exactly the same silent way — hence
 * this test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  blockingIssues,
  isTransientStatus,
  call,
  releaseAttempts,
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

describe('releaseFirestoreRules call()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(...outcomes: unknown[]) {
    const fetchMock = vi.fn(() => {
      const next = outcomes.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function response(status: number, body: string) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    };
  }

  // The release step now runs once, outside the bash wrapper's retry loop, so a
  // connection that never reaches a status code has to be retried here.
  it('retries a fetch rejection and returns the eventual success', async () => {
    const fetchMock = stubFetch(
      Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      response(200, '{"name":"projects/p/rulesets/abc"}')
    );
    await expect(
      call(
        'token',
        'POST',
        '/projects/p/rulesets',
        { source: {} },
        { baseDelayMs: 0 }
      )
    ).resolves.toEqual({ name: 'projects/p/rulesets/abc' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts and names the connection error', async () => {
    const fetchMock = stubFetch(
      new Error('socket hang up'),
      new Error('socket hang up')
    );
    await expect(
      call('token', 'GET', '/projects/p/releases', undefined, {
        baseDelayMs: 0,
        maxAttempts: 2,
      })
    ).rejects.toThrow('socket hang up');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // The 400 this script exists to avoid must surface immediately, not be retried.
  it('does not retry a 400 and surfaces its body', async () => {
    const fetchMock = stubFetch(
      response(400, '{"error":{"status":"INVALID_ARGUMENT"}}')
    );
    await expect(
      call(
        'token',
        'PATCH',
        '/projects/p/releases/cloud.firestore',
        {},
        {
          baseDelayMs: 0,
        }
      )
    ).rejects.toThrow('400 {"error":{"status":"INVALID_ARGUMENT"}}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 so ruleset creation can hit the prune path', async () => {
    const fetchMock = stubFetch(
      response(429, 'quota'),
      response(200, '{"ok":true}')
    );
    await expect(
      call('token', 'POST', '/projects/p/rulesets', {}, { baseDelayMs: 0 })
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('releaseFirestoreRules releaseAttempts()', () => {
  const attempts = releaseAttempts(
    'spartboard',
    'projects/spartboard/rulesets/abc'
  );

  it('points every shape at the cloud.firestore release', () => {
    expect(attempts.length).toBeGreaterThan(1);
    for (const attempt of attempts) {
      expect(attempt.path).toContain(
        '/projects/spartboard/releases/cloud.firestore'
      );
      expect(attempt.label).toBeTruthy();
      expect(JSON.stringify(attempt.body)).toContain(
        'projects/spartboard/rulesets/abc'
      );
    }
  });

  // The mask the deploy shipped first. It was rejected, so no shape should use it.
  it('never sends the release-prefixed mask path again', () => {
    for (const attempt of attempts) {
      expect(attempt.path).not.toContain('updateMask=release.rulesetName');
      expect(JSON.stringify(attempt.body)).not.toContain('release.rulesetName');
    }
  });

  it('covers a mask in the body, a mask in the query and no mask at all', () => {
    const bodies = attempts.map((a) => JSON.stringify(a.body));
    expect(bodies.some((b) => b.includes('"updateMask"'))).toBe(true);
    expect(attempts.some((a) => a.path.includes('?updateMask='))).toBe(true);
    expect(
      attempts.some(
        (a) =>
          !a.path.includes('updateMask') &&
          !JSON.stringify(a.body).includes('updateMask')
      )
    ).toBe(true);
  });
});
