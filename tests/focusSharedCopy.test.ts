import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';
import { writeGenerated } from './helpers/writeGenerated';
import * as client from '@/utils/focus/allowlist';
import * as copy from '@/functions/src/focus/shared.gen';

// Order matters: each file only uses names from the files before it.
const SOURCES = [
  'utils/focus/contract.ts',
  'utils/focus/allowlist.ts',
  'utils/focus/settings.ts',
];

const FILE = resolve(process.cwd(), 'functions/src/focus/shared.gen.ts');

const generated = () =>
  [
    '// Generated from utils/focus/ by tests/focusSharedCopy.test.ts; rerun it with UPDATE_FOCUS_SHARED_COPY=1.',
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

describe('functions copy of the focus contract', () => {
  it('matches utils/focus/ (UPDATE_FOCUS_SHARED_COPY=1 rewrites it)', async () => {
    const text = generated();
    if (process.env.UPDATE_FOCUS_SHARED_COPY) {
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

  it('parses and matches exactly like the client', () => {
    const inputs = [
      'desmos.com',
      'https://www.desmos.com/calculator/',
      'docs.google.com/document/u/1/d/abc/edit#heading',
      'http://user:pw@evil.example',
      '127.0.0.1',
    ];
    for (const input of inputs)
      expect(copy.parseFocusSite(input)).toEqual(client.parseFocusSite(input));
    const sites = [{ host: 'desmos.com', path: '/calculator' }];
    for (const url of [
      'https://desmos.com/calculator/x',
      'https://desmos.com.evil.example/calculator',
      'chrome://newtab',
    ])
      expect(copy.matchFocusUrl(url, sites)).toBe(
        client.matchFocusUrl(url, sites)
      );
  });
});
