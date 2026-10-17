import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { minifyRules, proveRenamed } from './minifyRules.mjs';
import { findEmulatorJar } from './rulesAst/emulatorJar.mjs';
import { stripRulesComments } from './stripRulesComments.mjs';

const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

const SAMPLE = [
  "rules_version = '2';",
  'service cloud.firestore {',
  '  match /databases/{database}/documents {',
  '    function incoming() { return request.resource.data; }',
  '    function ownsDoc(userId) { return request.auth.uid == userId; }',
  '    function keysOk(data) { let keys = data.keys(); return keys.hasOnly([\'userId\', "data"]); }',
  '    match /artifacts/{appId}/public/data/keys/{userId} {',
  '      allow write: if ownsDoc(userId) && keysOk(incoming()) && incoming().userId == userId;',
  '      allow read: if exists(/databases/$(database)/documents/userId/$(userId)/data/x);',
  '    }',
  '  }',
  '}',
  '',
].join('\n');

describe('minifyRules', () => {
  const { text, map } = minifyRules(SAMPLE);

  it('renames bound names and their references', () => {
    for (const name of [
      'incoming',
      'ownsDoc',
      'keysOk',
      'userId',
      'appId',
      'database',
    ])
      expect(map.has(name)).toBe(true);
    expect(text).toContain(
      `function ${map.get('ownsDoc')}(${map.get('userId')})`
    );
    expect(text).toContain(`$(${map.get('database')})`);
  });

  it('never touches path segments, fields, methods or strings', () => {
    expect(text).toContain('/public/data/keys/{');
    expect(text).toContain('/documents/userId/$(');
    expect(text).toContain(`${map.get('incoming')}().userId ==`);
    expect(text).toContain('.keys()');
    expect(text).toContain('[\'userId\', "data"]');
  });

  it('never picks a keyword or a word already in the source', () => {
    const shorts = [...map.values()];
    for (const word of [
      'do',
      'in',
      'is',
      'if',
      'for',
      'let',
      'get',
      'data',
      'keys',
      'x',
    ])
      expect(shorts).not.toContain(word);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it('is deterministic', () => {
    expect(minifyRules(SAMPLE).text).toBe(text);
  });
});

describe.runIf(findEmulatorJar())(
  'proveRenamed (Firebase rules compiler)',
  () => {
    it('proves the real firestore.rules minifies to the same rules', () => {
      const stripped = stripRulesComments(readFileSync(RULES_PATH, 'utf8'));
      const { text, map } = minifyRules(stripped);
      expect(proveRenamed(stripped, text, map)).toMatch(/^EQUIVALENT/);
    }, 120_000);

    it('rejects a renamed path segment', () => {
      const { text, map } = minifyRules(SAMPLE);
      const broken = text.replace(
        '/public/data/',
        `/public/${map.get('keysOk')}/`
      );
      const withSegment = new Map(map).set('data', map.get('keysOk') ?? '');
      expect(() => proveRenamed(SAMPLE, broken, withSegment)).toThrow(
        /not equivalent/
      );
    }, 60_000);

    it('rejects a renamed field even when the map would rename it back', () => {
      const { text, map } = minifyRules(SAMPLE);
      const broken = text.replace(
        `${map.get('incoming')}().userId`,
        `${map.get('incoming')}().${map.get('userId')}`
      );
      expect(() => proveRenamed(SAMPLE, broken, map)).toThrow(/not equivalent/);
    }, 60_000);

    it('proves already-minified rules, where nothing is left to rename', () => {
      const once = minifyRules(SAMPLE).text;
      const twice = minifyRules(once);
      expect(proveRenamed(once, twice.text, twice.map)).toMatch(/^EQUIVALENT/);
      expect(proveRenamed(once, once, new Map())).toMatch(
        /^EQUIVALENT \(0 names/
      );
    }, 60_000);

    it('rejects a logic change', () => {
      const { text, map } = minifyRules(SAMPLE);
      expect(() =>
        proveRenamed(
          SAMPLE,
          text.replace('allow read: if', 'allow read: if true ||'),
          map
        )
      ).toThrow(/not equivalent/);
    }, 60_000);
  }
);
