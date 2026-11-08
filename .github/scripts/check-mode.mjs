#!/usr/bin/env node
// Usage: check-mode.mjs <base-sha> <full:true|false> <backend:true|false>; prints full, reuse or docs (any doubt is full).

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Same test PR Validation uses for a docs-only PR.
export const isDoc = (/** @type {string} */ path) => path.endsWith('.md') || path.startsWith('docs/');

// PR Validation jobs that must all have run and passed before a push may skip its own checks.
export const REQUIRED_PR_JOBS = [
  'Code Quality (',
  'Unit Tests (shard ',
  'Unit Tests (functions)',
  'Unit Tests (count guard)',
  'Firestore Rules Tests (shard ',
  'Build',
];

/** @param {Job[]} jobs */
export function prChecksRan(jobs) {
  return REQUIRED_PR_JOBS.every((prefix) => {
    const matching = jobs.filter((job) => job.name.startsWith(prefix));
    return matching.length > 0 && matching.every((job) => job.conclusion === 'success');
  });
}

/**
 * @typedef {{ name: string, conclusion: string | null }} Job
 * @typedef {{ full: boolean, backend: boolean, changedFiles: string[] | null, headTree: string, mergedPrHeads: string[],
 *   treeOf: (sha: string) => Promise<string>, successfulRuns: (sha: string) => Promise<number[]>, jobsOf: (run: number) => Promise<Job[]> }} ModeInput
 */

// docs: only docs changed since the last good run. reuse: a merged PR's head had this exact tree and PR Validation ran every check on it.
/** @param {ModeInput} input @returns {Promise<'full' | 'reuse' | 'docs'>} */
export async function decideMode({ full, backend, changedFiles, headTree, mergedPrHeads, treeOf, successfulRuns, jobsOf }) {
  if (full) return 'full';
  if (changedFiles && changedFiles.length > 0 && changedFiles.every(isDoc) && !backend) return 'docs';
  for (const head of mergedPrHeads) {
    if ((await treeOf(head)) !== headTree) continue;
    for (const run of await successfulRuns(head)) {
      if (prChecksRan(await jobsOf(run))) return 'reuse';
    }
  }
  return 'full';
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    headers: {
      authorization: `Bearer ${process.env.GH_TOKEN}`,
      accept: 'application/vnd.github+json',
    },
  });
  if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
  return response.json();
}

async function main() {
  const [base = '', full = 'false', backend = 'false'] = process.argv.slice(2);
  const sha = process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD');
  let changedFiles = null;
  if (/^[0-9a-f]{40}$/.test(base) && !/^0+$/.test(base)) {
    try {
      changedFiles = git('diff', '--name-only', base, sha).split('\n').filter(Boolean);
    } catch {
      changedFiles = null;
    }
  }
  const mode = await decideMode({
    full: full === 'true',
    backend: backend === 'true',
    changedFiles,
    headTree: git('rev-parse', `${sha}^{tree}`),
    mergedPrHeads: (await api(`commits/${sha}/pulls`)).filter((pr) => pr.merged_at).map((pr) => pr.head.sha),
    treeOf: async (head) => (await api(`git/commits/${head}`)).tree.sha,
    successfulRuns: async (head) =>
      (await api(`actions/workflows/pr-validation.yml/runs?head_sha=${head}&status=success&per_page=5`)).workflow_runs.map((run) => run.id),
    jobsOf: async (run) => (await api(`actions/runs/${run}/jobs?per_page=100`)).jobs,
  });
  process.stdout.write(`${mode}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`::warning::Running every check: ${error.message}\n`);
    process.stdout.write('full\n');
  });
}
