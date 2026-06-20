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
  'assessments',
  'notes',
  'todos',
  'sharedBoards',
  'settings',
  'home',
  'members',
  'sharedData',
  'meeting',
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
  // Wave-4 (T10): viewer read-only empty state.
  'pickToRead',
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

/** Keys within plcDashboard.settings.digest (Wave-4 opt-in weekly digest, Decision 2.3) */
const REQUIRED_SETTINGS_DIGEST_KEYS = [
  'heading',
  'description',
  'title',
  'optInDescription',
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

/**
 * Keys within plcDashboard.meeting (Wave-3 Meeting Mode — PRD §6.2, the hero
 * surface: PlcMeetingMode / PlcMeetingSteps / PlcMeetingReviewCard /
 * PlcMeetingRecordView). Flat leaf keys + nested step blocks below.
 */
const REQUIRED_MEETING_KEYS = [
  'loading',
  'loadError',
  'createFailed',
  'saved',
  'saveFailed',
  'pickRequired',
  'untitledAssessment',
  'untitledQuestion',
  'common',
  'you',
  'teamAverage',
  'teacherStudentCount',
  'classCount',
  'weakestQuestions',
  'byClass',
  'whoRanIt',
  'ranOf',
  'hasRun',
  'notRun',
  'noQuestions',
  'strongAcross',
  'updating',
  'updatingHint',
  'reviewCardLabel',
  'discussAssessment',
  'discussQuestion',
  'designatePrompt',
  'designatePromptTitle',
  'designatePlaceholder',
  'designated',
  'designateFailed',
  'back',
  'next',
  'saveMeeting',
  'stepsLabel',
  'pastMeetings',
  'startOver',
  'startOverTitle',
  'startOverConfirm',
] as const;

/** plcDashboard.meeting.steps — one label per guided step. */
const REQUIRED_MEETING_STEPS_KEYS = [
  'pick',
  'review',
  'decide',
  'act',
  'save',
] as const;

/** plcDashboard.meeting.pick */
const REQUIRED_MEETING_PICK_KEYS = [
  'heading',
  'subtitle',
  'emptyTitle',
  'emptySubtitle',
  'cardMeta',
  'designate',
] as const;

/** plcDashboard.meeting.review */
const REQUIRED_MEETING_REVIEW_KEYS = ['heading', 'subtitle', 'none'] as const;

/** plcDashboard.meeting.decide */
const REQUIRED_MEETING_DECIDE_KEYS = [
  'heading',
  'subtitle',
  'addLabel',
  'placeholder',
  'add',
  'empty',
  'remove',
  'linkedFallback',
  'linkedQuestion',
] as const;

/** plcDashboard.meeting.act */
const REQUIRED_MEETING_ACT_KEYS = [
  'heading',
  'subtitle',
  'addLabel',
  'placeholder',
  'assignee',
  'unassigned',
  'someone',
  'due',
  'add',
  'empty',
  'remove',
  'todoCreated',
] as const;

/** plcDashboard.meeting.save */
const REQUIRED_MEETING_SAVE_KEYS = [
  'heading',
  'subtitle',
  'reviewed',
  'decisions',
  'actions',
  'attendees',
  'whoAttended',
  'noAttendees',
  'viewerNote',
  'doneTitle',
  'doneSubtitle',
  'viewRecord',
  'startNew',
] as const;

/** plcDashboard.meeting.export */
const REQUIRED_MEETING_EXPORT_KEYS = [
  'toSheet',
  'toPdf',
  'open',
  'sheetDone',
  'pdfDone',
  'noGoogle',
  'notReady',
  'failed',
] as const;

/** plcDashboard.meeting.record */
const REQUIRED_MEETING_RECORD_KEYS = [
  'title',
  'facilitatedBy',
  'backToLive',
  'notFound',
  'notFoundBody',
  'agenda',
  'attendees',
  'noAttendees',
  'reviewed',
  'noReviewed',
  'noData',
  'decisions',
  'noDecisions',
  'actions',
  'noActions',
  'notes',
] as const;

/**
 * Keys within plcDashboard.sharedData (Wave-3 anonymized aggregate cards —
 * PlcSharedDataBody / PlcSharedDataFilters, PRD §3.6 / §6.0).
 */
const REQUIRED_SHARED_DATA_KEYS = [
  'loading',
  'loadError',
  'emptyTitle',
  'emptySubtitle',
  'noResults',
  'untitledQuiz',
  'untitledQuestion',
  'kindQuiz',
  'kindVA',
  'common',
  'avg',
  'teacher',
  'teachers',
  'students',
  'studentsShort',
  'classCount',
  'ranOf',
  'teamAverage',
  'weakestQuestions',
  'byClass',
  'you',
  'whoRanIt',
  'hasRun',
  'notRun',
  'updating',
  'updatingHint',
  'designateTitle',
  'designateSubtitle',
  'designateAction',
  'designatePrompt',
  'designatePromptTitle',
  'designatePlaceholder',
  'designated',
  'designateFailed',
] as const;

/** plcDashboard.sharedData.status — common-assessment lifecycle enum. */
const REQUIRED_SHARED_DATA_STATUS_KEYS = [
  'planning',
  'active',
  'reviewing',
  'closed',
] as const;

/** plcDashboard.sharedData.filters */
const REQUIRED_SHARED_DATA_FILTERS_KEYS = [
  'label',
  'search',
  'searchPlaceholder',
  'type',
  'typeAll',
  'typeQuiz',
  'typeVA',
  'teacher',
  'teacherAll',
  'unit',
  'unitAll',
  'status',
  'statusAll',
] as const;

/**
 * Keys within plcDashboard.home (Wave-3 activity-driven Home — PRD §6.3:
 * common-assessment status banner, your-action-items card, QuickCreate bar).
 */
const REQUIRED_HOME_COMMON_ASSESSMENT_KEYS = [
  'loading',
  'emptyTitle',
  'emptySubtitle',
  'reviewData',
  'ranIt',
  'startMeeting',
  'resumeMeeting',
] as const;

/** plcDashboard.home.commonAssessment.phase — common-assessment phase labels. */
const REQUIRED_HOME_COMMON_ASSESSMENT_PHASE_KEYS = [
  'planning',
  'running',
  'ready',
  'reviewing',
  'closed',
] as const;

/** plcDashboard.home.actionItems */
const REQUIRED_HOME_ACTION_ITEMS_KEYS = [
  'heading',
  'empty',
  'emptySubtitle',
  'loadError',
  'toggleFailed',
  'markDone',
  'openAll',
] as const;

/** plcDashboard.home.quickCreate */
const REQUIRED_HOME_QUICK_CREATE_KEYS = ['quiz', 'video', 'doc'] as const;

/** plcDashboard.home.quickCreate.docModal */
const REQUIRED_HOME_QUICK_CREATE_DOC_MODAL_KEYS = [
  'title',
  'subtitle',
  'titleLabel',
  'urlLabel',
  'add',
  'adding',
  'created',
  'failed',
] as const;

/**
 * Keys within plcDashboard.newAssignment — the QuickCreate (Wave-3) buttons'
 * disabled-reason copy (Drive not connected / empty personal library).
 */
const REQUIRED_NEW_ASSIGNMENT_QUIZ_KEYS = [
  'ctaDisabledDrive',
  'ctaDisabledEmpty',
] as const;
const REQUIRED_NEW_ASSIGNMENT_VIDEO_KEYS = [
  'ctaDisabledDrive',
  'ctaDisabledEmpty',
] as const;

/**
 * Keys within plcDashboard.versions (Wave-4 T3 version-history + restore panel
 * — PlcVersionHistoryPanel, PRD §5.1 / §3.10, Decision 5.1).
 */
const REQUIRED_VERSIONS_KEYS = [
  'open',
  'openAriaLabel',
  'title',
  'ariaLabel',
  'close',
  'intro',
  'loading',
  'loadError',
  'retry',
  'emptyTitle',
  'emptySubtitle',
  'versionShort',
  'versionLabel',
  'savedByAt',
  'unknownAuthor',
  'restoreAction',
  'restoreAriaLabel',
  'restored',
  'restoreFailed',
  'conflict',
] as const;

const REQUIRED_SYNC_KEYS = [
  'autoPulled',
  'autoPullFailed',
  'conflictTitle',
  'conflictBody',
  'keepMine',
  'pullTheirs',
  'keptMine',
  'pulledTheirs',
  'resolveFailed',
] as const;

/**
 * Keys within plcDashboard.search (Wave-4 T9 per-PLC search box — PlcSearchBox,
 * PRD §6.4 / Decision 4.3). Pluralized leaves are tested by their `_one` / `_other`
 * suffixed JSON keys.
 */
const REQUIRED_SEARCH_KEYS = [
  'ariaLabel',
  'placeholder',
  'clear',
  'searching',
  'resultsLabel',
  'resultCount_one',
  'resultCount_other',
  'noResults',
  'untitled',
  'groupAssessments',
  'groupData',
  'groupDocs',
  'groupBoards',
] as const;

/**
 * Keys within plcDashboard.viewer (Wave-4 T10 viewer read-only UI gate —
 * Decision 3.2). The calm "Viewer — read only" affordance shown where content
 * create/edit/delete affordances would otherwise render.
 */
const REQUIRED_VIEWER_KEYS = [
  'badge',
  'badgeTooltip',
  'readOnly',
  'assessmentsNote',
  'notesNote',
  'todosNote',
  'meetingNote',
  'homeNote',
] as const;

type LocaleFile = typeof en;

/** Walk a dotted path through a locale object, returning the leaf node. */
function getNode(
  root: unknown,
  path: string
): Record<string, unknown> | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node != null && typeof node === 'object'
    ? (node as Record<string, unknown>)
    : undefined;
}

