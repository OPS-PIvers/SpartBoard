// Guards plan-deploy.sh: per-branch hosting sites and the shared-backend guard.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(repoRoot, '.github/scripts/plan-deploy.sh');

function plan(
  branch: string,
  files: string[],
  { containsDevPaul = true, full = false, otherDeployedLast = false } = {}
): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'plan-deploy-'));
  const out = join(dir, 'out');
  try {
    const result = spawnSync('bash', [script, branch, 'abc', String(full)], {
      env: {
        ...process.env,
        GITHUB_OUTPUT: out,
        CHANGED_FILES: files.join('\n'),
        CONTAINS_DEV_PAUL: String(containsDevPaul),
        OTHER_BRANCH_DEPLOYED_LAST: String(otherDeployedLast),
      },
    });
    expect(result.status).toBe(0);
    return Object.fromEntries(
      readFileSync(out, 'utf-8')
        .trim()
        .split('\n')
        .map((line) => line.split('=') as [string, string])
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('plan-deploy.sh', () => {
  it('gives each developer their own hosting site', () => {
    expect(plan('dev-paul', []).site_suffix).toBe('dev');
    expect(plan('dev-bailey', []).site_suffix).toBe('dev-bailey');
    expect(plan('dev-someone', []).site_suffix).toBe('');
  });

  it('skips the backend for frontend-only and test-only changes', () => {
    expect(plan('dev-paul', ['components/a.tsx', 'docs/b.md']).backend).toBe(
      'false'
    );
    expect(plan('dev-paul', ['functions/src/a.test.ts']).backend).toBe('false');
  });

  it('deploys only the backend targets that changed', () => {
    const p = plan('dev-paul', ['functions/src/a.ts', 'storage.rules']);
    expect(p).toMatchObject({
      backend: 'true',
      deploy_only: 'functions,storage',
      release_rules: 'false',
    });
    expect(plan('dev-paul', ['firestore.rules'])).toMatchObject({
      backend: 'true',
      deploy_only: '',
      release_rules: 'true',
    });
    expect(plan('dev-paul', ['scripts/minifyRules.mjs'])).toMatchObject({
      backend: 'true',
      release_rules: 'true',
    });
  });

  it('redeploys rules, indexes and Storage on dev-paul after another branch deployed last', () => {
    expect(
      plan('dev-paul', ['components/a.tsx'], { otherDeployedLast: true })
    ).toMatchObject({
      backend: 'true',
      deploy_only: 'firestore:indexes,storage',
      release_rules: 'true',
      indexes: 'true',
    });
    expect(
      plan('dev-bailey', ['components/a.tsx'], { otherDeployedLast: true })
        .backend
    ).toBe('false');
    expect(
      plan('main', ['components/a.tsx'], { otherDeployedLast: true })
    ).toMatchObject({ backend: 'false', release_rules: 'false' });
    expect(plan('dev-paul', ['components/a.tsx']).backend).toBe('false');
  });

  it('never deploys the backend from a branch behind dev-paul', () => {
    const files = ['functions/src/a.ts'];
    expect(plan('dev-bailey', files, { containsDevPaul: false }).backend).toBe(
      'false'
    );
    expect(plan('dev-bailey', files).backend).toBe('true');
  });

  it('plans prod from the previous main commit without the dev-paul guard', () => {
    expect(
      plan('main', ['functions/src/a.ts'], { containsDevPaul: false })
    ).toMatchObject({ backend: 'true', deploy_only: 'functions' });
    expect(plan('main', ['components/a.tsx']).backend).toBe('false');
  });

  it('names only the affected functions on dev-paul', () => {
    expect(
      plan('dev-paul', ['functions/src/linkPreview.ts', 'storage.rules'])
    ).toMatchObject({
      backend: 'true',
      deploy_only: 'functions:fetchLinkPreview,storage',
    });
  });

  it('deploys every function from other dev branches, which diff against dev-paul', () => {
    expect(
      plan('dev-bailey', ['functions/src/linkPreview.ts']).deploy_only
    ).toBe('functions');
  });

  it('skips functions when the changed code reaches none of them', () => {
    expect(
      plan('dev-paul', ['functions/src/testing/stubFirestore.ts'])
    ).toMatchObject({ backend: 'false', deploy_only: '' });
  });

  it('deploys only the affected functions on main, like dev-paul', () => {
    expect(plan('main', ['functions/src/linkPreview.ts']).deploy_only).toMatch(
      /^functions:/
    );
    expect(plan('main', ['functions/src/index.ts']).deploy_only).toBe(
      'functions'
    );
  });

  it('redeploys every prod target when a deploy script or the narrowing changes', () => {
    for (const script of [
      '.github/scripts/affected-functions.mjs',
      '.github/scripts/function-targets.mjs',
      '.github/scripts/firebase-deploy-with-retry.sh',
    ]) {
      expect(plan('main', [script]).deploy_only).toBe(
        'functions,firestore:indexes,storage'
      );
    }
  });

  it('deploys every function on dev when the change could reach them all', () => {
    expect(plan('dev-paul', ['functions/src/index.ts']).deploy_only).toBe(
      'functions'
    );
    expect(
      plan('dev-paul', ['firebase.json', 'functions/src/linkPreview.ts'])
        .deploy_only
    ).toBe('functions');
    expect(
      plan('dev-paul', ['.github/scripts/affected-functions.mjs']).deploy_only
    ).toBe('functions,firestore:indexes,storage');
  });

  it('deploys every target on a full-backend dispatch', () => {
    expect(plan('dev-paul', [], { full: true })).toMatchObject({
      backend: 'true',
      deploy_only: 'functions,firestore:indexes,storage',
      release_rules: 'true',
    });
  });
});
