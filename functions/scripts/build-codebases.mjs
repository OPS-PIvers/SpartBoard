#!/usr/bin/env node
// Writes one deploy source per codebase under functions/deploy/<name>/ from lib/ (docs/plans/FUNCTION_CODEBASES.md).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CODEBASE = 'default';
const INIT_MODULE = './functionsInit';
// Compiled files that read functions/data at runtime, and the data/ entries each needs.
export const DATA_READERS = { 'pronunciation/cmudict.js': ['cmudict'] };
// Local env and emulator secret files the CLI reads from the source folder.
const LOCAL_CONFIG = /^\.env(\..+)?$|^\.secret\.local$/;

const IGNORED_LINE = [
  /^"use strict";$/,
  /^Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);$/,
  /^(exports\.\w+ = )+void 0;$/,
  /^\/\/# sourceMappingURL=index\.js\.map$/,
  /^$/,
];
const REQUIRE_LINE = /^var (\w+) = require\("(\.\/[^"]+)"\);$/;
const EXPORT_LINE =
  /^Object\.defineProperty\(exports, "(\w+)", \{ enumerable: true, get: function \(\) \{ return (\w+)\.(\w+); \} \}\);$/;

// Reads the barrel tsc emits for functions/src/index.ts; any other shape fails the build.
export function parseLibIndex(source) {
  const modules = [];
  const byVar = new Map();
  const names = new Set();
  source.split(/\r?\n/).forEach((line, i) => {
    const req = REQUIRE_LINE.exec(line);
    const exp = EXPORT_LINE.exec(line);
    if (req) {
      if (byVar.has(req[1]))
        throw new Error(`lib/index.js:${i + 1}: ${req[1]} assigned twice`);
      const mod = { varName: req[1], path: req[2], exports: [] };
      byVar.set(req[1], mod);
      modules.push(mod);
    } else if (exp) {
      const mod = byVar.get(exp[2]);
      if (!mod)
        throw new Error(
          `lib/index.js:${i + 1}: ${exp[1]} reads unknown ${exp[2]}`
        );
      if (names.has(exp[1]))
        throw new Error(`lib/index.js:${i + 1}: ${exp[1]} exported twice`);
      names.add(exp[1]);
      mod.exports.push({ name: exp[1], prop: exp[3] });
    } else if (!IGNORED_LINE.some((re) => re.test(line))) {
      throw new Error(
        `lib/index.js:${i + 1}: unrecognised line; index.ts may only hold \`export { x } from './m'\` lines:\n${line}`
      );
    }
  });
  return { modules, names: [...names] };
}

export function validateManifest(manifest, exportNames) {
  const errors = [];
  const known = new Set(exportNames);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['codebases.json must be an object'];
  }
  const extraKeys = Object.keys(manifest).filter((k) => k !== 'codebases');
  if (extraKeys.length)
    errors.push(`unknown top-level keys: ${extraKeys.join(', ')}`);
  const { codebases } = manifest;
  if (!codebases || typeof codebases !== 'object' || Array.isArray(codebases)) {
    return [
      ...errors,
      '"codebases" must be an object of codebase name to function names',
    ];
  }
  const owner = new Map();
  for (const [codebase, list] of Object.entries(codebases)) {
    if (codebase === DEFAULT_CODEBASE)
      errors.push(
        '"default" must not be listed; it holds every unlisted function'
      );
    if (known.has(codebase))
      errors.push(`codebase "${codebase}" shares its name with a function`);
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(codebase))
      errors.push(`bad codebase name "${codebase}"`);
    if (!Array.isArray(list)) {
      errors.push(`"${codebase}" must be an array`);
      continue;
    }
    for (const name of list) {
      if (typeof name !== 'string')
        errors.push(`"${codebase}" holds a non-string entry`);
      else if (name.startsWith('__'))
        errors.push(`${name} is a test-only export and stays in default`);
      else if (!known.has(name))
        errors.push(
          `${name} (in "${codebase}") is not exported by functions/src/index.ts`
        );
      else if (owner.has(name))
        errors.push(
          `${name} is listed in both "${owner.get(name)}" and "${codebase}"`
        );
      else owner.set(name, codebase);
    }
  }
  return errors;
}

