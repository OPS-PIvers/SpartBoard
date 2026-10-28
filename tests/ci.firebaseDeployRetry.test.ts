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
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scriptPath = resolve(
  repoRoot,
  '.github/scripts/firebase-deploy-with-retry.sh'
);

// The pattern is composed from four assignments, so evaluate them as bash
// rather than reading either one as a literal.
function patternAssignments(): string {
  const lines = readFileSync(scriptPath, 'utf-8')
    .split('\n')
    .filter((line) =>
      /^(RULES_RELEASE_409|INVOKER_IAM|CPU_QUOTA|TRANSIENT_PATTERN)=/.test(line)
    );
  if (lines.length !== 4) {
    throw new Error(
      `expected RULES_RELEASE_409, INVOKER_IAM, CPU_QUOTA and TRANSIENT_PATTERN assignments, found ${lines.length}`
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

  it('retries the Cloud Run invoker IAM flake', () => {
    expect(
      classifiedTransient(
        'Error: Failed to get the IAM Policy on the Service projects/spartboard/locations/us-central1/services/foo'
      )
    ).toBe(true);
  });

  it('retries the Cloud Run CPU quota failure from a large functions rollout', () => {
    expect(
      classifiedTransient(
        'Could not create or update Cloud Run service setgoogletaskssyncv1, Container Healthcheck failed. Quota exceeded for total allowable CPU per project per region.'
      )
    ).toBe(true);
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

// Runs the script against stub pnpm/node/sleep that replay scripted deploy
// outcomes, and returns each `--only` the script deployed.
function runWithStubbedDeploys(
  outcomes: { exit: number; log: string }[],
  deployOnly?: string
): {
  status: number | null;
  onlys: string[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-retry-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  outcomes.forEach((o, i) => {
    writeFileSync(join(dir, `log${i + 1}`), o.log);
    writeFileSync(join(dir, `exit${i + 1}`), String(o.exit));
  });
  const stub = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub(
    'pnpm',
    [
      `n=$(( $(cat "${dir}/count" 2>/dev/null || echo 0) + 1 )); echo $n > "${dir}/count"`,
      `while [[ $# -gt 0 ]]; do [[ $1 == --only ]] && echo "$2" >> "${dir}/onlys"; shift; done`,
      `cat "${dir}/log$n" 2>/dev/null; exit $(cat "${dir}/exit$n" 2>/dev/null || echo 0)`,
    ].join('\n')
  );
  stub('node', 'exit 0');
  stub('sleep', 'exit 0');
  const result = spawnSync('bash', [scriptPath, 'demo'], {
    cwd: dir,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      RELEASE_FIRESTORE_RULES: 'false',
      ...(deployOnly === undefined ? {} : { FIREBASE_DEPLOY_ONLY: deployOnly }),
    },
  });
  const onlys = readFileSync(join(dir, 'onlys'), 'utf-8').trim().split('\n');
  rmSync(dir, { recursive: true, force: true });
  return { status: result.status, onlys };
}

describe('firebase-deploy-with-retry.sh CPU quota retry', () => {
  it('names the quota-failed functions on the retry so the CLI cannot skip them, then runs a full pass', () => {
    const quotaLog = [
      'Could not create or update Cloud Run service setgoogletaskssyncv1, Container Healthcheck failed. Quota exceeded for total allowable CPU per project per region.',
      '- Error Failed to update function setGoogleTasksSyncV1 in region us-central1',
      '- Error Failed to update function revokeSpotifyAuth in region us-central1',
    ].join('\n');
    const { status, onlys } = runWithStubbedDeploys([
      { exit: 2, log: quotaLog },
      { exit: 0, log: '' },
      { exit: 0, log: '' },
    ]);
    expect(status).toBe(0);
    expect(onlys).toEqual([
      'functions,firestore:indexes,storage',
      'functions:revokeSpotifyAuth,functions:setGoogleTasksSyncV1,firestore:indexes,storage',
      'functions,firestore:indexes,storage',
    ]);
  });

  it('names a lone quota-failed function from the summary block', () => {
    const quotaLog = [
      'Could not create or update Cloud Run service setgoogletaskssyncv1, Container Healthcheck failed. Quota exceeded for total allowable CPU per project per region.',
      '',
      'Functions deploy had errors with the following functions:',
      '\tsetGoogleTasksSyncV1(us-central1)',
      '',
      'Error: There was an error deploying functions',
    ].join('\n');
    const { status, onlys } = runWithStubbedDeploys([
      { exit: 2, log: quotaLog },
      { exit: 0, log: '' },
      { exit: 0, log: '' },
    ]);
    expect(status).toBe(0);
    expect(onlys).toEqual([
      'functions,firestore:indexes,storage',
      'functions:setGoogleTasksSyncV1,firestore:indexes,storage',
      'functions,firestore:indexes,storage',
    ]);
  });

  it('retries a container import failure on the quota retry, as in run 40517899145', () => {
    const quotaLog = [
      'Could not create or update Cloud Run service getviewasdrivetokenv1, Container Healthcheck failed. Quota exceeded for total allowable CPU per project per region.',
      '- Error Failed to update function getViewAsDriveTokenV1 in region us-central1',
      '- Error Failed to update function lookupSpeakReferencesV1 in region us-central1',
    ].join('\n');
    const importLog = [
      'Could not create or update Cloud Run service lookupspeakreferencesv1. Container import failed.',
      '- Error Failed to update function lookupSpeakReferencesV1 in region us-central1',
    ].join('\n');
    const { status, onlys } = runWithStubbedDeploys([
      { exit: 2, log: quotaLog },
      { exit: 2, log: importLog },
      { exit: 0, log: '' },
      { exit: 0, log: '' },
    ]);
    expect(status).toBe(0);
    expect(onlys).toEqual([
      'functions,firestore:indexes,storage',
      'functions:getViewAsDriveTokenV1,functions:lookupSpeakReferencesV1,firestore:indexes,storage',
      'functions:getViewAsDriveTokenV1,functions:lookupSpeakReferencesV1,firestore:indexes,storage',
      'functions,firestore:indexes,storage',
    ]);
  });

  it('skips the deletes pass after a quota retry of a named-functions deploy', () => {
    const quotaLog = [
      'Could not create or update Cloud Run service fetchlinkpreview, Container Healthcheck failed. Quota exceeded for total allowable CPU per project per region.',
      '- Error Failed to update function fetchLinkPreview in region us-central1',
    ].join('\n');
    const { status, onlys } = runWithStubbedDeploys(
      [
        { exit: 2, log: quotaLog },
        { exit: 0, log: '' },
      ],
      'functions:fetchLinkPreview,functions:fetchImportImage,storage'
    );
    expect(status).toBe(0);
    expect(onlys).toEqual([
      'functions:fetchLinkPreview,functions:fetchImportImage,storage',
      'functions:fetchLinkPreview,storage',
    ]);
  });

  it('fails a first-attempt container import failure without retrying', () => {
    expect(
      classifiedTransient(
        'Could not create or update Cloud Run service lookupspeakreferencesv1. Container import failed.'
      )
    ).toBe(false);
    const { status, onlys } = runWithStubbedDeploys([
      {
        exit: 2,
        log: [
          'Could not create or update Cloud Run service lookupspeakreferencesv1. Container import failed.',
          '- Error Failed to update function lookupSpeakReferencesV1 in region us-central1',
        ].join('\n'),
      },
    ]);
    expect(status).toBe(2);
    expect(onlys).toHaveLength(1);
  });

  it('fails instead of retrying blind when a quota error names no function', () => {
    const { status, onlys } = runWithStubbedDeploys([
      {
        exit: 2,
        log: 'Quota exceeded for total allowable CPU per project per region.\nError: There was an error deploying functions',
      },
    ]);
    expect(status).toBe(2);
    expect(onlys).toHaveLength(1);
  });

  it('still fails a real deploy error without retrying', () => {
    const { status, onlys } = runWithStubbedDeploys([
      { exit: 2, log: 'Error: Failed to load function definition from source' },
    ]);
    expect(status).toBe(2);
    expect(onlys).toHaveLength(1);
  });
});
