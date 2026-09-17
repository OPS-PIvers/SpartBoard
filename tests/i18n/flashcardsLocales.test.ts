import { describe, expect, it } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const flattenKeys = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child !== null
      ? flattenKeys(child as object, path)
      : [path];
  });

describe.each([
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code locale — Flashcards player parity', ({ code, locale }) => {
  it(`${code}: provides every student-facing Flashcards key`, () => {
    expect(flattenKeys(locale.flashcards).sort()).toEqual(
      flattenKeys(en.flashcards).sort()
    );
  });
});
