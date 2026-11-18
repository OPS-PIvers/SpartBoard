// Guards functions/codebases.json, firebase.json and build-codebases.mjs (docs/plans/FUNCTION_CODEBASES.md).
import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = resolve(repoRoot, 'functions/scripts/build-codebases.mjs');
const requireCjs = createRequire(import.meta.url);

type Manifest = { codebases: Record<string, string[]> };
type FunctionsEntry = {
  source: string;
  codebase: string;
  runtime: string;
  ignore: string[];
};

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8')) as T;

function srcIndexExports(): string[] {
  const path = resolve(repoRoot, 'functions/src/index.ts');
  const file = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest
  );
  const names: string[] = [];
  file.forEachChild((node) => {
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const el of node.exportClause.elements) names.push(el.name.text);
    }
  });
  return names;
}

describe('functions/codebases.json', () => {
  const manifest = readJson<Manifest>('functions/codebases.json');
  const exported = new Set(srcIndexExports());

  it('holds only the codebases key', () => {
    expect(Object.keys(manifest)).toEqual(['codebases']);
  });

  it('lists only real, non-test exports of functions/src/index.ts, each once', () => {
    const seen = new Set<string>();
    for (const [codebase, names] of Object.entries(manifest.codebases)) {
      expect(codebase).not.toBe('default');
      expect(codebase).toMatch(/^[a-z][a-z0-9-]{0,62}$/);
      for (const name of names) {
        expect(exported.has(name), `${name} is not exported`).toBe(true);
        expect(name.startsWith('__'), `${name} is test-only`).toBe(false);
        expect(seen.has(name), `${name} is listed twice`).toBe(false);
        seen.add(name);
      }
    }
  });

  it('matches the firebase.json functions entries', () => {
    const entries = readJson<{ functions: FunctionsEntry[] }>(
      'firebase.json'
    ).functions;
    const expected = ['default', ...Object.keys(manifest.codebases).sort()];
    expect(entries.map((e) => e.codebase)).toEqual(expected);
    for (const entry of entries) {
      expect(entry.source).toBe(`functions/deploy/${entry.codebase}`);
      expect(entry.runtime).toBe('nodejs24');
      expect(entry.ignore).toEqual(entries[0].ignore);
    }
  });
});

const PACKAGE_JSON = `{
  "name": "functions",
  "main": "lib/index.js",
  "dependencies": { "firebase-functions": "^7.4.0" },
  "pnpm": {
    "overrides": { "qs": "^6.16.1" },
    "onlyBuiltDependencies": [
      "ffmpeg-static"
    ]
  }
}
`;

const exportLine = (name: string, varName: string, prop = name) =>
  `Object.defineProperty(exports, "${name}", { enumerable: true, get: function () { return ${varName}.${prop}; } });`;

// Mirrors the barrel tsc emits for functions/src/index.ts.
const LIB_INDEX = [
  '"use strict";',
  'Object.defineProperty(exports, "__esModule", { value: true });',
  'exports.__testOnly = exports.fnSpeak = exports.fnB = exports.fnA = void 0;',
  'var a_1 = require("./a");',
  exportLine('fnA', 'a_1'),
  exportLine('__testOnly', 'a_1'),
  'var b_1 = require("./b");',
  exportLine('fnB', 'b_1'),
  'var lookup_1 = require("./pronunciation/lookup");',
  exportLine('fnSpeak', 'lookup_1', 'lookupV1'),
  '//# sourceMappingURL=index.js.map',
  '',
].join('\n');

const LIB_FILES: Record<string, string> = {
  'index.js': LIB_INDEX,
  'functionsInit.js':
    '"use strict";\nrequire("./firebaseAdmin");\n(globalThis.__order ??= []).push("init");\n',
  'firebaseAdmin.js': '"use strict";\nexports.apps = [];\n',
  'shared.js': '"use strict";\nexports.shared = 1;\n',
  'a.js':
    '"use strict";\nrequire("./shared");\n(globalThis.__order ??= []).push("a");\nexports.fnA = () => "a";\nexports.__testOnly = 1;\n',
  'b.js':
    '"use strict";\nexports.fnB = async () => (await Promise.resolve().then(() => require(\'./lazy/c\'))).c;\n',
  'lazy/c.js': '"use strict";\nexports.c = require("../shared").shared;\n',
  'pronunciation/lookup.js':
    '"use strict";\nexports.lookupV1 = () => require("./cmudict").dict();\n',
  'pronunciation/cmudict.js':
    '"use strict";\nconst path = require("path");\nconst fs = require("fs");\nexports.dict = () => fs.readFileSync(path.join(__dirname, "..", "..", "data", "cmudict", "words.txt"), "utf8");\n',
  'stale.js': '"use strict";\nexports.gone = 1;\n',
};

let tmp: string | undefined;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function fixture(
  manifest: unknown,
  libOverrides: Record<string, string> = {}
): string {
  tmp = mkdtempSync(join(tmpdir(), 'codebases-'));
  const files: Record<string, string> = {
    'package.json': PACKAGE_JSON,
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'codebases.json': JSON.stringify(manifest),
    'data/cmudict/words.txt': 'HELLO HH AH0 L OW1\n',
    'data/other/big.bin': 'unused',
    ...Object.fromEntries(
      Object.entries({ ...LIB_FILES, ...libOverrides }).map(([k, v]) => [
        `lib/${k}`,
        v,
      ])
    ),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(tmp, path)), { recursive: true });
    writeFileSync(join(tmp, path), text);
  }
  return tmp;
}

