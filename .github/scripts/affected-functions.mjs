#!/usr/bin/env node
// Which Cloud Functions a set of changed files can affect, so a dev deploy can name
// them in `--only` instead of rebuilding every function.
//
// Usage: affected-functions.mjs <repo-root>  (changed repo-relative paths on stdin)
// Prints ALL (deploy every function), nothing (no function affected), or the
// affected export names, comma-separated. Any doubt prints ALL: an extra function
// deployed is harmless, a skipped one would keep running stale code.
// Plain Node with no dependencies: the plan job runs it before any install.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const repoRoot = resolve(process.argv[2] ?? '.');
const srcRoot = join(repoRoot, 'functions', 'src');
const indexFile = join(srcRoot, 'index.ts');

// Above this share of all exports, a plain full deploy is about as fast and also runs deletes.
const MAX_NAMED_SHARE = 0.75;

// Changes under functions/ that never reach the deployed code.
const NO_RUNTIME_EFFECT = [
  /\.(test|spec)\.ts$/,
  /\.md$/,
  /\.cases\.json$/,
  /\/testdata\//,
  /^functions\/eslint\.config\.mjs$/,
  /^functions\/vitest\.config\.ts$/,
];

class Ambiguous extends Error {}

const read = (file) => readFileSync(file, 'utf-8');
const toRepo = (file) => relative(repoRoot, file).split('\\').join('/');

// Every module specifier in a file: static imports/exports, side-effect imports,
// import() and require(). Comments can add false hits, which only over-deploy.
// `checked` marks forms tsc resolves, so an unresolvable one can only be a comment.
function specifiers(source) {
  const found = [];
  const patterns = [
    [/\b(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g, true],
    [/\bimport\s*['"]([^'"]+)['"]/g, true],
    [/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, true],
    [/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, false],
  ];
  for (const [pattern, checked] of patterns) {
    for (const match of source.matchAll(pattern)) found.push({ spec: match[1], checked });
  }
  // A computed import() or require() could load anything (Prettier writes calls without a space).
  if (/\b(?:import|require)\(\s*[^'"\s)]/.test(source)) {
    throw new Ambiguous('computed import');
  }
  return found;
}

// Resolved relative imports of a .ts file.
function dependencies(file) {
  const deps = [];
  for (const { spec, checked } of specifiers(read(file))) {
    if (!spec.startsWith('.')) continue;
    const target = tryResolve(file, spec);
    if (target) deps.push(target);
    else if (!checked) throw new Ambiguous(`unresolved require '${spec}' in ${toRepo(file)}`);
  }
  return deps;
}

function resolveRelative(fromFile, spec) {
  const target = tryResolve(fromFile, spec);
  if (!target) throw new Ambiguous(`unresolved import '${spec}' in ${toRepo(fromFile)}`);
  return target;
}

function tryResolve(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.json`,
    join(base, 'index.ts'),
    base.replace(/\.js$/, '.ts'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const closures = new Map();
function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.ts')) stack.push(...dependencies(file));
  }
  return seen;
}

// export name -> defining module, from the barrel's `export { a, b as c } from './m'` lines.
function barrelExports() {
  const source = read(indexFile).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const statements = source.split(';').map((s) => s.trim()).filter(Boolean);
  const exports = new Map();
  for (const statement of statements) {
    const match = /^export\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]$/.exec(statement);
    if (!match) throw new Ambiguous(`index.ts has a statement other than a re-export: ${statement.slice(0, 80)}`);
    const module = resolveRelative(indexFile, match[2]);
    for (const part of match[1].split(',').map((p) => p.trim()).filter(Boolean)) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Ambiguous(`odd export '${part}'`);
      exports.set(name, module);
    }
  }
  if (exports.size === 0) throw new Ambiguous('no exports found in index.ts');
  return exports;
}

function affected(changed) {
  const relevant = changed.filter(
    (path) => path.startsWith('functions/') && !NO_RUNTIME_EFFECT.some((re) => re.test(path))
  );
  if (relevant.length === 0) return [];

  const changedSources = new Set();
  for (const path of relevant) {
    const file = join(repoRoot, path);
    // Outside src (package.json, lockfile, tsconfig, data/, scripts/), a deleted or
    // renamed file, the barrel itself (functions added or removed) or shared init
    // can touch every function.
    if (!path.startsWith('functions/src/') || !existsSync(file)) throw new Ambiguous(path);
    if (path === 'functions/src/index.ts' || path === 'functions/src/functionsInit.ts') throw new Ambiguous(path);
    if (/setGlobalOptions\s*\(/.test(read(file))) throw new Ambiguous(`${path} sets global options`);
    changedSources.add(file);
  }

  const names = [];
  const unattributed = new Set(changedSources);
  const exports = barrelExports();
  for (const [name, module] of exports) {
    if (!closures.has(module)) closures.set(module, closure(module));
    const files = closures.get(module);
    const hits = [...changedSources].filter((file) => files.has(file));
    if (hits.length > 0) names.push(name);
    hits.forEach((file) => unattributed.delete(file));
  }
  // A non-TS file no function imports may still be read at runtime (fs, __dirname).
  for (const file of unattributed) {
    if (!file.endsWith('.ts')) throw new Ambiguous(`${toRepo(file)} is not imported but may be read at runtime`);
  }
  if (names.length > exports.size * MAX_NAMED_SHARE) throw new Ambiguous(`${names.length} of ${exports.size} exports affected`);
  return names.sort();
}

// --edges <file>...: each file's resolved relative imports, for the parity test against TypeScript.
if (process.argv[3] === '--edges') {
  const edges = {};
  for (const path of process.argv.slice(4)) {
    const file = join(repoRoot, path);
    edges[path] = dependencies(file).map(toRepo);
  }
  process.stdout.write(JSON.stringify(edges));
  process.exit(0);
}

const changed = read(0).split('\n').map((line) => line.trim()).filter(Boolean);
try {
  process.stdout.write(`${affected(changed).join(',')}\n`);
} catch (error) {
  if (!(error instanceof Ambiguous)) throw error;
  process.stderr.write(`Deploying every function: ${error.message}\n`);
  process.stdout.write('ALL\n');
}
