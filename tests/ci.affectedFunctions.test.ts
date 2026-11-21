// Guards affected-functions.mjs and function-targets.mjs: a dev deploy may skip a
// function only when none of its code changed, and must never name a non-function.
import { describe, it, expect } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync } from 'child_process';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const affectedScript = resolve(
  repoRoot,
  '.github/scripts/affected-functions.mjs'
);
const targetsScript = resolve(repoRoot, '.github/scripts/function-targets.mjs');

function affected(
  changed: string[],
  root = repoRoot,
  oldIndex?: string,
  oldFeatureMissingDoc?: string
): string[] | 'ALL' {
  const env = { ...process.env };
  delete env.AFFECTED_FUNCTIONS_OLD_INDEX;
  delete env.AFFECTED_FUNCTIONS_OLD_FEATURE_MISSING_DOC;
  const deployedCopy = (name: string, content: string) => {
    const file = join(mkdtempSync(join(tmpdir(), 'deployed-')), name);
    writeFileSync(file, content);
    return file;
  };
  if (oldIndex !== undefined) {
    env.AFFECTED_FUNCTIONS_OLD_INDEX = deployedCopy('index.ts', oldIndex);
  }
  if (oldFeatureMissingDoc !== undefined) {
    env.AFFECTED_FUNCTIONS_OLD_FEATURE_MISSING_DOC = deployedCopy(
      'featureMissingDoc.ts',
      oldFeatureMissingDoc
    );
  }
  const result = spawnSync('node', [affectedScript, root], {
    input: changed.join('\n'),
    encoding: 'utf-8',
    env,
  });
  expect(result.status).toBe(0);
  const out = result.stdout.trim();
  if (out === 'ALL') return 'ALL';
  return out === '' ? [] : out.split(',');
}

// A throwaway repo with functions/src laid out as `files` describes.
function withFixture(
  files: Record<string, string>,
  run: (root: string) => void
): void {
  const root = mkdtempSync(join(tmpdir(), 'affected-fns-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('affected-functions.mjs on the real functions codebase', () => {
  it('finds every relative import left in the compiled JavaScript', () => {
    const files = execFileSync(
      'git',
      ['ls-files', 'functions/src/*.ts', 'functions/src/**/*.ts'],
      { cwd: repoRoot, encoding: 'utf-8' }
    )
      .trim()
      .split('\n')
      .filter((f) => !/\.(test|spec)\.ts$|\.d\.ts$/.test(f));
    const edges = JSON.parse(
      execFileSync('node', [affectedScript, repoRoot, '--edges', ...files], {
        encoding: 'utf-8',
        maxBuffer: 1e8,
      })
    ) as Record<string, string[]>;
    const missing: string[] = [];
    for (const file of files) {
      const abs = join(repoRoot, file);
      // Compiled output, so type-only imports tsc erases are the only edges allowed to be skipped.
      const js = ts.transpileModule(readFileSync(abs, 'utf-8'), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: abs,
      }).outputText;
      const info = ts.preProcessFile(js, true, true);
      for (const imp of info.importedFiles) {
        if (!imp.fileName.startsWith('.')) continue;
        const resolved = ts.resolveModuleName(
          imp.fileName,
          abs,
          {
            moduleResolution: ts.ModuleResolutionKind.Node10,
            resolveJsonModule: true,
          },
          ts.sys
        ).resolvedModule;
        if (!resolved) continue;
        const target = relative(repoRoot, resolved.resolvedFileName)
          .split(sep)
          .join('/');
        if (!edges[file].includes(target)) missing.push(`${file} -> ${target}`);
      }
    }
    expect(missing).toEqual([]);
  }, 60_000);

  it('names only the functions whose module changed', () => {
    expect(affected(['functions/src/linkPreview.ts'])).toEqual([
      'fetchLinkPreview',
    ]);
  });

  it('ignores tests, docs and fixtures', () => {
    expect(
      affected([
        'functions/src/linkPreview.test.ts',
        'functions/README.md',
        'functions/src/flashcardMatch.cases.json',
        'functions/vitest.config.ts',
      ])
    ).toEqual([]);
  });

  it('deploys every function when the change could reach them all', () => {
    for (const path of [
      'functions/src/index.ts',
      'functions/src/functionsInit.ts',
      'functions/package.json',
      'functions/pnpm-lock.yaml',
      'functions/tsconfig.json',
      'functions/data/cmudict',
      'functions/src/deletedModule.ts',
    ]) {
      expect(affected([path]), path).toBe('ALL');
    }
  });

  it('skips a module no function imports', () => {
    expect(affected(['functions/src/testing/stubFirestore.ts'])).toEqual([]);
  });

  it('keeps student sign-in off the AI model and assigning hubs', () => {
    for (const path of [
      'functions/src/shared.ts',
      'functions/src/studentAssignmentTargets.ts',
    ]) {
      const names = affected([path]);
      expect(names, path).not.toBe('ALL');
      expect(names, path).not.toContain('studentLoginV1');
      expect(names, path).not.toContain('pinLoginV1');
    }
  });
});

