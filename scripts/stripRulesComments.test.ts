import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertOnlyCommentsRemoved,
  stripRulesComments,
} from './stripRulesComments.mjs';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');
const CAP_BYTES = 262144;

describe('stripRulesComments', () => {
  it('removes full-line comments and blank lines only', () => {
    const src = [
      "rules_version = '2';",
      '// top-level comment',
      '',
      'service cloud.firestore {',
      '    // indented comment',
      '   ',
      '  match /x/{id} {',
      '    allow read: if true; // trailing comment survives',
      '  }',
      '}',
      '',
    ].join('\n');
    expect(stripRulesComments(src)).toBe(
      [
        "rules_version = '2';",
        'service cloud.firestore {',
        '  match /x/{id} {',
        '    allow read: if true; // trailing comment survives',
        '  }',
        '}',
        '',
      ].join('\n')
    );
  });

  it('never touches // inside string literals or regexes', () => {
    const src = [
      "allow write: if data.url.matches('https://docs\\\\.google\\\\.com/.*');",
      "  allow read: if x == '//not a comment';",
      '',
    ].join('\n');
    expect(stripRulesComments(src)).toBe(src);
  });

  it('is idempotent and preserves CRLF endings', () => {
    const src = 'a\r\n// c\r\n\r\nb\r\n';
    const once = stripRulesComments(src);
    expect(once).toBe('a\r\nb\r\n');
    expect(stripRulesComments(once)).toBe(once);
  });

  it('assertOnlyCommentsRemoved rejects a stripped file with an altered code line', () => {
    const src = 'a\n// c\nb\n';
    expect(() => assertOnlyCommentsRemoved(src, 'a\nB\n')).toThrow(
      /altered a code line/
    );
    expect(() => assertOnlyCommentsRemoved(src, 'a\n')).toThrow(/line count/);
    expect(() =>
      assertOnlyCommentsRemoved(src, stripRulesComments(src))
    ).not.toThrow();
  });

  it('keeps the real firestore.rules byte-identical outside comments and under the cap', () => {
    const source = readFileSync(RULES_PATH, 'utf8');
    const stripped = stripRulesComments(source);
    expect(() => assertOnlyCommentsRemoved(source, stripped)).not.toThrow();
    expect(stripped).not.toMatch(/^\s*\/\//m);
    expect(Buffer.byteLength(stripped, 'utf8')).toBeLessThan(CAP_BYTES);
  });
});