// Every relative require reachable from the entries, as lib-relative posix paths.
export function importClosure(libDir, entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(join(libDir, file), 'utf8');
    if (/\brequire\(\s*[^'"\s)]/.test(text)) {
      throw new Error(
        `lib/${file}: require() with a computed path; the closure can't follow it`
      );
    }
    if (/__dirname|__filename/.test(text) && !DATA_READERS[file]) {
      throw new Error(
        `lib/${file} reads a path next to itself; add it to DATA_READERS in build-codebases.mjs`
      );
    }
    for (const m of text.matchAll(
      /\brequire\(\s*(['"])(\.\.?\/[^'"]*)\1\s*\)/g
    )) {
      stack.push(
        resolveLib(libDir, posix.join(posix.dirname(file), m[2]), file)
      );
    }
  }
  return [...seen].sort();
}

function resolveLib(libDir, spec, from) {
  for (const candidate of [spec, `${spec}.js`, `${spec}/index.js`]) {
    const abs = join(libDir, candidate);
    if (existsSync(abs) && statSync(abs).isFile())
      return posix.normalize(candidate);
  }
  throw new Error(`lib/${from}: cannot resolve require("${spec}")`);
}

function indexSource(codebase, modules) {
  const lines = [
    '"use strict";',
    `// Generated by functions/scripts/build-codebases.mjs for codebase "${codebase}"; do not edit.`,
    'Object.defineProperty(exports, "__esModule", { value: true });',
    `require("./lib/${INIT_MODULE.slice(2)}");`,
  ];
  for (const mod of modules) {
    lines.push(`var ${mod.varName} = require("./lib/${mod.path.slice(2)}");`);
    for (const { name, prop } of mod.exports) {
      lines.push(
        `Object.defineProperty(exports, "${name}", { enumerable: true, get: function () { return ${mod.varName}.${prop}; } });`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function listTree(root, prefix = '') {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .sort()
    .flatMap((entry) => {
      const abs = join(root, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      return statSync(abs).isDirectory() ? listTree(abs, rel) : [rel];
    });
}

// Rewrites only changed files and removes the rest, so a running emulator's watcher keeps its folder.
function syncDir(dir, want) {
  for (const rel of listTree(dir)) if (!want.has(rel)) rmSync(join(dir, rel));
  for (const [rel, content] of want) {
    const abs = join(dir, rel);
    if (existsSync(abs) && readFileSync(abs).equals(content)) continue;
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  pruneEmptyDirs(dir);
}

function pruneEmptyDirs(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      pruneEmptyDirs(abs);
      if (!readdirSync(abs).length) rmSync(abs, { recursive: true });
    }
  }
}

export function buildCodebases({
  functionsDir,
  libDir = join(functionsDir, 'lib'),
  outDir = join(functionsDir, 'deploy'),
}) {
  const manifest = JSON.parse(
    readFileSync(join(functionsDir, 'codebases.json'), 'utf8')
  );
  const { modules, names } = parseLibIndex(
    readFileSync(join(libDir, 'index.js'), 'utf8')
  );
  const errors = validateManifest(manifest, names);
  if (errors.length)
    throw new Error(`functions/codebases.json:\n- ${errors.join('\n- ')}`);

  const pkgText = readFileSync(join(functionsDir, 'package.json'), 'utf8');
  const mainField = /"main": "lib\/index\.js"/g;
  if ((pkgText.match(mainField) ?? []).length !== 1) {
    throw new Error(
      'functions/package.json must hold exactly one "main": "lib/index.js"'
    );
  }
  const deployPkg = pkgText.replace(mainField, '"main": "index.js"');
  const localConfig = readdirSync(functionsDir)
    .filter((f) => LOCAL_CONFIG.test(f))
    .sort();

  const owner = new Map();
  for (const [codebase, list] of Object.entries(manifest.codebases))
    for (const n of list) owner.set(n, codebase);
  const codebases = [
    DEFAULT_CODEBASE,
    ...Object.keys(manifest.codebases).sort(),
  ];

  mkdirSync(outDir, { recursive: true });
  for (const stale of readdirSync(outDir)) {
    if (!codebases.includes(stale))
      rmSync(join(outDir, stale), { recursive: true, force: true });
  }
  const result = {};
  for (const codebase of codebases) {
    const own = modules
      .map((mod) => ({
        ...mod,
        exports: mod.exports.filter(
          (e) => (owner.get(e.name) ?? DEFAULT_CODEBASE) === codebase
        ),
      }))
      .filter((mod) => mod.exports.length);
    const entries = [
      `${INIT_MODULE.slice(2)}.js`,
      ...own.map((mod) => resolveLib(libDir, mod.path, 'index.js')),
    ];
    const files = importClosure(libDir, entries);
    const want = new Map();
    for (const file of files)
      want.set(`lib/${file}`, readFileSync(join(libDir, file)));
    const data = [
      ...new Set(files.flatMap((f) => DATA_READERS[f] ?? [])),
    ].sort();
    for (const entry of data) {
      for (const rel of listTree(join(functionsDir, 'data', entry)))
        want.set(
          `data/${entry}/${rel}`,
          readFileSync(join(functionsDir, 'data', entry, rel))
        );
    }
    want.set('index.js', Buffer.from(indexSource(codebase, own)));
    want.set('package.json', Buffer.from(deployPkg));
    want.set(
      'pnpm-lock.yaml',
      readFileSync(join(functionsDir, 'pnpm-lock.yaml'))
    );
    for (const f of localConfig)
      want.set(f, readFileSync(join(functionsDir, f)));
    syncDir(join(outDir, codebase), want);
    result[codebase] = {
      exports: own.flatMap((mod) => mod.exports.map((e) => e.name)),
      files,
      data,
    };
  }

  const emitted = Object.values(result).flatMap((r) => r.exports);
  if (
    emitted.length !== names.length ||
    new Set(emitted).size !== names.length
  ) {
    throw new Error(
      'generated codebases do not export every lib/index.js name exactly once'
    );
  }
  return result;
}

// Usage: build-codebases.mjs [functions-dir]
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const functionsDir = resolve(
    process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
  );
  try {
    const result = buildCodebases({ functionsDir });
    const out =
      relative(process.cwd(), join(functionsDir, 'deploy'))
        .split(sep)
        .join('/') || '.';
    for (const [codebase, r] of Object.entries(result)) {
      console.log(
        `${out}/${codebase}: ${r.exports.length} exports, ${r.files.length} modules`
      );
    }
  } catch (err) {
    console.error(
      `build-codebases: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
}
