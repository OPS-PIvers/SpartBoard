#!/usr/bin/env node
// Usage: affected-functions.mjs <repo-root> < changed-paths; prints ALL, nothing, or the affected exports (any doubt is ALL).
// AFFECTED_FUNCTIONS_OLD_INDEX names a copy of the deployed index.ts, so an index.ts that only adds or repoints exports names just those.
// AFFECTED_FUNCTIONS_OLD_FEATURE_MISSING_DOC does the same for featureMissingDoc.ts, so a new feature id names only the code that uses it.

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

// Feature ids are data here: a new id can only reach code that names it, unless the caller builds the id at runtime.
const FEATURE_MISSING_DOC = 'functions/src/featureMissingDoc.ts';
const RUNTIME_FEATURE_ID_CALLERS = [
  'functions/src/aiGeneration.ts',
  'functions/src/quizMediaArchive.ts',
];

// The quoted strings in each id list, and the file with those lists blanked out.
function featureIdLists(source) {
  const lists = [
    /(ADMIN_PREVIEW_FEATURES[^=]*=\s*\[)([^\]]*)(\])/,
    /(PUBLIC_MISSING_DOC_FEATURES[^=]*=\s*\{)([^}]*)(\})/,
  ];
  const entries = [];
  let rest = source;
  for (const list of lists) {
    const match = list.exec(rest);
    if (!match) throw new Ambiguous(`${FEATURE_MISSING_DOC} lost an id list`);
    const body = match[2].replace(/\/\/.*$/gm, '');
    const items = body
      .split(',')
      .map((item) => item.replace(/\s+/g, ''))
      .filter(Boolean);
    entries.push(new Set(items));
    rest = rest.replace(list, '$1$3');
  }
  return { entries, rest };
}

// Ids featureMissingDoc.ts only added since the deployed copy; any other edit is null.
function addedFeatureIds() {
  const oldFile = process.env.AFFECTED_FUNCTIONS_OLD_FEATURE_MISSING_DOC;
  if (!oldFile || !existsSync(oldFile)) return null;
  const before = featureIdLists(read(oldFile));
  const after = featureIdLists(read(join(repoRoot, FEATURE_MISSING_DOC)));
  if (before.rest !== after.rest) return null;
  const added = [];
  for (const [index, entries] of after.entries.entries()) {
    for (const entry of before.entries[index])
      if (!entries.has(entry)) return null;
    for (const entry of entries) {
      if (before.entries[index].has(entry)) continue;
      const id = /^(['"]?)([\w-]+)\1(:.*)?$/.exec(entry);
      if (!id) return null;
      added.push(id[2]);
    }
  }
  return added;
}

// Whether a closure can see one of the added ids: it names one, or builds ids at runtime.
function reachesFeatureIds(files, ids) {
  if (ids.length === 0) return false;
  for (const file of files) {
    const path = toRepo(file);
    if (path === FEATURE_MISSING_DOC) continue;
    if (RUNTIME_FEATURE_ID_CALLERS.includes(path)) return true;
    if (/\b(?:ADMIN_PREVIEW_FEATURES|PUBLIC_MISSING_DOC_FEATURES)\b/.test(read(file))) return true;
    const source = read(file);
    if (
      ids.some((id) =>
        ["'", '"', '`'].some((q) => source.includes(`${q}${id}${q}`))
      )
    )
      return true;
  }
  return false;
}

const read = (file) => readFileSync(file, 'utf-8');
const toRepo = (file) => relative(repoRoot, file).split('\\').join('/');

// `import type`, `export type` and lists of only `type` names are erased by tsc, so they never load the module.
function typeOnly(statement) {
  // A match that started in a comment runs on into the real statement, so keep it.
  if (/\/\/|\/\*|.\b(?:import|export)\b/s.test(statement)) return false;
  if (/^(?:import|export)\s+type\s+(?!from\b)/.test(statement)) return true;
  const clause = /^(?:import|export)\s*\{([^}]*)\}\s*from\b/.exec(statement);
  if (!clause) return false;
  const names = clause[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return (
    names.length > 0 && names.every((name) => /^type\s+(?!as\b)[A-Za-z_$]/.test(name))
  );
}

// Module specifiers in a file; `checked` forms are resolved by tsc, so an unresolvable one is a comment.
function specifiers(source) {
  const found = [];
  const patterns = [
    [/\b(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g, true],
    [/\bimport\s*['"]([^'"]+)['"]/g, true],
    [/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, true],
    [/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, false],
  ];
  for (const [pattern, checked] of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (!typeOnly(match[0])) found.push({ spec: match[1], checked });
    }
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
    else if (!checked)
      throw new Ambiguous(`unresolved require '${spec}' in ${toRepo(file)}`);
  }
  return deps;
}

function resolveRelative(fromFile, spec) {
  const target = tryResolve(fromFile, spec);
  if (!target)
    throw new Ambiguous(`unresolved import '${spec}' in ${toRepo(fromFile)}`);
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
function barrelExports(raw = read(indexFile)) {
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const statements = source
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const exports = new Map();
  for (const statement of statements) {
    const match = /^export\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]$/.exec(
      statement
    );
    if (!match)
      throw new Ambiguous(
        `index.ts has a statement other than a re-export: ${statement.slice(0, 80)}`
      );
    const module = resolveRelative(indexFile, match[2]);
    for (const part of match[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)) {
      const name = part
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name))
        throw new Ambiguous(`odd export '${part}'`);
      exports.set(name, { module, local: part.split(/\s+as\s+/)[0].trim() });
    }
  }
  if (exports.size === 0) throw new Ambiguous('no exports found in index.ts');
  return exports;
}

