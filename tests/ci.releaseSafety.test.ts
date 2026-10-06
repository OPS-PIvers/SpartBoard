// Guards the required check and the prod smoke-test rollback against silent regressions.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const workflows = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../.github/workflows'
);
const read = (name: string) => readFileSync(resolve(workflows, name), 'utf-8');

describe('PR Validation as a required check', () => {
  const yaml = read('pr-validation.yml');

  it('runs on every PR so the required check always reports', () => {
    expect(yaml).not.toMatch(/^\s*paths-ignore:/m);
  });

  it('fails the summary job when any validation job fails or is cancelled', () => {
    expect(yaml).toContain('- name: Fail when a check failed');
    expect(yaml).toContain(
      "contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')"
    );
  });
});

describe('production deploy', () => {
  const yaml = read('firebase-deploy.yml');

  it('smoke-tests prod and rolls hosting back on failure', () => {
    expect(yaml).toContain(
      'node scripts/smoke-test.mjs https://spartboard.web.app'
    );
    expect(yaml).toContain("steps.smoke.outcome == 'failure'");
    expect(yaml).toContain(
      'firebase hosting:clone "spartboard@${VERSION}" spartboard:live'
    );
  });

  it('never deploys after a failed or cancelled check', () => {
    expect(yaml).toContain(
      "if: ${{ !failure() && !cancelled() && needs.build.result == 'success' }}"
    );
  });
});
