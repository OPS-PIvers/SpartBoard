#!/usr/bin/env node
// Usage: needs-job.mjs rules < changed-paths; prints true when the job must run (any doubt is true).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isDoc = (/** @type {string} */ path) => path.endsWith('.md') || path.startsWith('docs/');

// Changes to any of these can change every job's result.
const SHARED = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
  /^tsconfig[^/]*\.json$/,
  /^\.github\/(workflows|actions)\//,
  /^\.github\/scripts\/needs-job\.mjs$/,
];

// Inputs the rules suite reads besides the files its tests import.
const RULES_INPUTS = [
  /^tests\/rules\//,
  /^firestore\.rules$/,
  /^storage\.rules$/,
  /^firestore\.indexes\.json$/,
  /^firebase\.json$/,
  /^\.firebaserc$/,
  /^vitest\.rules\.config\.ts$/,
  /^scripts\/[^/]*[Rr]ules/,
  /^scripts\/checkTestCounts\.mjs$/,
  /^scripts\/test-count-baseline\.json$/,
];


class Ambiguous extends Error {}

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js'];

function resolveSpec(repoRoot, from, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(repoRoot, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of EXTENSIONS) {
    const file = base + ext;
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  // An import written with .js that points at a .ts source.
  const stripped = base.replace(/\.(m?js|jsx)$/, '');
  for (const ext of ['.ts', '.tsx', '.mts']) {
    if (existsSync(stripped + ext)) return stripped + ext;
  }
  throw new Ambiguous(`can't resolve ${spec} from ${relative(repoRoot, from)}`);
}

function specifiers(source) {
  const found = [];
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

function walkFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

/** Repo paths of every app file the rules tests import, directly or through other files. */
export function rulesImports(repoRoot) {
  const seen = new Set();
  const queue = walkFiles(join(repoRoot, 'tests/rules')).filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(ts|tsx|mts|js|mjs|jsx)$/.test(file)) continue;
    for (const spec of specifiers(readFileSync(file, 'utf-8'))) {
      const target = resolveSpec(repoRoot, file, spec);
      if (target) queue.push(target);
    }
  }
  return new Set([...seen].map((f) => relative(repoRoot, f).split('\\').join('/')));
}

/** @param {'rules'} job @param {string[]} changed @param {string} repoRoot */
export function needsJob(job, changed, repoRoot) {
  const code = changed.filter((path) => !isDoc(path));
  if (code.length === 0) return false;
  if (code.some((path) => SHARED.some((re) => re.test(path)))) return true;
  if (job === 'rules') {
    if (code.some((path) => RULES_INPUTS.some((re) => re.test(path)))) return true;
    const imports = rulesImports(repoRoot);
    return code.some((path) => imports.has(path));
  }
  throw new Error(`unknown job ${job}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const job = /** @type {'rules'} */ (process.argv[2]);
  const changed = readFileSync(0, 'utf-8').split('\n').map((s) => s.trim()).filter(Boolean);
  let result = true;
  try {
    result = needsJob(job, changed, resolve('.'));
  } catch (error) {
    process.stderr.write(`::warning::Running ${job}: ${error instanceof Error ? error.message : error}\n`);
  }
  process.stdout.write(`${result}\n`);
}