function build(dir: string) {
  return spawnSync(process.execPath, [buildScript, dir], { encoding: 'utf8' });
}

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const entry of readdirSync(d).sort()) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else
        out[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

function load(path: string): Record<string, unknown> {
  delete (globalThis as { __order?: string[] }).__order;
  return requireCjs(path) as Record<string, unknown>;
}

describe('build-codebases.mjs', () => {
  const manifest = { codebases: { admin: ['fnB'], plc: [] } };

  it('splits the exports across codebases with nothing dropped or doubled', () => {
    const dir = fixture(manifest);
    const run = build(dir);
    expect(run.status, run.stderr).toBe(0);
    expect(readdirSync(join(dir, 'deploy')).sort()).toEqual([
      'admin',
      'default',
      'plc',
    ]);
    const all = Object.keys(load(join(dir, 'lib/index.js'))).sort();
    const parts = ['default', 'admin', 'plc'].map((c) =>
      Object.keys(load(join(dir, 'deploy', c, 'index.js')))
    );
    expect(parts[1]).toEqual(['fnB']);
    expect(parts[2]).toEqual([]);
    expect(parts.flat().sort()).toEqual(all);
  });

  it('loads functionsInit before any function module', () => {
    const dir = fixture(manifest);
    expect(build(dir).status).toBe(0);
    load(join(dir, 'deploy/default/index.js'));
    expect((globalThis as { __order?: string[] }).__order).toEqual([
      'init',
      'a',
    ]);
  });

  it('copies only each codebase import closure, plus data a module reads', async () => {
    const dir = fixture(manifest);
    expect(build(dir).status).toBe(0);
    const files = (c: string) => Object.keys(tree(join(dir, 'deploy', c)));
    expect(files('admin')).toEqual([
      'index.js',
      'lib/b.js',
      'lib/firebaseAdmin.js',
      'lib/functionsInit.js',
      'lib/lazy/c.js',
      'lib/shared.js',
      'package.json',
      'pnpm-lock.yaml',
    ]);
    expect(files('default')).toEqual([
      'data/cmudict/words.txt',
      'index.js',
      'lib/a.js',
      'lib/firebaseAdmin.js',
      'lib/functionsInit.js',
      'lib/pronunciation/cmudict.js',
      'lib/pronunciation/lookup.js',
      'lib/shared.js',
      'package.json',
      'pnpm-lock.yaml',
    ]);
    const fnB = load(join(dir, 'deploy/admin/index.js'))
      .fnB as () => Promise<number>;
    expect(await fnB()).toBe(1);
    const fnSpeak = load(join(dir, 'deploy/default/index.js'))
      .fnSpeak as () => string;
    expect(fnSpeak()).toContain('HELLO');
  });

  it('copies package.json byte for byte except main', () => {
    const dir = fixture(manifest);
    expect(build(dir).status).toBe(0);
    expect(readFileSync(join(dir, 'deploy/plc/package.json'), 'utf8')).toBe(
      PACKAGE_JSON.replace('"main": "lib/index.js"', '"main": "index.js"')
    );
  });

  it('gives byte-identical folders when run twice, and drops stale codebases', () => {
    const dir = fixture(manifest);
    expect(build(dir).status).toBe(0);
    const first = tree(join(dir, 'deploy'));
    mkdirSync(join(dir, 'deploy/removed'));
    writeFileSync(join(dir, 'deploy/removed/index.js'), '');
    writeFileSync(join(dir, 'deploy/default/lib/stale.js'), '');
    mkdirSync(join(dir, 'deploy/admin/lib/old'));
    writeFileSync(join(dir, 'deploy/admin/lib/old/x.js'), '');
    expect(build(dir).status).toBe(0);
    expect(tree(join(dir, 'deploy'))).toEqual(first);
  });

  it.each([
    [{ codebases: { default: [] } }, 'must not be listed'],
    [{ codebases: { admin: ['fnA'], plc: ['fnA'] } }, 'listed in both'],
    [{ codebases: { admin: ['nope'] } }, 'not exported'],
    [{ codebases: { admin: ['__testOnly'] } }, 'test-only'],
    [{ codebases: { Admin: [] } }, 'bad codebase name'],
    [{ codebases: { fnA: [] } }, 'shares its name with a function'],
    [{ codebases: {}, extra: 1 }, 'unknown top-level keys'],
  ])('rejects manifest %j', (bad, message) => {
    const run = build(fixture(bad));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(message);
  });

  it.each([
    [
      {
        'b.js':
          '"use strict";\nconst m = "./lazy/c";\nexports.fnB = () => require(m);\n',
      },
      'computed path',
    ],
    [
      { 'b.js': '"use strict";\nexports.fnB = () => __dirname;\n' },
      'DATA_READERS',
    ],
    [
      {
        'index.js': LIB_INDEX.replace(
          'var b_1',
          '__exportStar(require("./x"), exports);\nvar b_1'
        ),
      },
      'unrecognised line',
    ],
    [{ 'b.js': '"use strict";\nrequire("./missing");\n' }, 'cannot resolve'],
  ])('fails on lib it cannot follow (%#)', (lib, message) => {
    const run = build(fixture(manifest, lib));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(message);
  });
});
