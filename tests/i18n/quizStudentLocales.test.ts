/**
 * Locale-parity test for the `quizStudent` namespace: the student quiz screen
 * must read the same in every language an accommodation can pick.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type JsonObject = Record<string, unknown>;

function collectLeaves(
  obj: JsonObject,
  prefix = ''
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, collectLeaves(value as JsonObject, path));
    } else {
      out[path] = typeof value === 'string' ? value : undefined;
    }
  }
  return out;
}

const NS = 'quizStudent';
const leavesOf = (locale: unknown) =>
  collectLeaves((locale as JsonObject)[NS] as JsonObject);
const placeholders = (value: string) =>
  [...value.matchAll(/\{\{\s*\w+\s*\}\}/g)].map((m) => m[0]).sort();

const enLeaves = leavesOf(en);

describe('EN quizStudent namespace', () => {
  it('exists and is non-empty', () => {
    expect(Object.keys(enLeaves).length).toBeGreaterThan(0);
  });

  it('has no empty or non-string values', () => {
    for (const [path, value] of Object.entries(enLeaves)) {
      expect(typeof value, `en.${NS}.${path}`).toBe('string');
      expect(value, `en.${NS}.${path} is empty`).not.toBe('');
    }
  });
});

describe.each([
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
  { code: 'de', locale: de },
])('$code quizStudent namespace', ({ locale }) => {
  const leaves = leavesOf(locale);

  it('has every EN key and no extras', () => {
    expect(Object.keys(leaves).sort()).toEqual(Object.keys(enLeaves).sort());
  });

  it('has no empty values', () => {
    for (const [path, value] of Object.entries(leaves)) {
      expect(typeof value, `${NS}.${path}`).toBe('string');
      expect(value, `${NS}.${path} is empty`).not.toBe('');
    }
  });

  it('keeps every {{placeholder}} from EN', () => {
    for (const [path, enValue] of Object.entries(enLeaves)) {
      expect(placeholders(leaves[path] ?? ''), `${NS}.${path}`).toEqual(
        placeholders(enValue ?? '')
      );
    }
  });

  it('is translated, not pasted from EN', () => {
    const paths = Object.keys(enLeaves);
    const differing = paths.filter((path) => leaves[path] !== enLeaves[path]);
    expect(differing.length / paths.length).toBeGreaterThanOrEqual(0.9);
  });
});
