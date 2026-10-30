import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import * as client from '@/utils/import/sendBlockList';
import * as copy from '@/functions/src/import/shared.gen';

// Order matters: each file only uses names from the files before it.
const SOURCES = ['utils/import/contract.ts', 'utils/import/sendBlockList.ts'];

const FILE = resolve(process.cwd(), 'functions/src/import/shared.gen.ts');

const generated = () =>
  [
    '// Generated from utils/import/ by tests/importSharedCopy.test.ts; rerun it with UPDATE_IMPORT_SHARED_COPY=1.',
    ...SOURCES.map((path) =>
      readFileSync(resolve(process.cwd(), path), 'utf8').replace(
        /^import[\s\S]*?;\n/gm,
        (chunk) => {
          // Only whole static imports may be stripped; anything else would silently eat code.
          if (!/^import [^;]* from '[^']+';\n$/.test(chunk))
            throw new Error(`Unexpected import in ${path}: ${chunk}`);
          return '';
        }
      )
    ),
  ].join('\n');

describe('functions copy of the import contract', () => {
  it('matches utils/import/ (UPDATE_IMPORT_SHARED_COPY=1 rewrites it)', async () => {
    const text = generated();
    if (process.env.UPDATE_IMPORT_SHARED_COPY) {
      await writeGenerated(FILE, text);
      return;
    }
    const config = await resolveConfig(FILE);
    const expected = await format(text, { ...config, filepath: FILE });
    expect(readFileSync(FILE, 'utf8')).toBe(expected);
  });

  it('has no imports, so functions/ can compile it on its own', () => {
    expect(readFileSync(FILE, 'utf8')).not.toMatch(/^import /m);
  });

  it('blocks exactly like the client', () => {
    const urls = [
      'https://orono.schoology.com/course/123/gradebook',
      'https://orono.schoology.com/course/123/materials',
      'https://campus.infinitecampus.org/x',
      'javascript:alert(1)',
    ];
    for (const url of urls)
      expect(copy.isUrlBlocked(url, copy.DEFAULT_SEND_BLOCK_PATTERNS)).toBe(
        client.isUrlBlocked(url, client.DEFAULT_SEND_BLOCK_PATTERNS)
      );
  });
});
