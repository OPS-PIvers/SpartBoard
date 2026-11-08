// Guards check-mode.mjs: a dev push skips checks only for docs-only changes or a tree PR Validation fully checked.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  decideMode,
  prChecksRan,
  REQUIRED_PR_JOBS,
} from '@/.github/scripts/check-mode.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name: string) =>
  readFileSync(resolve(root, '.github/workflows', name), 'utf-8');

const passedJobs = [
  'Code Quality (lint-app 1/3)',
  'Code Quality (type-check + format + lint-functions)',
  'Unit Tests (shard 1/6)',
  'Unit Tests (functions)',
  'Unit Tests (count guard)',
  'Firestore Rules Tests (shard 1/4)',
  'Build',
  'E2E Tests',
].map((name) => ({ name, conclusion: 'success' }));

type ModeInput = Parameters<typeof decideMode>[0];

function input(overrides: Partial<ModeInput> = {}): ModeInput {
  return {
    full: false,
    backend: false,
    changedFiles: ['components/a.tsx'],
    headTree: 'tree1',
    mergedPrs: [{ number: 5, head: 'head1' }],
    treeOf: () => Promise.resolve('tree1'),
    baseIsInHead: () => Promise.resolve(true),
    successfulRuns: () => Promise.resolve([1]),
    jobsOf: () => Promise.resolve(passedJobs),
    ...overrides,
  };
}

describe('check-mode.mjs', () => {
  it('reuses a PR whose head had this exact tree and ran every check', async () => {
    expect(await decideMode(input())).toBe('reuse');
  });

  it('runs everything when the trees differ, or no merged PR or passing run exists', async () => {
    expect(
      await decideMode(input({ treeOf: () => Promise.resolve('other') }))
    ).toBe('full');
    expect(await decideMode(input({ mergedPrs: [] }))).toBe('full');
    // A PR behind its base was validated on a merge ref holding other commits, not on this tree.
    expect(
      await decideMode(input({ baseIsInHead: () => Promise.resolve(false) }))
    ).toBe('full');
    expect(
      await decideMode(input({ successfulRuns: () => Promise.resolve([]) }))
    ).toBe('full');
  });

  it('never reuses a PR run that skipped a required check', async () => {
    for (const prefix of REQUIRED_PR_JOBS) {
      const jobs = passedJobs.map((job) =>
        job.name.startsWith(prefix) ? { ...job, conclusion: 'skipped' } : job
      );
      expect(prChecksRan(jobs)).toBe(false);
      expect(
        await decideMode(input({ jobsOf: () => Promise.resolve(jobs) }))
      ).toBe('full');
    }
    // A docs-only PR run or one that reused a dev-branch run has no check jobs at all.
    expect(prChecksRan([{ name: 'E2E Tests', conclusion: 'success' }])).toBe(
      false
    );
    // The old combined job name never satisfies the split jobs.
    expect(
      prChecksRan(
        passedJobs
          .filter((job) => !job.name.startsWith('Unit Tests (functions)'))
          .filter((job) => !job.name.startsWith('Unit Tests (count guard)'))
          .concat({
            name: 'Unit Tests (functions + count guard)',
            conclusion: 'success',
          })
      )
    ).toBe(false);
  });

  it('takes docs mode only for docs-only changes that touch no backend target', async () => {
    const docs = ['docs/a.md', 'AGENT_BACKLOG.md'];
    expect(await decideMode(input({ changedFiles: docs, mergedPrs: [] }))).toBe(
      'docs'
    );
    expect(
      await decideMode(
        input({ changedFiles: docs, backend: true, mergedPrs: [] })
      )
    ).toBe('full');
    expect(
      await decideMode(
        input({
          changedFiles: [...docs, 'public/changelog.json'],
          mergedPrs: [],
        })
      )
    ).toBe('full');
    // No usable base (first run or a missing commit) is never docs mode.
    expect(await decideMode(input({ changedFiles: null, mergedPrs: [] }))).toBe(
      'full'
    );
    expect(await decideMode(input({ changedFiles: [], mergedPrs: [] }))).toBe(
      'full'
    );
  });

  it('runs everything on a full-backend dispatch', async () => {
    expect(await decideMode(input({ full: true }))).toBe('full');
  });
});

describe('firebase-dev-deploy.yml check modes', () => {
  const yaml = read('firebase-dev-deploy.yml');
  const job = (name: string) => {
    const start = yaml.indexOf(`\n  ${name}:\n`);
    const next = yaml.slice(start + 1).search(/\n {2}[a-z-]+:\n/);
    return yaml.slice(start, next === -1 ? undefined : start + 1 + next);
  };

  it('gates the backend deploy on every check its mode runs', () => {
    const deploy = job('deploy');
    expect(deploy).toContain("needs.build.result == 'success'");
    expect(deploy).toContain(
      "(needs.rules.result == 'success' || (needs.plan.outputs.mode == 'reuse' && needs.plan.outputs.release_rules != 'true'))"
    );
    expect(deploy).toContain(
      "(needs.plan.outputs.mode == 'reuse' || (needs.lint.result == 'success' && needs.type-check.result == 'success' && needs.test-counts.result == 'success'))"
    );
  });

  it('still tests the minified rules in reuse mode when rules changed', () => {
    expect(job('rules')).toContain(
      "if: needs.plan.outputs.mode == 'full' || (needs.plan.outputs.mode == 'reuse' && needs.plan.outputs.release_rules == 'true')"
    );
  });

  it('keeps format and unit tests in docs mode', () => {
    expect(job('lint')).toContain("if: needs.plan.outputs.mode != 'reuse'");
    expect(job('test')).toContain("if: needs.plan.outputs.mode != 'reuse'");
    expect(job('functions-test')).toContain(
      "if: needs.plan.outputs.mode != 'reuse'"
    );
  });

  it('lets a newer push deploy instead of an older run landing last', () => {
    for (const name of ['deploy', 'deploy-hosting']) {
      const body = job(name);
      const guard = body.indexOf(
        '- name: Stop if a newer push superseded this one'
      );
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(body.indexOf('- uses: actions/checkout@v6'));
      expect(body).toContain('gh run cancel "$GITHUB_RUN_ID"');
      expect(body).toContain('actions: write');
    }
  });

  it('treats an unexpected mode as full', () => {
    expect(yaml).toContain('[[ "$mode" =~ ^(full|reuse|docs)$ ]] || mode=full');
  });
});