/** (path, requiredKeys) pairs shared by the EN baseline + DE/ES/FR parity. */
const WAVE3_KEY_GROUPS: ReadonlyArray<{
  path: string;
  keys: readonly string[];
}> = [
  { path: 'plcDashboard.meeting', keys: REQUIRED_MEETING_KEYS },
  { path: 'plcDashboard.meeting.steps', keys: REQUIRED_MEETING_STEPS_KEYS },
  { path: 'plcDashboard.meeting.pick', keys: REQUIRED_MEETING_PICK_KEYS },
  { path: 'plcDashboard.meeting.review', keys: REQUIRED_MEETING_REVIEW_KEYS },
  { path: 'plcDashboard.meeting.decide', keys: REQUIRED_MEETING_DECIDE_KEYS },
  { path: 'plcDashboard.meeting.act', keys: REQUIRED_MEETING_ACT_KEYS },
  { path: 'plcDashboard.meeting.save', keys: REQUIRED_MEETING_SAVE_KEYS },
  { path: 'plcDashboard.meeting.export', keys: REQUIRED_MEETING_EXPORT_KEYS },
  { path: 'plcDashboard.meeting.record', keys: REQUIRED_MEETING_RECORD_KEYS },
  { path: 'plcDashboard.sharedData', keys: REQUIRED_SHARED_DATA_KEYS },
  {
    path: 'plcDashboard.sharedData.status',
    keys: REQUIRED_SHARED_DATA_STATUS_KEYS,
  },
  {
    path: 'plcDashboard.sharedData.filters',
    keys: REQUIRED_SHARED_DATA_FILTERS_KEYS,
  },
  {
    path: 'plcDashboard.home.commonAssessment',
    keys: REQUIRED_HOME_COMMON_ASSESSMENT_KEYS,
  },
  {
    path: 'plcDashboard.home.commonAssessment.phase',
    keys: REQUIRED_HOME_COMMON_ASSESSMENT_PHASE_KEYS,
  },
  {
    path: 'plcDashboard.home.actionItems',
    keys: REQUIRED_HOME_ACTION_ITEMS_KEYS,
  },
  {
    path: 'plcDashboard.home.quickCreate',
    keys: REQUIRED_HOME_QUICK_CREATE_KEYS,
  },
  {
    path: 'plcDashboard.home.quickCreate.docModal',
    keys: REQUIRED_HOME_QUICK_CREATE_DOC_MODAL_KEYS,
  },
  {
    path: 'plcDashboard.newAssignment.quiz',
    keys: REQUIRED_NEW_ASSIGNMENT_QUIZ_KEYS,
  },
  {
    path: 'plcDashboard.newAssignment.video',
    keys: REQUIRED_NEW_ASSIGNMENT_VIDEO_KEYS,
  },
  { path: 'plcDashboard.versions', keys: REQUIRED_VERSIONS_KEYS },
  { path: 'plcDashboard.sync', keys: REQUIRED_SYNC_KEYS },
  { path: 'plcDashboard.search', keys: REQUIRED_SEARCH_KEYS },
  { path: 'plcDashboard.viewer', keys: REQUIRED_VIEWER_KEYS },
  {
    path: 'plcDashboard.settings.digest',
    keys: REQUIRED_SETTINGS_DIGEST_KEYS,
  },
];

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

  it.each(WAVE3_KEY_GROUPS)(
    'has all required $path keys (Wave-3)',
    ({ path, keys }) => {
      const node = getNode(en, path);
      for (const key of keys) {
        expect(node, `en.${path}.${key} is missing from EN`).toHaveProperty(
          key
        );
      }
    }
  );
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

  it.each(WAVE3_KEY_GROUPS)(
    `${code}: has all required $path keys (Wave-3)`,
    ({ path, keys }) => {
      const node = getNode(locale, path);
      for (const key of keys) {
        expect(node, `${code}.${path}.${key} is missing`).toHaveProperty(key);
      }
    }
  );
});
