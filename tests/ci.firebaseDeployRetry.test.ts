/**
 * Regression test: the firebase deploy retry wrapper must treat the
 * firebaserules `/releases` 409 as transient.
 *
 * Bug (2026-09-21): dev-paul deploys failed from 16:30Z onward, so the
 * preview channel kept serving a three-hour-old bundle and a merged UI
 * change (#3214) looked like it had never shipped. Every failure was the
 * same line —
 * `Request to https://firebaserules.googleapis.com/v1/projects/<id>/releases
 * had HTTP Error: 409, Requested entity already exists` — and the wrapper
 * classified it as a real error and exited without retrying. The
 * "Deploy to Firebase Preview Channel" step runs after the backend deploy,
 * so it was skipped on every one of those runs.
 *
 * The 409 is an echo, not a conflict: firebase-tools'
 * `updateOrCreateRelease` PATCHes the existing release and, on any thrown
 * error, falls back to POSTing a new one, which 409s precisely because the
 * release exists. The swallowed PATCH failure is the real error.
 *
 * The assertions run the pattern through the script's own assignment lines
 * and `grep -qiE`, so neither a quoting change nor a JS/ERE dialect
 * difference can make the test pass where the deploy would fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scriptPath = resolve(
  repoRoot,
  '.github/scripts/firebase-deploy-with-retry.sh'
);

// The pattern is composed from two assignments, so evaluate them as bash
// rather than reading either one as a literal.
function patternAssignments(): string {
  const lines = readFileSync(scriptPath, 'utf-8')
    .split('\n')
    .filter((line) => /^(RULES_RELEASE_409|TRANSIENT_PATTERN)=/.test(line));
  if (lines.length !== 2) {
    throw new Error(
      `expected RULES_RELEASE_409 and TRANSIENT_PATTERN assignments, found ${lines.length}`
    );
  }
  return lines.join('\n');
}

// Mirrors the script's own `grep -qiE "$TRANSIENT_PATTERN" "$LOG_FILE"`.
function classifiedTransient(logLine: string): boolean {
  const result = spawnSync(
    'bash',
    ['-c', `${patternAssignments()}\ngrep -qiE "$TRANSIENT_PATTERN"`],
    {
      input: logLine,
    }
  );
  return result.status === 0;
}

const RULES_RELEASE_409 =
  'Error: Request to https://firebaserules.googleapis.com/v1/projects/spartboard/releases had HTTP Error: 409, Requested entity already exists';

describe('firebase-deploy-with-retry.sh transient classification', () => {
  it('retries the firebaserules /releases 409 that stalled the dev preview', () => {
    expect(classifiedTransient(RULES_RELEASE_409)).toBe(true);
  });

  it('still retries the 5xx and socket signatures the wrapper was written for', () => {
    expect(
      classifiedTransient(
        'Error: Request to https://firestore.googleapis.com had HTTP Error: 503'
      )
    ).toBe(true);
    expect(classifiedTransient('Error: read ECONNRESET')).toBe(true);
  });

  it('does not retry a 409 from another service', () => {
    expect(
      classifiedTransient(
        'Error: Request to https://cloudfunctions.googleapis.com/v2/projects/spartboard/locations/us-central1/functions had HTTP Error: 409, Requested entity already exists'
      )
    ).toBe(false);
  });

  it('does not retry a real deploy error', () => {
    expect(
      classifiedTransient(
        'Error: Compilation errors in firestore.rules:\n[E] 42:3 - Unexpected.'
      )
    ).toBe(false);
    expect(
      classifiedTransient(
        'Error: HTTP Error: 403, The caller does not have permission'
      )
    ).toBe(false);
  });
});
