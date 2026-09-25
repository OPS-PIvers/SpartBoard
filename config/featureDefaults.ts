// Registry of every global feature: runtime defaults plus its admin row (docs/plans/ADMIN_ACCESS_PAGES.md D5).
import type React from 'react';
import {
  BarChart,
  Building2,
  CalendarClock,
  Cast,
  Clapperboard,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  FileUp,
  Flag,
  Footprints,
  Languages,
  LayoutDashboard,
  Library,
  Link2,
  ListChecks,
  Maximize2,
  Mic,
  MousePointerClick,
  Music2,
  PanelLeftClose,
  PanelRight,
  Printer,
  Send,
  Share2,
  Smartphone,
  StickyNote,
  Target,
  TextCursorInput,
  Timer,
  UserCheck,
  UserSearch,
  UsersRound,
  Video,
  Volume2,
  Wand2,
  Zap,
} from 'lucide-react';
import type {
  AccessLevel,
  GlobalFeature,
  InternalToolType,
  UserTier,
  WidgetType,
} from '@/types';

export type FeatureStage = 'preview' | 'permanent';
export type FeatureCategory = 'ai' | 'sharing' | 'integrations' | 'students';

export const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  ai: 'AI',
  sharing: 'Sharing & sessions',
  integrations: 'Integrations',
  students: 'Students',
};

export interface FeatureDefault {
  /** Row name on the admin Access pages. */
  label: string;
  icon: React.ElementType;
  /** One short line under the name. */
  description: string;
  /** `preview` rows live on the Previews tab until Paul opens them. */
  stage: FeatureStage;
  /** What happens once it is public: delete the gate, or keep it as a switch. */
  afterLaunch: 'retire' | 'keep';
  /** Owning widget: once permanent, the switch sits on that widget's card. */
  widget?: WidgetType;
  /** Section on the Features tab; required for permanent rows with no widget or home. */
  category?: FeatureCategory;
  /** Controlled somewhere other than Features or Previews. */
  home?: 'organization' | 'dock-tool';
  /** Access level used by the admin UI when no permission doc exists yet. */
  defaultAccessLevel: AccessLevel;
  /** Enabled value used by the admin UI when no permission doc exists yet. */
  defaultEnabled: boolean;
  /**
   * When TRUE, `canAccessFeature(...)` returns true when no permission
   * doc exists (default-public — the historical baseline). When FALSE,
   * returns false (default-off).
   *
   * Use FALSE for features that depend on external configuration
   * (OAuth secrets, redirect URIs, API keys) and would surface a
   * broken UX if the code defaulted to enabled without an explicit
   * admin opt-in. `personal-spotify` is the current example: shipping
   * the code is not the same as shipping the OAuth setup.
   */
  missingDocPublic: boolean;
  /**
   * Default minimum tier applied by `canAccessFeature(...)` when NO permission
   * doc exists (docs/wide-distro-plan.md Phase 3). This is the in-code default
   * for the wide-distribution Google-API gate: an external/free-tier user is
   * denied while org + internal pass, without needing a hand-authored admin
   * doc. Undefined ⇒ no tier floor (the historical baseline; every feature
   * written before the tier model behaves exactly as before).
   *
   * Note: this default ONLY applies to the missing-doc path. Once an admin
   * persists a `global_permissions/{featureId}` doc, that doc's own `minTier`
   * field (which may be unset) is authoritative — the admin can loosen or
   * tighten it, and an explicitly-unset `minTier` on a real doc means "no
   * floor", matching the pre-tier back-compat contract.
   *
   * Admins always bypass tier checks (same as accessLevel), so this never
   * affects an admin's own access.
   */
  defaultMinTier?: UserTier;
  /** Deny admins too while no doc exists: setup or privacy must be confirmed first. */
  failClosedForAdmins?: boolean;
}

/**
 * Required defaults for every global feature.
 *
 * The `Record<GlobalFeature, FeatureDefault>` (NOT `Partial`) is
 * load-bearing: TypeScript will reject any new `GlobalFeature` union
 * member that doesn't declare its defaults here. Keep this honest —
 * don't add features to the union without adding a corresponding
 * entry, even if the entry is just the "all public, all on" baseline.
 *
 * Note on `share-link-tracking`: `canAccessFeature('share-link-tracking')`
 * returns the usual default-public behavior. `canSeeShareTracking()`
 * is a separate gate that diverges to admin-only — see
 * `AuthContextValue.ts` for why the divergence is intentional. This
 * table covers the `canAccessFeature` path only.
 */
