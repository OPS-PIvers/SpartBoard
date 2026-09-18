/**
 * Locale parity for the pool controls on Checklist and Poll
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D21/D22).
 *
 * `widgetSettings.checklist` and `widgetSettings.poll` were English-only
 * before this feature, so the easy mistake is to add the new strings to EN
 * alone and let i18next's fallback hide it — the same failure the classes
 * panel and the Scoreboard strings already have a test for.
 *
 * Reads the locale JSON directly; going through i18next would make a missing
 * key look present.
 */
import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const REQUIRED = {
  checklist: [
    'poolGroup',
    'poolWholeClass',
    'poolGroupEmpty',
    'rosterGroupsOff',
  ],
  poll: ['importScope', 'importWholeClass', 'importGroupEmpty'],
} as const;

const sectionOf = (
  locale: unknown,
  name: string
): Record<string, unknown> | undefined =>
  ((locale as { widgetSettings?: Record<string, unknown> }).widgetSettings ??
    {})[name] as Record<string, unknown> | undefined;

describe.each([
  { code: 'en', locale: en },
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code — widget pool-control keys', ({ code, locale }) => {
  it.each(Object.entries(REQUIRED))(
    `${code}: widgetSettings.%s has every pool key`,
    (section, keys) => {
      const bundle = sectionOf(locale, section);
      for (const key of keys) {
        expect(
          bundle,
          `${code}.widgetSettings.${section}.${key} is missing`
        ).toHaveProperty(key);
      }
    }
  );
});
