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

const MAIN_GUARD =
  /^(?:\$\{\{\s*)?github\.ref == 'refs\/heads\/main'\s*(?:&&|(?:\}\})?\s*$)/;
const JOB_KEY = /^ {2}(['"]?)([\w-]+)\1:[ \t]*(?:#.*)?$/;

/** Lists jobs in a prod workflow that could run off main or read the prod secret outside its environment. */
function mainOnlyProblems(yaml: string): string[] {
  const lines = yaml.split('\n');
  const start = lines.indexOf('jobs:');
  if (start < 0) return ['no jobs found'];
  const jobs = new Map<string, string[]>();
  const problems: string[] = [];
  let current: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (/^ {2}\S/.test(line) && !/^ {2}#/.test(line)) {
      const key = JOB_KEY.exec(line);
      // An unparsed job key fails closed instead of inheriting the previous job's guard.
      if (!key) problems.push(`unparsed job line: ${line.trim()}`);
      current = key ? [] : null;
      if (key) jobs.set(key[2], current as string[]);
      continue;
    }
    current?.push(line);
  }
  if (jobs.size === 0) problems.push('no jobs found');
  for (const [id, body] of jobs) {
    const guard =
      body
        .find((l) => /^ {4}if: /.test(l))
        ?.slice(8)
        .trim() ?? '';
    if (!MAIN_GUARD.test(guard)) problems.push(`${id}: no main-only guard`);
    if (
      id === 'deploy' &&
      !body.some((l) => /^ {4}environment: production[ \t]*$/.test(l))
    )
      problems.push(`${id}: no environment: production`);
  }
  if (!jobs.has('deploy')) problems.push('deploy: job not found');
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

  it('catches an unguarded job, a bypassed guard, odd job keys and a misplaced environment', () => {
    const bad = [
      'jobs:',
      '  build:',
      "    if: github.ref == 'refs/heads/main'",
      '  job_2:',
      '    runs-on: ubuntu-latest',
      '  lint:',
      "    if: github.ref == 'refs/heads/main' || true",
      '  scoped:',
      "    if: github.ref == 'refs/heads/main' && (a || b)",
      "  'quoted':",
      '    runs-on: ubuntu-latest',
      '  commented: # note',
      '    runs-on: ubuntu-latest',
      '  deploy:',
      "    if: ${{ github.ref == 'refs/heads/main' }}",
      '  other:',
      "    if: github.ref == 'refs/heads/main'",
      '    environment: production',
      '',
    ].join('\n');
    expect(mainOnlyProblems(bad)).toEqual([
      'job_2: no main-only guard',
      'lint: no main-only guard',
      'quoted: no main-only guard',
      'commented: no main-only guard',
      'deploy: no environment: production',
    ]);
    expect(mainOnlyProblems('jobs:\n  {weird}:\n')).toContain(
      'unparsed job line: {weird}:'
    );
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