export const FEATURE_DEFAULTS: Record<GlobalFeature, FeatureDefault> = {
  'live-session': {
    label: 'Live Sessions',
    icon: Cast,
    description: 'Host live sessions.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'gemini-functions': {
    label: 'Gemini AI Functions',
    icon: Zap,
    description: 'Mini-app and poll generation.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'ai',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'dashboard-sharing': {
    label: 'Board Sharing',
    icon: Share2,
    description: 'Share a board by link.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'dashboard-import': {
    label: 'Board Importing',
    icon: Download,
    description: 'Import a shared board.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'magic-layout': {
    label: 'Magic Layout',
    icon: Wand2,
    description: 'AI arranges the widgets on a board.',
    stage: 'permanent',
    afterLaunch: 'keep',
    home: 'dock-tool',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'smart-paste': {
    label: 'Smart Paste',
    icon: ClipboardCheck,
    description: 'Paste to create widgets.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'ai',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'smart-poll': {
    label: 'Smart Polls',
    icon: BarChart,
    description: 'AI writes poll questions.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'poll',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'screen-recording': {
    label: 'Screen recording',
    icon: Video,
    description: 'Record the screen from the Dock.',
    stage: 'permanent',
    afterLaunch: 'keep',
    home: 'dock-tool',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'remote-control': {
    label: 'Remote Control',
    icon: Smartphone,
    description: 'Control a board from a phone.',
    stage: 'permanent',
    afterLaunch: 'keep',
    home: 'dock-tool',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'embed-mini-app': {
    label: 'Embed: Generate Mini App',
    icon: Wand2,
    description: 'Turns an embed into a mini app.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'embed',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'video-activity-audio-transcription': {
    label: 'Video Activity Audio Transcription',
    icon: Wand2,
    description: 'Quizzes from videos without captions.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'video-activity',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  // Google-API-backed (attaches Google Drive files as AI context). Default
  // tier floor of `org` denies external/free-tier users — they have only the
  // basic OAuth scopes and no Drive integration — while org + internal pass
  // (docs/wide-distro-plan.md Phase 3: free tier "excludes all Google-API
  // features"). The `useFeaturePermission`-gated affordances hide cleanly.
  'ai-file-context': {
    label: 'AI File Context (Drive)',
    icon: FileUp,
    description: 'Attach Drive files to AI prompts.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'ai',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
    defaultMinTier: 'org',
  },
  'org-admin-writes': {
    label: 'Organization admin edits',
    icon: Building2,
    description: 'Lets organization admins save changes.',
    stage: 'permanent',
    afterLaunch: 'keep',
    home: 'organization',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'assignment-modes': {
    label: 'Assignment Modes',
    icon: ClipboardCheck,
    description: 'Submissions or view only, per widget.',
    stage: 'permanent',
    afterLaunch: 'keep',
    home: 'organization',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'share-link-tracking': {
    label: 'Share-link View Tracking',
    icon: Eye,
    description: 'Shows view counts on share cards.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'personal-spotify': {
    label: 'Personal Spotify',
    icon: Music2,
    description: 'Personal Spotify in the Music widget.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'music',
    defaultAccessLevel: 'public',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
  },
  // Google-API-backed (assign quizzes/video activities to Google Classroom +
  // push grades). Default-public keeps the historical missing-doc convention
  // for the accessLevel, but a default tier floor of `org` denies
  // external/free-tier users (basic scopes only) while org + internal pass
  // (docs/wide-distro-plan.md Phase 3: free tier "excludes all Google-API
  // features"). An admin can still tighten to `internal` via a persisted doc;
  // that doc's own `minTier` then takes over. The `canAccessFeature
  // ('google-classroom')`-gated affordances (VideoActivity assign + results,
  // quiz Classroom push) hide cleanly.
  'google-classroom': {
    label: 'Google Classroom integration',
    icon: Send,
    description: 'Assign to Google Classroom and sync grades.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'integrations',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
    defaultMinTier: 'org',
  },
  // Default-public preserves today's behavior: every teacher keeps the
  // no-sign-in (anonymous) join link until an admin creates a restricting
  // doc (docs/wide-distro-plan.md Phase 3b). Gates the TEACHER's ability to
  // offer the link, not the participant join experience.
  'anonymous-join': {
    label: 'Anonymous join links (no sign-in)',
    icon: Link2,
    description: 'No-sign-in join links for activities.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  // Student audio responses. Fail-closed on purpose: no permission record
  // means denied, matching `isQuizMediaResponseGranted` in
  // `functions/src/quizMediaArchive.ts`. Read it through
  // `canAccessQuizMediaResponse`, never `canAccessFeature`.
  'quiz-media-response': {
    label: 'Spoken quiz responses (audio)',
    icon: Mic,
    description: "Spoken-answer questions, saved to the teacher's Drive.",
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
  },
  // Alpha rollout of the redesigned widget settings UI (wave 1b). Default-off
  // and admin-only until the drawer is verified across all widget types.
  'settings-drawer': {
    label: 'Widget Settings Drawer (alpha)',
    icon: PanelRight,
    description: 'Side-drawer widget settings.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz read-aloud (Cloud TTS). Admin-only while the player ships in
  // stacked PRs; every teacher-side affordance hides until it is opened up.
  'quiz-read-aloud': {
    label: 'Quiz read-aloud (text-to-speech)',
    icon: Volume2,
    description: 'Reads quiz questions aloud to signed-in students.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz translation for multilingual learners. Admin-only while the Languages
  // tab ships in stacked PRs; fail-closed so a missing doc grants nobody.
  'quiz-translation': {
    label: 'Quiz translation (multilingual learners)',
    icon: Languages,
    description: 'AI quiz translations for multilingual learners.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // "Draft with AI" in the question-bank editor; also requires gemini-functions.
  'question-bank-ai': {
    label: 'Question bank AI drafting',
    icon: Library,
    description:
      'Draft question-bank items with AI. Needs Gemini AI Functions.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // AI reading of an imported test document; also requires quiz-document-import
  // and gemini-functions. Fail-closed, so nobody gets it until it is saved.
  'quiz-document-ai-reader': {
    label: 'AI reader for quiz document import',
    icon: FileText,
    description: 'Reads imported tests with AI. Needs quiz document import.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Suggested learning targets in the test-import review. Admin-only until Paul has imported with it.
  'quiz-import-suggested-targets': {
    label: 'Suggested learning targets on quiz import',
    icon: Target,
    description: 'Suggests learning targets found in imported tests.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Print/scan paper answer sheets. Admin-only until opened up; the district
  // switch (admin_settings/paper_answer_sheets) must also be on.
  'paper-answer-sheets': {
    label: 'Paper answer sheets (Scantron replacement)',
    icon: Printer,
    description: 'Print bubble sheets and import scans.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Saved class groups inside board widgets. Admin-only until the projector
  // privacy check passes; the district switch
  // (admin_settings/roster_groups_integration) must also be on.
  'roster-groups': {
    label: 'Class groups in widgets',
    icon: UsersRound,
    description: 'Target a class group from a widget.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Import a quiz from a PDF, Word file or Google Doc. Admin-only while the
  // readers ship in stacked PRs; the district switch
  // (admin_settings/quiz_document_import) must also be on.
  'quiz-document-import': {
    label: 'Build a quiz from a test document',
    icon: FileText,
    description: 'Build a quiz from an uploaded test.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Share a board or a collection with a substitute, and the manager for live
  // shares. Admin-only until Paul has run a day's cover on it in prod.
  'sub-share-collections': {
    label: 'Share a board or a collection with a sub',
    icon: UserCheck,
    description: 'Share boards or collections with a sub.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning player v2. Admin-only until Paul has played a set end to end on dev.
  'gl-player-v2': {
    label: 'Guided Learning: calmer player',
    icon: MousePointerClick,
    description: 'Calmer Guided Learning playback.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Tab-away clock and exit log. Admin-only until Paul has tested it in prod.
  'tab-away-timer': {
    label: 'Tab-away timer',
    icon: Timer,
    description: 'Shows how long a student was away.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning live tours that walk a teacher through the real app. Admin-only until opened up.
  'gl-live-tours': {
    label: 'Guided Learning live tours',
    icon: Footprints,
    description: "Walkthroughs on the teacher's own board.",
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning Studio editor. Admin-only until Paul has built sets with it in prod.
  'gl-studio': {
    label: 'Guided Learning Studio editor',
    icon: Clapperboard,
    description: 'Full-screen Guided Learning editor.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Per-period start/pause on shared assignments. Admin-only until Paul has run a class on it.
  'per-period-access': {
    label: 'Start and pause each class period',
    icon: CalendarClock,
    description: 'Open and pause each class period.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Printable quiz results for handing back. Admin-only until Paul has printed a class set.
  'quiz-results-print': {
    label: 'Quiz results printing',
    icon: Printer,
    description: 'Print a results copy per student.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // PLC Home v2 tile dashboard. Admin-only until Paul has run a PLC on it in prod.
  'plc-home-v2': {
    label: 'PLC Home dashboard',
    icon: LayoutDashboard,
    description: 'Tile-based PLC Home.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // PLC norming flags: anonymized answer copies on the PLC page. Admin-only until Paul has tried it.
  'plc-norming-flags': {
    label: 'PLC norming flags',
    icon: Flag,
    description: 'Flag answers for PLC norming.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Choose-all-that-apply quiz questions. Admin-only until Paul has run one with a class.
  'quiz-choose-all': {
    label: 'Choose-all-that-apply quiz questions',
    icon: ListChecks,
    description: 'Choose-all-that-apply questions.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // One-list multiple choice editor, choose-all as a setting on it. Admin-only until Paul has tried it.
  'quiz-choice-editor': {
    label: 'One-list multiple choice editor',
    icon: ListChecks,
    description: 'Mark the correct option in one list.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz sections with "answer any N of M" in the editor. Admin-only until Paul has tried it.
  'quiz-sections': {
    label: 'Quiz sections',
    icon: ListChecks,
    description: 'Section headings, and "answer any N of these".',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Alternate accepted answers on fill-in-the-blank quiz questions. Admin-only until Paul has tried it.
  'quiz-fib-alternates': {
    label: 'Other accepted answers for fill in the blank',
    icon: TextCursorInput,
    description: 'Alternate accepted answers.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Full-screen toggle on large pop-ups. Admin-only until Paul has tried it on a Chromebook.
  'modal-fullscreen': {
    label: 'Full screen for large pop-ups',
    icon: Maximize2,
    description: 'Full-screen button on large pop-ups.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz results teacher tools. Admin-only until Paul has used them on a real class.
  'quiz-results-tools': {
    label: 'Quiz results teacher tools',
    icon: UserSearch,
    description: 'Extra quiz results tools.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Free-response grader layout pass from the teacher feedback session. Admin-only until Paul has graded with it.
  'quiz-grader-v2': {
    label: 'Tidier free-response grader',
    icon: PanelLeftClose,
    description: 'Collapsible student list in the grader.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Studio callout handles, toolbar and styling. Admin-only until Paul has edited sets with it in prod.
  'gl-callout-editing': {
    label: 'Guided Learning callout editing',
    icon: MousePointerClick,
    description: 'Resize and restyle Studio callouts.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Rich text PLC notes editor. Admin-only until Paul has run a PLC meeting on it in prod.
  'plc-notes-rich-editor': {
    label: 'PLC notes rich text editor',
    icon: StickyNote,
    description: 'Formatting toolbar in PLC notes.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Handwritten answer boxes on paper sheets; AND-ed with the paper-answer-sheets gate.
  'paper-handwritten-responses': {
    label: 'Handwritten answers on paper sheets',
    icon: TextCursorInput,
    description:
      'Written answer boxes on paper sheets, transcribed for grading.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
};

/** Retired global ids the Dock reads until a Widgets-page doc exists (plan D3). */
export const LEGACY_TOOL_FEATURES: Record<InternalToolType, GlobalFeature> = {
  record: 'screen-recording',
  magic: 'magic-layout',
  remote: 'remote-control',
};

/** Preview flags that admins get before any doc is saved (plan D7). */
export const isAdminPreviewFeature = (featureId: GlobalFeature): boolean => {
  const def = FEATURE_DEFAULTS[featureId];
  return (
    def.stage === 'preview' && !def.missingDocPublic && !def.failClosedForAdmins
  );
};

export const ALL_GLOBAL_FEATURES = Object.keys(
  FEATURE_DEFAULTS
) as GlobalFeature[];

/**
 * In-code default minimum tier per widget, applied by `canAccessWidget(...)`
 * when NO `feature_permissions/{widgetType}` doc exists yet
 * (docs/wide-distro-plan.md Phase 3).
 *
 * Mirrors `FeatureDefault.defaultMinTier` but for the widget gate: a
 * Google-API-backed widget defaults to `'org'` so external/free-tier users
 * (basic OAuth scopes, no Google integration) are denied while org + internal
 * pass — without an admin needing to hand-author a permission doc. The Dock /
 * widget library already hide widgets where `canAccessWidget` is false, so the
 * affordance disappears cleanly rather than erroring.
 *
 * Only widgets that actually need a tier floor are listed; an absent entry
 * means "no floor" (the historical public-by-default behavior for widgets with
 * no permission doc). Once an admin persists a `feature_permissions/{widgetType}`
 * doc, that doc's own `minTier` is authoritative and this default no longer
 * applies (matching the doc-wins precedence of the feature path).
 *
 *   - `calendar` (label "Events") renders Google Calendar events via
 *     `GoogleCalendarService` — a Google-API surface, so org-and-up only.
 */
export const WIDGET_DEFAULT_MIN_TIER: Partial<Record<WidgetType, UserTier>> = {
  calendar: 'org',
};

/**
 * Missing-document access defaults for widget rollouts that must fail closed.
 * All unlisted widgets retain the historical public default.
 */
export const WIDGET_DEFAULT_ACCESS_LEVEL: Partial<
  Record<WidgetType, AccessLevel>
> = {
  flashcards: 'admin',
  // D46 — off the teacher dock until an admin opens it.
  projects: 'admin',
};

export const getWidgetDefaultAccessLevel = (
  widgetType: WidgetType | InternalToolType
): AccessLevel =>
  WIDGET_DEFAULT_ACCESS_LEVEL[widgetType as WidgetType] ?? 'public';
