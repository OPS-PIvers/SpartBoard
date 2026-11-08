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
 * @typedef {{ number: number, head: string, headRef?: string, baseRef?: string }} MergedPr
 * @typedef {{ head_branch: string | null, pull_requests: { number: number, base: { ref: string } }[] }} PrRun
 * @typedef {{ full: boolean, backend: boolean, changedFiles: string[] | null, headTree: string, mergedPrs: MergedPr[],
 *   treeOf: (sha: string) => Promise<string>, baseIsInHead: (head: string) => Promise<boolean>,
 *   successfulRuns: (pr: MergedPr) => Promise<number[]>, jobsOf: (run: number) => Promise<Job[]> }} ModeInput
 */

// docs: only docs changed since the last good run. reuse: the merged PR's head held this exact tree and the branch's
// prior commit, so PR Validation's merge ref was this tree, and that PR's own run passed every check on it.
// GitHub lists only the branch's open PRs on a run, so a merged PR's run shows a newer PR or none.
/** @param {PrRun} run @param {MergedPr} pr */
export function runIsFromPr(run, pr) {
  if (run.pull_requests.some((p) => p.number === pr.number)) return true;
  return run.head_branch === pr.headRef && run.pull_requests.every((p) => p.base.ref === pr.baseRef);
}

/** @param {ModeInput} input @returns {Promise<'full' | 'reuse' | 'docs'>} */
export async function decideMode({ full, backend, changedFiles, headTree, mergedPrs, treeOf, baseIsInHead, successfulRuns, jobsOf }) {
  if (full) return 'full';
  if (changedFiles && changedFiles.length > 0 && changedFiles.every(isDoc) && !backend) return 'docs';
  for (const pr of mergedPrs) {
    if ((await treeOf(pr.head)) !== headTree) continue;
    if (!(await baseIsInHead(pr.head))) continue;
    for (const run of await successfulRuns(pr)) {
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
    mergedPrs: (await api(`commits/${sha}/pulls`))
      .filter((pr) => pr.merged_at)
      .filter((pr) => pr.head.repo?.full_name === process.env.GITHUB_REPOSITORY)
      .map((pr) => ({ number: pr.number, head: pr.head.sha, headRef: pr.head.ref, baseRef: pr.base.ref })),
    treeOf: async (head) => (await api(`git/commits/${head}`)).tree.sha,
    // The pushed commit's first parent is the branch before the merge; it must already be in the PR head.
    baseIsInHead: async (head) =>
      ['ahead', 'identical'].includes((await api(`compare/${git('rev-parse', `${sha}^1`)}...${head}`)).status),
    successfulRuns: async (pr) =>
      (await api(`actions/workflows/pr-validation.yml/runs?head_sha=${pr.head}&event=pull_request&status=success&per_page=10`)).workflow_runs
        .filter((/** @type {PrRun} */ run) => runIsFromPr(run, pr))
        .map((run) => run.id),
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
