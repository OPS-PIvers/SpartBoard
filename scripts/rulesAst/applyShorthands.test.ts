import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyShorthands } from './applyShorthands.mjs';

const wrap = (body: string) =>
  [
    "rules_version = '2';",
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    body,
    '  }',
    '}',
  ].join('\n');

const rulesOf = (out: string) =>
  out.split('\n').filter((l) => l.includes('allow '));

describe('applyShorthands', () => {
  it('rewrites the data and uid accessors', () => {
    const out = applyShorthands(
      wrap(
        '    allow update: if request.resource.data.a == resource.data.b && request.auth.uid != null;'
      )
    );
    expect(rulesOf(out)).toEqual([
      '    allow update: if incoming().a == existing().b && authUid() != null;',
    ]);
    expect(out).toContain(
      'function incoming() { return request.resource.data; }'
    );
  });

  it('only folds comparisons that stand alone between && and ||', () => {
    const out = applyShorthands(
      wrap(
        [
          '    allow update: if request.resource.data.a == resource.data.a',
          '      && request.resource.data.t is string',
          '      && x + request.resource.data.b == resource.data.b',
          '      && request.resource.data.c == resource.data.c.d;',
        ].join('\n')
      )
    );
    expect(out).toContain("if unchanged('a')");
    expect(out).toContain("&& isStr('t')");
    expect(out).toContain('x + incoming().b == existing().b');
    expect(out).toContain('incoming().c == existing().c.d');
    expect(out).toContain('function isStr(k)');
    expect(out).not.toContain('function isInt(k)');
  });

  it('skips comment lines and marked regions', () => {
    const src = wrap(
      [
        '    // request.resource.data stays in prose',
        '    // shorthands: off',
        '    allow read: if request.auth.uid == resource.data.owner;',
        '    // shorthands: on',
        '    allow write: if request.auth.uid == resource.data.owner;',
      ].join('\n')
    );
    const out = applyShorthands(src);
    expect(out).toContain('// request.resource.data stays in prose');
    expect(out).toContain(
      'allow read: if request.auth.uid == resource.data.owner;'
    );
    expect(out).toContain('allow write: if authUid() == existing().owner;');
  });

  it('is idempotent on firestore.rules', () => {
    const rules = readFileSync(
      path.resolve(__dirname, '../../firestore.rules'),
      'utf8'
    );
    expect(applyShorthands(rules)).toBe(rules);
  });
});
