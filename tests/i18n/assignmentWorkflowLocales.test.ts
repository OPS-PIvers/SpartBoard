/**
 * Locale-parity regression test for the four M17 individual-assignment
 * namespaces (F4 fix) — mirrors sidebarClassesGroupsLocales.test.ts's
 * pattern of loading each locale JSON directly (not via i18next) so a
 * missing key is caught before i18next silently falls back to English.
 *
 * Namespaces covered: assignStudentPicker (B1 picker), studentOverride (B2
 * per-student override editor), assignTargeting (B3 shared targeting
 * section), assignmentsHub (D2/D3 unified assignments hub + detail pane).
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

type JsonObject = Record<string, unknown>;
type LocaleFile = typeof en;

/** Every dotted leaf key path under a namespace, e.g. "chip.hiddenOptions_one". */
function collectKeyPaths(obj: JsonObject, prefix = ''): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...collectKeyPaths(value as JsonObject, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

const NAMESPACES = [
  'assignStudentPicker',
  'studentOverride',
  'assignTargeting',
  'assignmentsHub',
] as const;

describe('EN locale — M17 assignment-workflow namespaces baseline', () => {
  it('every namespace exists and is non-empty in EN', () => {
    for (const ns of NAMESPACES) {
      const value = (en as unknown as JsonObject)[ns];
      expect(value, `en.${ns} is missing`).toBeTruthy();
      expect(
        collectKeyPaths(value as JsonObject).length,
        `en.${ns} has no keys`
      ).toBeGreaterThan(0);
    }
  });
});

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])(
  '$code locale — M17 assignment-workflow key parity with EN',
  ({ code, locale }) => {
    for (const ns of NAMESPACES) {
      it(`${code}.${ns}: has all EN key paths`, () => {
        const enNs = (en as unknown as JsonObject)[ns] as JsonObject;
        const localeNs = (locale as unknown as JsonObject)[ns] as
          | JsonObject
          | undefined;
        expect(localeNs, `${code}.${ns} is missing`).toBeTruthy();
        const enPaths = collectKeyPaths(enNs);
        const localePaths = new Set(collectKeyPaths(localeNs ?? {}));
        for (const path of enPaths) {
          expect(
            localePaths.has(path),
            `${code}.${ns}.${path} is missing`
          ).toBe(true);
        }
      });
    }
  }
);
