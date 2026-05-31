/**
 * Regression test for the missing plcDashboard locale namespace in DE/ES/FR.
 *
 * The plcDashboard namespace (~200 keys) was added to the EN locale as part of
 * the PLC Dashboard feature (PlcDashboard.tsx, PLC tabs, notes, todos, quiz
 * library, bento overview layout). The namespace was never propagated to DE,
 * ES, or FR — all three non-English languages silently fall back to English for
 * the entire PLC Dashboard UI, breaking the localisation contract.
 *
 * This test loads each locale JSON directly (not via i18next) so it catches
 * key-presence issues before the i18next runtime silently swallows them.
 */

import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

/** Top-level sub-sections that must exist under plcDashboard. */
const REQUIRED_TOP_LEVEL_SECTIONS = [
  'subtitle',
  'backToMenu',
  'close',
  'tabs',
  'assignmentsSubTabs',
  'quizzesSubTabs',
  'videoActivitiesSubTabs',
  'assignmentsLibrary',
  'assignmentsInProgress',
  'meta',
  'completedAssignments',
  'placeholder',
  'settings',
  'overview',
  'notes',
  'todos',
  'quizLibrary',
] as const;

/** Keys within plcDashboard.tabs */
const REQUIRED_TABS_KEYS = [
  'overview',
  'quizzes',
  'videoActivities',
  'notes',
  'todos',
  'sharedBoards',
  'settings',
  'home',
  'members',
  'sharedData',
  'docs',
  'resources',
] as const;

/** Keys within plcDashboard.quizLibrary */
const REQUIRED_QUIZ_LIBRARY_KEYS = [
  'heading',
  'count_one',
  'count_other',
  'emptyTitle',
  'emptySubtitle',
  'bySharer',
  'unknownSharer',
  'questionCount_one',
  'questionCount_other',
  'addToMyLibrary',
  'reimport',
  'inLibrary',
  'alreadySynced',
  'unshareAction',
  'unshareYours',
  'unshareTeammate',
  'unshareTitle',
  'unshareConfirm',
  'unshared',
  'unshareFailed',
  'importedSync',
  'importedCopy',
  'importFailed',
  'editAction',
  'editTooltip',
  'editTooltipAutoImport',
  'editAutoImported',
  'editSaved',
  'editConflict',
  'editFailed',
  'driveRequired',
  'driveRequiredForEdit',
  'driveDisconnected',
] as const;

/** Keys within plcDashboard.notes */
const REQUIRED_NOTES_KEYS = [
  'heading',
  'newNote',
  'untitled',
  'empty',
  'emptyTitle',
  'emptySubtitle',
  'titlePlaceholder',
  'bodyPlaceholder',
  'deleteNote',
  'confirmDelete',
  'confirmDeleteTitle',
  'lastEdited',
  'pickOrCreate',
] as const;

/** Keys within plcDashboard.todos */
const REQUIRED_TODOS_KEYS = [
  'addPlaceholder',
  'add',
  'openHeading',
  'doneHeading',
  'allDone',
  'toggle',
  'deleteTodo',
  'confirmDelete',
  'confirmDeleteTitle',
] as const;

/** Keys within plcDashboard.settings */
const REQUIRED_SETTINGS_KEYS = [
  'heading',
  'description',
  'saveFailed',
] as const;

/** Keys within plcDashboard.overview */
const REQUIRED_OVERVIEW_KEYS = [
  'heading',
  'editLayout',
  'doneEditing',
  'reset',
  'editHint',
  'confirmReset',
  'confirmResetTitle',
  'dragHandle',
  'hideTile',
  'unhideTile',
  'resizeTile',
  'hiddenTiles',
  'hiddenTilesHint',
  'tiles',
] as const;

type LocaleFile = typeof en;

// ─── EN baseline ────────────────────────────────────────────────────────────

describe('EN locale — plcDashboard baseline', () => {
  it('has a plcDashboard section', () => {
    expect(en).toHaveProperty('plcDashboard');
  });

  it('has all required top-level sections', () => {
    for (const key of REQUIRED_TOP_LEVEL_SECTIONS) {
      expect(
        en.plcDashboard,
        `en.plcDashboard.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required plcDashboard.tabs keys', () => {
    for (const key of REQUIRED_TABS_KEYS) {
      expect(
        en.plcDashboard.tabs,
        `en.plcDashboard.tabs.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required plcDashboard.quizLibrary keys', () => {
    for (const key of REQUIRED_QUIZ_LIBRARY_KEYS) {
      expect(
        en.plcDashboard.quizLibrary,
        `en.plcDashboard.quizLibrary.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required plcDashboard.notes keys', () => {
    for (const key of REQUIRED_NOTES_KEYS) {
      expect(
        en.plcDashboard.notes,
        `en.plcDashboard.notes.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required plcDashboard.todos keys', () => {
    for (const key of REQUIRED_TODOS_KEYS) {
      expect(
        en.plcDashboard.todos,
        `en.plcDashboard.todos.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });
});

// ─── DE / ES / FR parity ────────────────────────────────────────────────────

describe.each([
  { code: 'de', locale: de as unknown as LocaleFile },
  { code: 'es', locale: es as unknown as LocaleFile },
  { code: 'fr', locale: fr as unknown as LocaleFile },
])('$code locale — plcDashboard parity with EN', ({ code, locale }) => {
  it(`${code}: has a plcDashboard section`, () => {
    expect(
      locale,
      `${code}.plcDashboard section is entirely missing`
    ).toHaveProperty('plcDashboard');
  });

  it(`${code}: has all required top-level sections`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_TOP_LEVEL_SECTIONS) {
      expect(plc, `${code}.plcDashboard.${key} is missing`).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.tabs keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const tabs = plc?.tabs as Record<string, unknown> | undefined;
    for (const key of REQUIRED_TABS_KEYS) {
      expect(
        tabs,
        `${code}.plcDashboard.tabs.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.quizLibrary keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const ql = plc?.quizLibrary as Record<string, unknown> | undefined;
    for (const key of REQUIRED_QUIZ_LIBRARY_KEYS) {
      expect(
        ql,
        `${code}.plcDashboard.quizLibrary.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.notes keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const notes = plc?.notes as Record<string, unknown> | undefined;
    for (const key of REQUIRED_NOTES_KEYS) {
      expect(
        notes,
        `${code}.plcDashboard.notes.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.todos keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const todos = plc?.todos as Record<string, unknown> | undefined;
    for (const key of REQUIRED_TODOS_KEYS) {
      expect(
        todos,
        `${code}.plcDashboard.todos.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.settings keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const settings = plc?.settings as Record<string, unknown> | undefined;
    for (const key of REQUIRED_SETTINGS_KEYS) {
      expect(
        settings,
        `${code}.plcDashboard.settings.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.overview keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const overview = plc?.overview as Record<string, unknown> | undefined;
    for (const key of REQUIRED_OVERVIEW_KEYS) {
      expect(
        overview,
        `${code}.plcDashboard.overview.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});
