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
  'members',
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
  // Wave-2 (T4): markdown preview + meeting template + version-conflict.
  'createFailed',
  'previewMarkdown',
  'editMarkdown',
  'emptyPreview',
  'conflictTitle',
  'conflictMessage',
  'conflictReload',
  'meeting.label',
  'meeting.newMeetingNote',
  'meeting.newMeetingNoteShort',
  'meeting.agenda',
  'meeting.decisions',
  'meeting.actionItems',
] as const;

/** Keys within plcDashboard.notesDocs (Wave-2 T4 combined surface). */
const REQUIRED_NOTES_DOCS_KEYS = [
  'notesTab',
  'docsTab',
  'tablistLabel',
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

/** Keys within plcDashboard.trash (Wave-2 soft-delete + Trash, Decision 3.1) */
const REQUIRED_TRASH_KEYS = [
  'heading',
  'description',
  'empty',
  'emptySubtitle',
  'restore',
  'restored',
  'restoreFailed',
  'restoreItem',
  'deletedWhen',
  'deletedToast',
  'undo',
  'loadError',
  'untitled',
] as const;

/** Per-type label keys within plcDashboard.trash.type */
const REQUIRED_TRASH_TYPE_KEYS = [
  'note',
  'todo',
  'doc',
  'comment',
  'quiz',
  'videoActivity',
] as const;

/** Keys within plcDashboard.presence (T7 who's-here strip, Decision 2.1) */
const REQUIRED_PRESENCE_KEYS = [
  'heading',
  'othersHere',
  'othersHere_plural',
  'inSection',
  'justYou',
  'youLabel',
  'includingYou',
  'overflow',
  'stripAria',
  'stripAria_plural',
  'meetingSection',
] as const;

/** Keys within plcDashboard.activity (T8 activity feed + since-you-were-here) */
const REQUIRED_ACTIVITY_KEYS = [
  'heading',
  'empty',
  'sinceLastVisit',
  'sinceSubtitle',
  'olderHeading',
  'caughtUp',
  'caughtUpSubtitle',
  'unreadBadge',
  'loadError',
  'feedHeading',
  'feedAria',
  'unknownActor',
  'untitled',
  'youMentioned',
  'mentionBadge',
  'justNow',
] as const;

/** Keys within plcDashboard.activity.event — one per PlcActivityType. */
const REQUIRED_ACTIVITY_EVENT_KEYS = [
  'member_joined',
  'member_left',
  'role_changed',
  'assessment_created',
  'assessment_shared',
  'assessment_results_ready',
  'meeting_held',
  'note_created',
  'comment_added',
  'item_deleted',
  'item_restored',
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

/** Keys within plcDashboard.members (T10 membership-management surface) */
const REQUIRED_MEMBERS_KEYS = [
  'heading',
  'you',
  'roles',
  'roleSelectAriaLabel',
  'confirmRole',
  'confirmRoleTitle',
  'confirmRoleAction',
  'makeLead',
  'makeLeadAriaLabel',
  'confirmTransfer',
  'confirmTransferTitle',
  'remove',
  'removeAriaLabel',
  'confirmRemove',
  'confirmRemoveTitle',
  'leave',
  'leavePlc',
  'confirmLeave',
  'confirmLeaveTitle',
  'inviteHeading',
  'invitePlaceholder',
  'invite',
  'sending',
  'invalidEmail',
  'alreadyMember',
  'inviteSent',
  'inviteError',
  'pendingHeading',
  'pendingSince',
  'revoke',
  'revokeAriaLabel',
  'notManager',
] as const;

/** Keys within plcDashboard.members.roles */
const REQUIRED_MEMBERS_ROLES_KEYS = [
  'lead',
  'coLead',
  'member',
  'viewer',
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

  it('has all required plcDashboard.notesDocs keys', () => {
    const notesDocs = (en.plcDashboard as Record<string, unknown>).notesDocs as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_NOTES_DOCS_KEYS) {
      expect(
        notesDocs,
        `en.plcDashboard.notesDocs.${key} is missing from EN`
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

  it('has all required plcDashboard.members keys', () => {
    const members = (en.plcDashboard as Record<string, unknown>).members as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_MEMBERS_KEYS) {
      expect(
        members,
        `en.plcDashboard.members.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required plcDashboard.members.roles keys', () => {
    const members = (en.plcDashboard as Record<string, unknown>).members as
      | Record<string, unknown>
      | undefined;
    const roles = members?.roles as Record<string, unknown> | undefined;
    for (const key of REQUIRED_MEMBERS_ROLES_KEYS) {
      expect(
        roles,
        `en.plcDashboard.members.roles.${key} is missing from EN`
      ).toHaveProperty(key);
    }
  });

  it('has all required plcDashboard.activity keys', () => {
    const activity = (en.plcDashboard as Record<string, unknown>).activity as
      | Record<string, unknown>
      | undefined;
    for (const key of REQUIRED_ACTIVITY_KEYS) {
      expect(
        activity,
        `en.plcDashboard.activity.${key} is missing from EN`
      ).toHaveProperty(key);
    }
    const event = activity?.event as Record<string, unknown> | undefined;
    for (const key of REQUIRED_ACTIVITY_EVENT_KEYS) {
      expect(
        event,
        `en.plcDashboard.activity.event.${key} is missing from EN`
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

  it(`${code}: has all required plcDashboard.notesDocs keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const notesDocs = plc?.notesDocs as Record<string, unknown> | undefined;
    for (const key of REQUIRED_NOTES_DOCS_KEYS) {
      expect(
        notesDocs,
        `${code}.plcDashboard.notesDocs.${key} is missing`
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

  it(`${code}: has all required plcDashboard.trash keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const trash = plc?.trash as Record<string, unknown> | undefined;
    for (const key of REQUIRED_TRASH_KEYS) {
      expect(
        trash,
        `${code}.plcDashboard.trash.${key} is missing`
      ).toHaveProperty(key);
    }
    const type = trash?.type as Record<string, unknown> | undefined;
    for (const key of REQUIRED_TRASH_TYPE_KEYS) {
      expect(
        type,
        `${code}.plcDashboard.trash.type.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.presence keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const presence = plc?.presence as Record<string, unknown> | undefined;
    for (const key of REQUIRED_PRESENCE_KEYS) {
      expect(
        presence,
        `${code}.plcDashboard.presence.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.activity keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const activity = plc?.activity as Record<string, unknown> | undefined;
    for (const key of REQUIRED_ACTIVITY_KEYS) {
      expect(
        activity,
        `${code}.plcDashboard.activity.${key} is missing`
      ).toHaveProperty(key);
    }
    const event = activity?.event as Record<string, unknown> | undefined;
    for (const key of REQUIRED_ACTIVITY_EVENT_KEYS) {
      expect(
        event,
        `${code}.plcDashboard.activity.event.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.members keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const members = plc?.members as Record<string, unknown> | undefined;
    for (const key of REQUIRED_MEMBERS_KEYS) {
      expect(
        members,
        `${code}.plcDashboard.members.${key} is missing`
      ).toHaveProperty(key);
    }
  });

  it(`${code}: has all required plcDashboard.members.roles keys`, () => {
    const plc = (locale as Record<string, unknown>).plcDashboard as
      | Record<string, unknown>
      | undefined;
    const members = plc?.members as Record<string, unknown> | undefined;
    const roles = members?.roles as Record<string, unknown> | undefined;
    for (const key of REQUIRED_MEMBERS_ROLES_KEYS) {
      expect(
        roles,
        `${code}.plcDashboard.members.roles.${key} is missing`
      ).toHaveProperty(key);
    }
  });
});
