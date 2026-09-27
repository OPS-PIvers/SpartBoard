/**
 * Locale parity for the Scoreboard's class-group controls
 * (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D17/D20).
 *
 * `widgetSettings.scoreboard` existed only in EN before this feature, so the
 * easy mistake here is to add the new strings to EN alone and let i18next's
 * English fallback hide it. That is exactly what happened to the roster-group
 * keys on the classes panel — see sidebarClassesGroupsLocales.test.ts.
 *
 * Loads the locale JSON directly rather than going through i18next, because
 * the runtime fallback would make a missing key look present.
 */
import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const REQUIRED_KEYS = [
  'classGroups',
  'useGroupNames',
  'importClassGroups_one',
  'importClassGroups_other',
  'importedClassGroups_one',
  'importedClassGroups_other',
  'resyncMembers',
  'resyncedMembers_one',
  'resyncedMembers_other',
  'resyncUnlinked_one',
  'resyncUnlinked_other',
  'replaceTeamsTitle',
  'replaceTeamsBody_one',
  'replaceTeamsBody_other',
  'replaceTeamsConfirm',
  'classTeamName',
  'membersTitle',
] as const;

const scoreboardOf = (locale: unknown): Record<string, unknown> | undefined =>
  (
    (locale as { widgetSettings?: Record<string, unknown> }).widgetSettings ??
    {}
  ).scoreboard as Record<string, unknown> | undefined;

describe.each([
  { code: 'en', locale: en },
  { code: 'de', locale: de },
  { code: 'es', locale: es },
  { code: 'fr', locale: fr },
])('$code — widgetSettings.scoreboard class-group keys', ({ code, locale }) => {
  it(`${code}: has every class-group key`, () => {
    const scoreboard = scoreboardOf(locale);
    for (const key of REQUIRED_KEYS) {
      expect(
        scoreboard,
        `${code}.widgetSettings.scoreboard.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: keeps the plural forms and no bare singular`, () => {
    const scoreboard = scoreboardOf(locale) ?? {};
    for (const base of [
      'importClassGroups',
      'importedClassGroups',
      'resyncedMembers',
      'resyncUnlinked',
      'replaceTeamsBody',
    ]) {
      expect(
        scoreboard[base],
        `${code}: bare ${base} shadows its plurals`
      ).toBeUndefined();
    }
  });
});
