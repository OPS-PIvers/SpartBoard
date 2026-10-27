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

function affected(changed: string[], root = repoRoot): string[] | 'ALL' {
  const result = spawnSync('node', [affectedScript, root], {
    input: changed.join('\n'),
    encoding: 'utf-8',
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
  it('finds every relative import the TypeScript compiler resolves', () => {
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
      const info = ts.preProcessFile(readFileSync(abs, 'utf-8'), true, true);
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
  });

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

describe('function-targets.mjs', () => {
  function targets(deployOnly: string, lib: string): string {
    return execFileSync('node', [targetsScript, deployOnly, lib], {
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
          'functions:fn,storage'
        );
        expect(targets('functions,storage', lib)).toBe('functions,storage');
        expect(targets('', lib)).toBe('');
      }
    );
  });

  it('deploys every function when the build cannot be loaded', () => {
    expect(targets('functions:fn,storage', join(tmpdir(), 'nope.js'))).toBe(
      'functions,storage'
    );
  });
});