// Exports that index.ts added or repointed since the deployed copy; a removed one needs the full pass that deletes it.
function changedBarrelExports(exports) {
  const oldIndex = process.env.AFFECTED_FUNCTIONS_OLD_INDEX;
  if (!oldIndex || !existsSync(oldIndex))
    throw new Ambiguous('functions/src/index.ts');
  const before = barrelExports(read(oldIndex));
  for (const name of before.keys()) {
    if (!exports.has(name)) throw new Ambiguous(`index.ts removed ${name}`);
  }
  const key = (entry) => `${entry.module}#${entry.local}`;
  return [...exports]
    .filter(
      ([name, entry]) =>
        !before.has(name) || key(before.get(name)) !== key(entry)
    )
    .map(([name]) => name);
}

function affected(changed) {
  const relevant = changed.filter(
    (path) =>
      path.startsWith('functions/') &&
      !NO_RUNTIME_EFFECT.some((re) => re.test(path))
  );
  if (relevant.length === 0) return [];

  const changedSources = new Set();
  for (const path of relevant) {
    const file = join(repoRoot, path);
    // Files outside src, deleted files, the barrel and shared init can touch every function.
    if (!path.startsWith('functions/src/') || !existsSync(file))
      throw new Ambiguous(path);
    if (path === 'functions/src/index.ts') continue;
    if (path === 'functions/src/functionsInit.ts') throw new Ambiguous(path);
    if (/setGlobalOptions\s*\(/.test(read(file)))
      throw new Ambiguous(`${path} sets global options`);
    changedSources.add(file);
  }

  const exports = barrelExports();
  const names = relevant.includes('functions/src/index.ts')
    ? changedBarrelExports(exports)
    : [];
  const featureFile = join(repoRoot, FEATURE_MISSING_DOC);
  const addedIds = changedSources.has(featureFile) ? addedFeatureIds() : null;
  const unattributed = new Set(changedSources);
  for (const [name, { module }] of exports) {
    if (names.includes(name)) continue;
    if (!closures.has(module)) closures.set(module, closure(module));
    const files = closures.get(module);
    const hits = [...changedSources].filter((file) => files.has(file));
    hits.forEach((file) => unattributed.delete(file));
    const real = hits.filter(
      (file) =>
        file !== featureFile ||
        addedIds === null ||
        reachesFeatureIds(files, addedIds)
    );
    if (real.length > 0) names.push(name);
  }
  // A non-TS file no function imports may still be read at runtime (fs, __dirname).
  for (const file of unattributed) {
    if (!file.endsWith('.ts'))
      throw new Ambiguous(
        `${toRepo(file)} is not imported but may be read at runtime`
      );
  }
  if (names.length > exports.size * MAX_NAMED_SHARE)
    throw new Ambiguous(`${names.length} of ${exports.size} exports affected`);
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

const changed = read(0)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
try {
  process.stdout.write(`${affected(changed).join(',')}\n`);
} catch (error) {
  if (!(error instanceof Ambiguous)) throw error;
  process.stderr.write(`Deploying every function: ${error.message}\n`);
  process.stdout.write('ALL\n');
}
