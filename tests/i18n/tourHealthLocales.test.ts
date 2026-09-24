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
])('$code locale — live tour parity', ({ code, locale }) => {
  it(`${code}: provides every Tour Health and tour offer key`, () => {
    expect(flattenKeys(locale.tourHealth).sort()).toEqual(
      flattenKeys(en.tourHealth).sort()
    );
    expect(flattenKeys(locale.tours).sort()).toEqual(
      flattenKeys(en.tours).sort()
    );
  });
});
