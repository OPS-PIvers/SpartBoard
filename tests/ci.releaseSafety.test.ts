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

/** Lists jobs in a prod workflow that could run off main or read the prod secret outside its environment. */
function mainOnlyProblems(yaml: string): string[] {
  const jobs = yaml.slice(yaml.indexOf('\njobs:') + 1);
  const blocks = jobs.split(/^ {2}(?=[\w-]+:[ \t]*$)/m).slice(1);
  if (blocks.length === 0) return ['no jobs found'];
  const problems: string[] = [];
  for (const block of blocks) {
    const id = block.split(':')[0];
    const guard = /\n {4}if: (.*)/.exec(block)?.[1] ?? '';
    if (!/github\.ref == 'refs\/heads\/main'/.test(guard))
      problems.push(`${id}: no main-only guard`);
    else if (guard.includes('||'))
      problems.push(`${id}: guard is bypassed with ||`);
    if (id === 'deploy' && !/\n {4}environment: production[ \t]*$/m.test(block))
      problems.push(`${id}: no environment: production`);
  }
  if (!blocks.some((b) => b.startsWith('deploy:')))
    problems.push('deploy: job not found');
  return problems;
}

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

describe('change-aware backend deploys', () => {
  it('diff against the last successful deploy, not the previous push', () => {
    for (const name of ['firebase-deploy.yml', 'firebase-dev-deploy.yml']) {
      const yaml = read(name);
      expect(yaml).not.toContain('github.event.before');
      expect(yaml).toContain('/runs?branch=$GITHUB_REF_NAME&status=success');
    }
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

  it('carries assets forward beside the backend deploy and waits before hosting', () => {
    const start = yaml.indexOf(
      "- name: Start carrying recent builds' assets forward"
    );
    const backend = yaml.indexOf('- name: Deploy Firebase Rules, Indexes');
    const wait = yaml.indexOf("- name: Carry recent builds' assets forward");
    const hosting = yaml.indexOf('- name: Deploy to Firebase Hosting (Live)');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(backend);
    expect(backend).toBeLessThan(wait);
    expect(wait).toBeLessThan(hosting);
    expect(yaml).toContain('exit "$(cat "$RUNNER_TEMP/carry-forward.exit")"');
  });

  it('runs every job from main only and binds the prod secret to the deploy job', () => {
    expect(mainOnlyProblems(yaml)).toEqual([]);
    expect(yaml).not.toContain("github.ref != 'refs/heads/main'");
  });

  it('catches an unguarded job, a bypassed guard and a misplaced environment', () => {
    const bad = [
      'jobs:',
      '  build:',
      "    if: github.ref == 'refs/heads/main'",
      '  job_2:',
      '    runs-on: ubuntu-latest',
      '  lint:',
      "    if: github.ref == 'refs/heads/main' || true",
      '  deploy:',
      "    if: github.ref == 'refs/heads/main'",
      '  other:',
      "    if: github.ref == 'refs/heads/main'",
      '    environment: production',
      '',
    ].join('\n');
    expect(mainOnlyProblems(bad)).toEqual([
      'job_2: no main-only guard',
      'lint: guard is bypassed with ||',
      'deploy: no environment: production',
    ]);
  });

  it('never deploys after a failed or cancelled check', () => {
    expect(yaml).toContain(
      "if: ${{ github.ref == 'refs/heads/main' && !failure() && !cancelled() && needs.build.result == 'success' }}"
    );
  });
});

describe('lunch menu sync', () => {
  const yaml = read('sync-lunch-menus.yml');
  const [, prod = '', dev = ''] = yaml.split(/^ {2}sync-(?:prod|dev):$/m);

  it('reads the prod secret only in a main-only job bound to the production environment', () => {
    expect(prod).toContain("github.ref == 'refs/heads/main'");
    expect(prod).toContain('environment: production');
    expect(prod).toContain('secrets.FIREBASE_SERVICE_ACCOUNT');
    expect(dev).not.toContain('FIREBASE_SERVICE_ACCOUNT');
    expect(yaml.match(/FIREBASE_SERVICE_ACCOUNT/g)).toHaveLength(1);
  });
});
