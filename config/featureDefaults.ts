// Registry of every global feature: runtime defaults plus its admin row (docs/plans/shipped/ADMIN_ACCESS_PAGES.md D5).
import type React from 'react';
import {
  CalendarRange,
  FolderSync,
  PenLine,
  BarChart,
  BellRing,
  Bot,
  Building2,
  CalendarClock,
  Cast,
  ClipboardCheck,
  Download,
  Eye,
  History,
  SpellCheck,
  FileText,
  FileUp,
  Gauge,
  Globe,
  Home,
  ArrowLeft,
  GraduationCap,
  Flag,
  Footprints,
  Languages,
  Layers,
  LayoutDashboard,
  Library,
  Link2,
  ListChecks,
  ListOrdered,
  Mic,
  Music2,
  Printer,
  RefreshCw,
  Route,
  Send,
  Share2,
  Smartphone,
  Smile,
  Sparkles,
  StickyNote,
  Table2,
  Target,
  TextCursorInput,
  Timer,
  UserSearch,
  UsersRound,
  Video,
  Volume2,
  Wand2,
  Zap,
  BookMarked,
  Quote,
  Calculator,
  Utensils,
} from 'lucide-react';
import type {
  AccessLevel,
  GlobalFeature,
  InternalToolType,
  UserTier,
  WidgetType,
} from '@/types';

export type FeatureStage = 'preview' | 'permanent';
export type FeatureCategory =
  'ai' | 'sharing' | 'integrations' | 'students' | 'groups' | 'look';

export const FEATURE_CATEGORY_LABELS: Record<FeatureCategory, string> = {
  ai: 'AI',
  sharing: 'Sharing & sessions',
  integrations: 'Integrations',
  students: 'Students',
  groups: 'Teams',
  look: 'Look & feel',
};

/** Sections of a widget's admin config modal that graduated switches sort into. */
export type FeatureGroup = 'building' | 'questions' | 'assigning' | 'languages';

export const FEATURE_GROUP_LABELS: Record<FeatureGroup, string> = {
  building: 'Building quizzes',
  questions: 'Questions & answers',
  assigning: 'Assigning',
  languages: 'Languages',
};