describe('affected-functions.mjs edge cases', () => {
  const base = {
    'functions/src/index.ts': [
      '// export { x } from "./m" in a comment',
      "export { alpha } from './alpha';",
      "export { beta as betaV1, gamma } from './beta';",
      "export { d1 } from './d1';",
      "export { d2 } from './d2';",
      "export { d3 } from './d3';",
      "export { d4 } from './d4';",
      "export { d5 } from './d5';",
      "export { d6 } from './d6';",
    ].join('\n'),
    'functions/src/alpha.ts':
      "import { shared } from './shared';\nimport data from './data.json';\nexport const alpha = 1;",
    'functions/src/beta.ts':
      "// see import x from './nowhere'\nexport const beta = 1;\nexport const gamma = 2;",
    'functions/src/shared.ts': 'export const shared = 1;',
    'functions/src/data.json': '{}',
    'functions/src/loose.json': '{}',
    'functions/src/d1.ts': 'export const d1 = 1;',
    'functions/src/d2.ts': 'export const d2 = 1;',
    'functions/src/d3.ts': 'export const d3 = 1;',
    'functions/src/d4.ts': 'export const d4 = 1;',
    'functions/src/d5.ts': 'export const d5 = 1;',
    'functions/src/d6.ts': 'export const d6 = 1;',
  };

  it('follows imports, JSON included, and uses the exported alias', () => {
    withFixture(base, (root) => {
      expect(affected(['functions/src/shared.ts'], root)).toEqual(['alpha']);
      expect(affected(['functions/src/data.json'], root)).toEqual(['alpha']);
      expect(affected(['functions/src/beta.ts'], root)).toEqual([
        'betaV1',
        'gamma',
      ]);
    });
  });

  it('deploys everything for an unimported non-TS file it cannot rule out', () => {
    withFixture(base, (root) => {
      expect(affected(['functions/src/loose.json'], root)).toBe('ALL');
    });
  });

  it('deploys everything for a computed import or an unresolved require', () => {
    withFixture(
      {
        ...base,
        'functions/src/d1.ts':
          'export const d1 = () => import(`./${process.env.X}`);',
      },
      (root) => expect(affected(['functions/src/d1.ts'], root)).toBe('ALL')
    );
    withFixture(
      {
        ...base,
        'functions/src/d1.ts': "export const d1 = require('./missing');",
      },
      (root) => expect(affected(['functions/src/d1.ts'], root)).toBe('ALL')
    );
  });

  it('deploys everything when a change sets global options', () => {
    withFixture(
      {
        ...base,
        'functions/src/d1.ts':
          "import { setGlobalOptions } from 'firebase-functions/v2';\nsetGlobalOptions({});\nexport const d1 = 1;",
      },
      (root) => expect(affected(['functions/src/d1.ts'], root)).toBe('ALL')
    );
  });

  it('deploys everything when most functions are affected', () => {
    withFixture(
      {
        ...base,
        ...Object.fromEntries(
          [1, 2, 3, 4, 5, 6].map((n) => [
            `functions/src/d${n}.ts`,
            `import { shared } from './shared';\nexport const d${n} = shared;`,
          ])
        ),
      },
      (root) => expect(affected(['functions/src/shared.ts'], root)).toBe('ALL')
    );
  });

  it('names only the exports index.ts added or repointed since the deployed copy', () => {
    const index = base['functions/src/index.ts'];
    const without = (line: string) =>
      index
        .split('\n')
        .filter((l) => l !== line)
        .join('\n');
    withFixture(base, (root) => {
      const changed = ['functions/src/index.ts'];
      expect(
        affected(changed, root, without("export { alpha } from './alpha';"))
      ).toEqual(['alpha']);
      expect(
        affected(
          [...changed, 'functions/src/shared.ts'],
          root,
          without("export { d1 } from './d1';")
        )
      ).toEqual(['alpha', 'd1']);
      expect(
        affected(
          changed,
          root,
          index.replace('beta as betaV1', 'gamma as betaV1')
        )
      ).toEqual(['betaV1']);
      expect(affected(changed, root, `// old comment\n${index}`)).toEqual([]);
    });
  });

  it('deploys everything when index.ts removed an export or the deployed copy is missing', () => {
    withFixture(base, (root) => {
      const changed = ['functions/src/index.ts'];
      expect(
        affected(
          changed,
          root,
          `${base['functions/src/index.ts']}\nexport { gone } from './d1';`
        )
      ).toBe('ALL');
      expect(affected(changed, root)).toBe('ALL');
      expect(affected(changed, root, 'export const inline = 1;')).toBe('ALL');
    });
  });

  it('deploys everything when index.ts is more than re-exports', () => {
    withFixture(
      {
        ...base,
        'functions/src/index.ts': `${base['functions/src/index.ts']}\nexport const inline = 1;`,
      },
      (root) => expect(affected(['functions/src/shared.ts'], root)).toBe('ALL')
    );
  });
});

