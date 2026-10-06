// Guards plan-dev-deploy.sh: per-branch hosting sites and the shared-backend guard.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(repoRoot, '.github/scripts/plan-dev-deploy.sh');

function plan(
  branch: string,
  files: string[],
  { containsDevPaul = true, full = false } = {}
): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'plan-dev-deploy-'));
  const out = join(dir, 'out');
  try {
    const result = spawnSync('bash', [script, branch, 'abc', String(full)], {
      env: {
        ...process.env,
        GITHUB_OUTPUT: out,
        CHANGED_FILES: files.join('\n'),
        CONTAINS_DEV_PAUL: String(containsDevPaul),
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

describe('plan-dev-deploy.sh', () => {
  it('gives each developer their own hosting site', () => {
    expect(plan('dev-paul', []).site).toBe('spartboard-dev');
    expect(plan('dev-bailey', []).site).toBe('spartboard-dev-bailey');
    expect(plan('dev-someone', []).site).toBe('');
  });

  it('skips the backend for frontend-only and test-only changes', () => {
    expect(plan('dev-paul', ['components/a.tsx', 'docs/b.md']).backend).toBe(
      'false'
    );
    expect(plan('dev-paul', ['functions/src/a.test.ts']).backend).toBe(
      'false'
    );
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
  });

  it('never deploys the backend from a branch behind dev-paul', () => {
    const files = ['functions/src/a.ts'];
    expect(plan('dev-bailey', files, { containsDevPaul: false }).backend).toBe(
      'false'
    );
    expect(plan('dev-bailey', files).backend).toBe('true');
  });

  it('deploys every target on a full-backend dispatch', () => {
    expect(plan('dev-paul', [], { full: true })).toMatchObject({
      backend: 'true',
      deploy_only: 'functions,firestore:indexes,storage',
      release_rules: 'true',
    });
  });
});