export interface FeatureDefault {
  /** Row name on the admin Access pages. */
  label: string;
  /** Shorter name inside the owning widget's config modal, which already names the widget. */
  modalLabel?: string;
  /** Section inside the owning widget's config modal. */
  group?: FeatureGroup;
  /** Add-on that only works with this feature; nests under it in the config modal. */
  requires?: GlobalFeature;
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
    modalLabel: 'Spoken answers',
    group: 'questions',
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
  },
  // Student whiteboard responses (QUIZ_WHITEBOARD_RESPONSE D22). Fail-closed like
  // spoken answers; read it through `canAccessQuizWhiteboardResponse`.
  'quiz-whiteboard-response': {
    label: 'Whiteboard quiz responses',
    icon: PenLine,
    description: "Draw-and-explain answers, saved to the teacher's Drive.",
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Whiteboard answers',
    group: 'questions',
    requires: 'quiz-media-response',
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
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
    modalLabel: 'Read aloud',
    group: 'languages',
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
    modalLabel: 'Translation',
    group: 'languages',
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
    modalLabel: 'Question bank AI drafting',
    group: 'building',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Bulk-import every question bank in a Schoology .imscc export. Admin-only until Paul has run it.
  'question-bank-imscc-import': {
    label: 'Import question banks from Schoology',
    icon: FileUp,
    description:
      'Import every question bank in a Schoology export (.imscc) at once.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Import question banks from Schoology',
    group: 'building',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-imscc-import': {
    label: 'Import quizzes from Schoology',
    icon: FileUp,
    description: 'Import every quiz in a Schoology export (.imscc) at once.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Import quizzes from Schoology',
    group: 'building',
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
    modalLabel: 'AI reader',
    group: 'building',
    requires: 'quiz-document-import',
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
  // Multi-version test import (QUIZ_IMPORT_VERSIONS V26). Admin-only until Paul has imported with it.
  'quiz-import-versions': {
    label: 'Multi-version test import',
    icon: Layers,
    description:
      'Splits a test with several versions into a bank, rubrics and quizzes.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Version split without AI (F24). Admin-only until Paul has imported with it.
  'quiz-import-versions-plain': {
    label: 'Split versions without AI',
    icon: Layers,
    description: 'Splits a typed PDF with version headings without using AI.',
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
    modalLabel: 'Paper answer sheets',
    group: 'questions',
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
    modalLabel: 'Build from a test document',
    group: 'building',
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
  // Quote from passages in written answers. Admin-only until Paul has tested it in prod.
  'quiz-stimulus-quotes': {
    label: 'Quote from passages',
    icon: Quote,
    description:
      'Students add selected passage or PDF text to a written answer as a quote.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Desmos calculator stimulus on quiz questions. Admin-only until Paul has tested it in prod.
  'quiz-calculator-stimulus': {
    label: 'Calculator stimulus',
    icon: Calculator,
    description: 'Teachers attach a Desmos calculator to quiz questions.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Live tour editing v2 and tour materials. Admin-only until Paul has edited tours with it in prod.
  'live-tour-editing-v2': {
    label: 'Live tour editing v2',
    icon: Footprints,
    description: 'Sandboxed tour replays, step checkpoints and tour materials.',
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
  'standards-from-question-text': {
    label: 'Standards typed in questions',
    icon: BookMarked,
    description: 'Codes in question text become Learning targets.',
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
  // Per-student slide position on GL results and the hub. Admin-only until Paul has seen it on real class data in prod.
  'gl-student-progress': {
    label: 'Guided Learning student progress',
    icon: Route,
    description: "Shows each student's slide and last activity.",
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'plc-docs-toolbar': {
    label: 'Google Docs toolbar in group docs',
    icon: StickyNote,
    description:
      "Linked Google Docs show Google's menus and formatting toolbar.",
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
  },
  // Team action items push to the assignee's Google Tasks; each person turns it on in Connected apps.
  'google-tasks-sync': {
    label: 'Google Tasks sync',
    icon: ListChecks,
    description: "Team action items appear in the assignee's Google Tasks.",
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'integrations',
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
    modalLabel: 'Handwritten answers',
    group: 'questions',
    requires: 'paper-answer-sheets',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Web tours played on other websites by the Chrome extension (CHROME_EXTENSION.md T12); will gate authoring and /tour/{setId}.
  'web-tours': {
    label: 'Web tours',
    icon: Globe,
    description:
      'Live tours on other websites, played by the SpartBoard Chrome extension.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'integrations',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Move up and Move down in each library folder's menu.
  'library-folder-reorder': {
    label: 'Reorder library folders',
    icon: ListOrdered,
    description:
      'Move up and Move down in each folder menu, in every library and PLC Assessments.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Arts & Letters Agenda: teachers pick Simple or Detailed, from the boxes admins build.
  'agenda-versions': {
    label: 'Agenda Simple and Detailed',
    icon: ListOrdered,
    description:
      'A Simple or Detailed choice in Arts & Letters Agenda settings, using the boxes admins set for each building.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // PLC teams open on Home: charts over time, the latest assessment and team tools.
  'plc-home-tab': {
    label: 'PLC Home page',
    icon: Home,
    description:
      'PLC teams open on a Home page with results over time and team tools. Data overview becomes its own tab.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Top-left back arrow on Boards & Collections, Gradebook and Admin Settings.
  'full-page-back-arrow': {
    label: 'Back arrow on full pages',
    icon: ArrowLeft,
    description:
      'Boards & Collections, Gradebook and Admin Settings close with a back arrow at the top left.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Claude connector sign-in and tools; the server checks the same gate on every request (CC-D7).
  'claude-connector': {
    label: 'Claude connector',
    icon: Bot,
    description: 'Teachers connect Claude to create and edit their library.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'integrations',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Guided Learning list, read, slide and edit tools inside the Claude connector; building sets stay admin-only.
  'claude-connector-guided-learning': {
    label: 'Claude connector: Guided Learning',
    icon: Bot,
    description: 'Claude can read and edit Guided Learning activities.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'integrations',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Teacher-paced (live) Video Activity: the Assign dialog's live option (docs/plans/shipped/VA_TEACHER_PACED.md).
  'video-activity-live': {
    label: 'Video Activity live mode',
    icon: Cast,
    description:
      'Play a video activity on the board and pause for class answers.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'video-activity',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz library "Student view": the real student player with focus-mode toggles, local-only.
  'quiz-student-view': {
    label: 'Quiz student view',
    icon: Eye,
    description: 'Teachers take a quiz exactly as students see it.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Student view',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz "Show score on submit" setting. Admin-only until Paul has used it with a class.
  'quiz-score-on-submit': {
    label: 'Quiz score on submit',
    icon: Gauge,
    description: 'Students see their score as soon as they submit.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Score on submit',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz attempt history and the Final score setting (docs/plans/QUIZ_ATTEMPT_HISTORY.md).
  'quiz-attempt-history': {
    label: 'Quiz attempt history',
    icon: History,
    description:
      'Teachers and students can look back at every quiz attempt, and teachers choose which score counts.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Per-question "Spell check" switch on Free Response questions.
  'quiz-spell-check-toggle': {
    label: 'Spell check switch in quizzes',
    icon: SpellCheck,
    description:
      'Teachers can turn off spelling and grammar underlines on a Free Response question.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Gradebook route and its data layer (docs/plans/GRADEBOOK.md D5).
  gradebook: {
    label: 'Gradebook',
    icon: Table2,
    description:
      'Every class score in one grid, with overrides, flags and analysis.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Student Grades tab in My Assignments (docs/plans/GRADEBOOK.md D38).
  'student-gradebook': {
    label: 'Student Grades tab',
    icon: GraduationCap,
    description: 'Students see their published scores in My Assignments.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'group-reminders': {
    label: 'Group reminders',
    icon: BellRing,
    description:
      'Class groups with a weekly time that pop a reminder on the board.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Quiz overall time limit per attempt. Admin-only until Paul has used it with a class.
  'quiz-time-limit': {
    label: 'Quiz time limit',
    icon: Timer,
    description: 'Set an overall time limit on a quiz assignment.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Time limit',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Rubrics hidden from students unless shown per question. Admin-only until Paul has used it.
  'quiz-rubric-visibility': {
    label: 'Rubric visibility for students',
    icon: Eye,
    description: 'Rubrics stay hidden unless a question shows them.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Scoring-guide rubrics. Admin-only until Paul has tested them in prod.
  'rubric-scoring-guides': {
    label: 'Scoring-guide rubrics',
    icon: ListChecks,
    description:
      'Rubrics with parts, scoring guidelines and example responses.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Per-widget AI switches: hide and meter each widget's AI; `gemini-functions` is the hard server gate.
  quiz: {
    label: 'Quiz: AI',
    icon: Sparkles,
    description: 'Drafts questions and converts imports with AI.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'AI drafting',
    group: 'building',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'video-activity-ai': {
    label: 'Video Activity: AI',
    icon: Sparkles,
    description: 'Writes questions from a video and suggests videos.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'video-activity',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  // Admin-only until saved; the server denies non-admins while no doc exists.
  'guided-learning-ai': {
    label: 'Guided Learning: AI',
    icon: Sparkles,
    description: 'Drafts sets and step text with AI.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'guided-learning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'mini-app-ai': {
    label: 'Mini Apps: AI',
    icon: Sparkles,
    description: 'Builds a mini app from a description.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'miniApp',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'drawing-ai': {
    label: 'Drawing: AI text recognition',
    icon: Sparkles,
    description: 'Turns handwriting on the canvas into text.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'drawing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'webcam-ai': {
    label: 'Webcam: AI text recognition',
    icon: Sparkles,
    description: 'Reads text from the camera with AI.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'webcam',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'routine-guide': {
    label: 'Routine Guide widget',
    icon: ListChecks,
    description: 'Step-by-step instructional routines on the board.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'routineGuide',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Admin-only until saved, like the per-building toggle it replaced (default off).
  'blooms-ai': {
    label: "Bloom's Taxonomy: AI",
    icon: Sparkles,
    description: 'Writes question stems for a topic.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'blooms-taxonomy',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'dashboard-layout': {
    label: 'Magic Layout: AI',
    icon: Sparkles,
    description: 'Builds a board from a description.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'ai',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'instructional-routine': {
    label: 'Instructional Routines: AI',
    icon: Sparkles,
    description: 'Drafts a routine from a description.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'instructionalRoutines',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  ocr: {
    label: 'AI text recognition',
    icon: Sparkles,
    description: 'Reads text from annotations and quiz pictures.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'ai',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  sparty: {
    label: 'Sparty',
    icon: Smile,
    description: 'Pixel Spartan mascot in tours, setup and help.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'look',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Server also requires gemini-functions and a saved doc (enforceAiFeatureAccess, missingDocAllowed: false).
  'plc-meeting-ai-notes': {
    label: 'AI meeting notes',
    icon: Sparkles,
    description: 'Transcript and draft notes from a meeting recording.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'ai',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Server also requires gemini-functions and a saved doc (enforceAiFeatureAccess, missingDocAllowed: false).
  'plc-goal-coach': {
    label: 'Goal coach',
    icon: Sparkles,
    description: 'Checks a draft team goal against the district rubric.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'groups',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'embed-reload': {
    label: 'Embed: Reload button',
    icon: RefreshCw,
    description: 'Reloads just the embedded page from its toolbar.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'embed',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // SpartBoard creates the Schoology gradebook column (SCHOOLOGY_TOOL_COLUMNS.md D11).
  'schoology-tool-columns': {
    label: 'Schoology gradebook columns',
    icon: GraduationCap,
    description:
      'Push scores to Schoology without adding the assignment there; SpartBoard makes the gradebook column.',
    stage: 'preview',
    afterLaunch: 'retire',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'widget-whats-new': {
    label: "Widget what's new",
    icon: Sparkles,
    description: "A What's new button under a widget after its look changes.",
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Inert while Mini App assignments are view-only in Organization settings.
  'mini-app-results': {
    label: 'Mini App results',
    icon: ListChecks,
    description: 'Graded mini app submissions with attempt limits.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'miniApp',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-monitor-declutter': {
    label: 'Quiz live monitor cleanup',
    icon: LayoutDashboard,
    description: 'Simpler Quiz live monitor with Close all and footer buttons.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'monitor-parity': {
    label: 'Matching assignment monitors',
    icon: LayoutDashboard,
    description:
      'One class picker and the Quiz monitor layout on every assignment.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-banks-in-library': {
    label: 'Question banks in Quiz library',
    icon: Library,
    description: 'Question banks open from the Quiz library sidebar.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-submit-for-student': {
    label: 'Submit quiz for a student',
    icon: Send,
    description: "Turn in a student's saved quiz answers.",
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Lunch Count redesign. Admin-only until Paul has used it in prod.
  'lunch-count-redesign': {
    label: 'Lunch Count redesign',
    icon: Utensils,
    description: 'Big counts, layouts for every size and clearer empty states.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'lunchCount',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'activity-wall-timeline-dates': {
    label: 'Activity Wall dated timeline',
    icon: CalendarRange,
    description: 'Posts get a real date and sit in order on a timeline.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'activity-wall',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'checklist-small-card': {
    label: 'Checklist small cards',
    icon: ListChecks,
    description:
      'An Add tasks button when empty, and a cleaner footer on small cards.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'checklist',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Synced and View-Only collection sharing (COLLECTION_SHARING.md). Admin-only until Paul has shared with it.
  'collection-sync-sharing': {
    label: 'Synced collection sharing',
    icon: FolderSync,
    description: 'Share a collection that you and a colleague both edit.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Gates the wall owner's side: only a flagged owner lets board members read the wall's posts.
  'shared-board-live-walls': {
    label: 'Library items on shared boards',
    icon: Share2,
    description:
      'Colleagues on a Synced or View-Only board see your Activity Walls, quizzes, video activities and guided activities.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Fail-closed for admins until Paul saves the row (espeak counsel hold, G19).
  'flashcards-speak': {
    label: 'Flashcards: Speak',
    icon: Mic,
    description: 'Students say each term aloud and see how close they were.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'flashcards',
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
  },
};

/** Retired global ids the Dock reads until a Widgets-page doc exists (plan D3). */
export const LEGACY_TOOL_FEATURES: Record<InternalToolType, GlobalFeature> = {
  record: 'screen-recording',
  magic: 'magic-layout',
  remote: 'remote-control',
};

/** Default-off flags that admins get before any doc is saved (plan D7). */
export const isAdminPreviewFeature = (featureId: GlobalFeature): boolean => {
  const def = FEATURE_DEFAULTS[featureId];
  return !def.missingDocPublic && !def.failClosedForAdmins;
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
  review: 'admin',
  routineGuide: 'admin',
  'arts-letters-agenda': 'admin',
};

export const getWidgetDefaultAccessLevel = (
  widgetType: WidgetType | InternalToolType
): AccessLevel =>
  WIDGET_DEFAULT_ACCESS_LEVEL[widgetType as WidgetType] ?? 'public';