describe('affected-functions.mjs type-only imports', () => {
  const files = (importLine: string) => ({
    'functions/src/index.ts':
      "export { a } from './a';\nexport { b } from './b';\nexport { c } from './c';\nexport { d } from './d';",
    'functions/src/a.ts': `${importLine}\nexport const a = 1;`,
    'functions/src/b.ts': 'export const b = 1;',
    'functions/src/c.ts': 'export const c = 1;',
    'functions/src/d.ts': 'export const d = 1;',
    'functions/src/types.ts':
      'export interface T { x: number }\nexport const V = 1;',
  });

  it('skips imports tsc erases', () => {
    for (const line of [
      "import type { T } from './types';",
      "import { type T } from './types';",
      "import type * as types from './types';",
      "export type { T } from './types';",
    ]) {
      withFixture(files(line), (root) =>
        expect(affected(['functions/src/types.ts'], root), line).toEqual([])
      );
    }
  });

  it('keeps imports that load the module', () => {
    for (const line of [
      "import { V, type T } from './types';",
      "import { V } from './types';",
      "import { type as kind } from './types';",
      "// we import type guards here\nimport { V } from './types';",
      "import './types';",
      "export { V } from './types';",
      "const lazy = () => import('./types');",
    ]) {
      withFixture(files(line), (root) =>
        expect(affected(['functions/src/types.ts'], root), line).toEqual(['a'])
      );
    }
  });
});

describe('affected-functions.mjs feature ids', () => {
  const flags = (preview: string[], open: string[]) =>
    [
      'export const ADMIN_PREVIEW_FEATURES: readonly string[] = [',
      ...preview.map((id) => `  '${id}',`),
      '];',
      'export const PUBLIC_MISSING_DOC_FEATURES: Readonly<Record<string, string | null>> = {',
      ...open.map((entry) => `  ${entry},`),
      '};',
      'export const adminPassesMissingDoc = (id: string): boolean => ADMIN_PREVIEW_FEATURES.includes(id);',
    ].join('\n');
  const deployed = flags(['old-flag'], ["'old-open': null"]);
  const gate =
    "import { adminPassesMissingDoc } from './featureMissingDoc';\nexport const gate = adminPassesMissingDoc;";
  const fixture = (current: string) => ({
    'functions/src/index.ts': [
      "export { asksNew } from './asksNew';",
      "export { asksOld } from './asksOld';",
      "export { generateWithAI } from './aiGeneration';",
      "export { other } from './other';",
      "export { o1 } from './o1';",
      "export { o2 } from './o2';",
      "export { o3 } from './o3';",
      "export { o4 } from './o4';",
    ].join('\n'),
    'functions/src/featureMissingDoc.ts': current,
    'functions/src/gate.ts': gate,
    'functions/src/asksNew.ts':
      "import { gate } from './gate';\nexport const asksNew = () => gate('new-flag');",
    'functions/src/asksOld.ts':
      "import { gate } from './gate';\nexport const asksOld = () => gate('old-flag');",
    'functions/src/aiGeneration.ts':
      "import { gate } from './gate';\nexport const generateWithAI = (type: string) => gate(type);",
    'functions/src/other.ts': 'export const other = 1;',
    'functions/src/o1.ts': 'export const o1 = 1;',
    'functions/src/o2.ts': 'export const o2 = 1;',
    'functions/src/o3.ts': 'export const o3 = 1;',
    'functions/src/o4.ts': 'export const o4 = 1;',
  });
  const changed = ['functions/src/featureMissingDoc.ts'];
  const everyImporter = ['asksNew', 'asksOld', 'generateWithAI'];

  it('names only code that asks about an added id, or builds ids at runtime', () => {
    for (const current of [
      flags(['old-flag', 'new-flag'], ["'old-open': null"]),
      flags(['old-flag'], ["'old-open': null", "'new-flag': 'org'"]),
    ]) {
      withFixture(fixture(current), (root) =>
        expect(affected(changed, root, undefined, deployed)).toEqual([
          'asksNew',
          'generateWithAI',
        ])
      );
    }
  });

  it('names nothing when the lists only change order', () => {
    withFixture(
      fixture(flags(['old-flag', 'new-flag'], ["'old-open': null"])),
      (root) =>
        expect(
          affected(
            changed,
            root,
            undefined,
            flags(['new-flag', 'old-flag'], ["'old-open': null"])
          )
        ).toEqual([])
    );
  });

  it('names every importer when an entry is edited or removed', () => {
    for (const current of [
      flags([], ["'old-open': null"]),
      flags(['old-flag'], ["'old-open': 'org'"]),
      flags(['old-flag', 'new-flag'], []),
      `${flags(['old-flag'], ["'old-open': null"])}\nexport const extra = 1;`,
    ]) {
      withFixture(fixture(current), (root) =>
        expect(affected(changed, root, undefined, deployed)).toEqual(
          everyImporter
        )
      );
    }
  });

  it('names every importer of code that reads the id lists', () => {
    const files = fixture(
      flags(['old-flag', 'new-flag'], ["'old-open': null"])
    );
    files['functions/src/other.ts'] =
      "import { ADMIN_PREVIEW_FEATURES } from './featureMissingDoc';\nexport const other = ADMIN_PREVIEW_FEATURES.length;";
    withFixture(files, (root) =>
      expect(affected(changed, root, undefined, deployed)).toEqual([
        'asksNew',
        'generateWithAI',
        'other',
      ])
    );
  });

  it('names every importer without the deployed copy', () => {
    withFixture(
      fixture(flags(['old-flag', 'new-flag'], ["'old-open': null"])),
      (root) => expect(affected(changed, root)).toEqual(everyImporter)
    );
  });
});

describe('function-targets.mjs', () => {
  function targets(deployOnly: string, lib: string, cwd = repoRoot): string {
    return execFileSync('node', [targetsScript, deployOnly, lib], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }

  it('keeps Cloud Functions, drops helpers, and leaves other targets alone', () => {
    withFixture(
      {
        'lib/index.js':
          'exports.fn = Object.assign(() => {}, { __endpoint: {} });\nexports.__helper = () => {};',
      },
      (root) => {
        const lib = join(root, 'lib/index.js');
        expect(targets('functions:fn,functions:__helper,storage', lib)).toBe(
          'functions:default:fn,storage'
        );
        expect(targets('functions,storage', lib)).toBe('functions,storage');
        expect(targets('', lib)).toBe('');
        // No named target surviving means the marker moved, so deploy them all rather than none.
        expect(targets('functions:__helper,storage', lib)).toBe(
          'functions,storage'
        );
      }
    );
  });

  it('deploys every function when the shared backend came from elsewhere', () => {
    withFixture(
      {
        'lib/index.js':
          'exports.fn = Object.assign(() => {}, { __endpoint: {} });',
      },
      (root) => {
        const out = execFileSync(
          'node',
          [targetsScript, 'functions:fn,storage', join(root, 'lib/index.js')],
          {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
            env: { ...process.env, DEPLOY_ALL_FUNCTIONS: 'true' },
          }
        ).trim();
        expect(out).toBe('functions,storage');
      }
    );
  });

  it('deploys every function when the build cannot be loaded', () => {
    expect(targets('functions:fn,storage', join(tmpdir(), 'nope.js'))).toBe(
      'functions,storage'
    );
  });

  it('names each function under the codebase the manifest gives it', () => {
    withFixture(
      {
        'lib/index.js': [
          'const fn = () => Object.assign(() => {}, { __endpoint: {} });',
          'exports.orgAdminV1 = fn();',
          'exports.fetchLinkPreview = fn();',
        ].join('\n'),
        'firebase.json': JSON.stringify({
          functions: [
            { source: 'functions/deploy/default', codebase: 'default' },
            { source: 'functions/deploy/admin', codebase: 'admin' },
          ],
        }),
        'functions/codebases.json': JSON.stringify({
          codebases: { admin: ['orgAdminV1'] },
        }),
      },
      (root) => {
        const lib = join(root, 'lib/index.js');
        // A bare name or a stale codebase is rewritten to the manifest's codebase.
        expect(
          targets(
            'functions:orgAdminV1,functions:default:fetchLinkPreview,storage',
            lib,
            root
          )
        ).toBe(
          'functions:admin:orgAdminV1,functions:default:fetchLinkPreview,storage'
        );
        expect(targets('functions:default:orgAdminV1', lib, root)).toBe(
          'functions:admin:orgAdminV1'
        );
        // A whole codebase passes through, and a codebase firebase.json lacks deploys everything.
        expect(targets('functions:admin,storage', lib, root)).toBe(
          'functions:admin,storage'
        );
        expect(targets('functions:nope:fn,storage', lib, root)).toBe(
          'functions,storage'
        );
      }
    );
  });
});
