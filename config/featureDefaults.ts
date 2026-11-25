// Registry of every global feature: runtime defaults plus its admin row (docs/plans/shipped/ADMIN_ACCESS_PAGES.md D5).
import type React from 'react';
import {
  ClipboardList,
  MonitorPlay,
  Camera,
  PenLine,
  BarChart,
  BellRing,
  Bot,
  Building2,
  Cast,
  ClipboardCheck,
  Highlighter,
  ScanLine,
  Download,
  Eye,
  FileText,
  FileUp,
  Gauge,
  Globe,
  GraduationCap,
  Footprints,
  Languages,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Link2,
  ListChecks,
  Hash,
  Mic,
  Music,
  Music2,
  Presentation,
  Printer,
  RefreshCw,
  Send,
  Share2,
  Smartphone,
  Smile,
  Sparkles,
  AudioLines,
  StickyNote,
  Table2,
  Target,
  MousePointerClick,
  TextCursorInput,
  Timer,
  UsersRound,
  Video,
  Volume2,
  Wand2,
  Zap,
  Quote,
  Strikethrough,
  Calculator,
  ListPlus,
  Utensils,
  CloudSun,
  SquareChevronDown,
  CalendarClock,
  MessageSquare,
  Shapes,
  Settings2,
  Users,
  UserCheck,
  CopyX,
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
  // Admin kill switch for every substitute feature: Share with a sub and the /subs portal.
  'substitute-sharing': {
    label: 'Substitute sharing',
    icon: UserCheck,
    description: 'Teachers can share boards with a sub.',
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
    missingDocPublic: false,
  },
  'video-activity-audio-transcription': {
    label: 'Video Activity Audio Transcription',
    icon: Wand2,
    description: 'Quizzes from videos without captions.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'video-activity',
    defaultAccessLevel: 'public',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
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
    // Each card runs a view-count read, so teachers wait for an admin to open it.
    missingDocPublic: false,
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
  'speech-to-text': {
    label: 'Speech to text',
    icon: Mic,
    description:
      'An accommodation that lets a student dictate written answers in Quiz and Writing.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Paid Speech to text extras; each is checked against the assigning teacher on the server.
  'speech-to-text-ai-transcription': {
    label: 'Speech to text: AI transcription',
    icon: AudioLines,
    description:
      'Sends each phrase a signed-in student dictates to AI for a more accurate transcript.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    requires: 'speech-to-text',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'speech-to-text-tidy-up': {
    label: 'Speech to text: Tidy up',
    icon: Sparkles,
    description:
      'Lets a signed-in student ask AI to punctuate what they dictated, without changing a word.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    requires: 'speech-to-text',
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
  'schoology-quiz-import': {
    label: 'Send quizzes from Schoology',
    icon: FileUp,
    description:
      'Bring Schoology Tests/Quizzes, Assessments and question banks into SpartBoard, with the Chrome extension or a Schoology export.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Send quizzes from Schoology',
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
    label: 'Paper response sheets (Scantron replacement)',
    icon: Printer,
    description: 'Print bubble sheets and import scans.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Paper response sheets',
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
  // Cross out answer choices. Admin-only until Paul has tested it in prod.
  'quiz-cross-out': {
    label: 'Cross out answer choices',
    icon: Strikethrough,
    description:
      'Students cross out multiple-choice options they have ruled out.',
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
  // Tap-to-fill word bank stimulus on quiz questions. Admin-only until Paul has tested it in prod.
  'quiz-word-bank': {
    label: 'Word bank stimulus',
    icon: ListPlus,
    description:
      'Teachers add a word bank. Students tap a choice to fill a blank.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-modified-stimuli': {
    label: 'Modified stimuli',
    icon: Layers,
    description:
      "A question's modified version can show different stimuli to students with modified questions.",
    stage: 'preview',
    afterLaunch: 'retire',
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
  // Written answer boxes up to four pages long; a page count over 1 needs this.
  'paper-multi-page-answers': {
    label: 'Multi-page written answers',
    icon: TextCursorInput,
    description: 'Written answers on paper sheets can take up to four pages.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'quiz',
    modalLabel: 'Multi-page written answers',
    group: 'questions',
    requires: 'paper-handwritten-responses',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Live page preview beside the paper print options.
  'paper-print-preview': {
    label: 'Paper print preview',
    icon: Eye,
    description:
      'See each printed page while you set up paper response sheets.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'quiz',
    modalLabel: 'Print preview',
    group: 'questions',
    requires: 'paper-answer-sheets',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Print paper copy in the live Quiz monitor's student row menu.
  'paper-student-copy': {
    label: 'Print for one student',
    icon: Printer,
    description:
      'Print a paper copy of a live quiz for one student from the monitor.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'quiz',
    modalLabel: 'Print for one student',
    group: 'questions',
    requires: 'paper-answer-sheets',
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
  // AI transcription of scanned handwriting. Off for everyone, admins too, until saved on; off grades the crop.
  'paper-handwriting-ai': {
    label: 'Transcribe handwritten answers',
    icon: Sparkles,
    description:
      'Use AI to convert handwritten responses to type, preserving spelling and grammar as accurately as possible.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Transcribe handwritten answers',
    group: 'questions',
    requires: 'paper-handwritten-responses',
    defaultAccessLevel: 'admin',
    defaultEnabled: false,
    missingDocPublic: false,
    failClosedForAdmins: true,
  },
  // Rewording a choice on a scanned paper test also updates the saved answers.
  'paper-reword-sync': {
    label: 'Keep scanned answers when rewording',
    icon: TextCursorInput,
    description:
      'When a teacher rewords a choice on a scanned paper test, saved student answers follow the new wording.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Keep scanned answers when rewording',
    group: 'questions',
    requires: 'paper-answer-sheets',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Device quiz with written answers on paper; also needs paper-handwritten-responses.
  'paper-written-hybrid': {
    label: 'Written answers on paper',
    icon: TextCursorInput,
    description:
      'Multiple choice on the device and written answers on a printed sheet, scanned in for grading.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Written answers on paper',
    group: 'questions',
    requires: 'paper-handwritten-responses',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Kept scanned pages (QUIZ_PAPER_KEPT_PAGES.md K5); admin-only until the privacy review (PT-149).
  'paper-kept-pages': {
    label: "Keep students' scanned pages",
    icon: ScanLine,
    description:
      "Saves a copy of each student's scanned pages and prints results on them.",
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Keep scanned pages',
    group: 'questions',
    requires: 'paper-answer-sheets',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Students see their own kept pages with their returned results (lifts K1).
  'paper-pages-student-view': {
    label: 'Students see their scanned pages',
    icon: ScanLine,
    description:
      'Students see their own scanned pages with their results once you return written answers.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Students see scanned pages',
    group: 'questions',
    requires: 'paper-kept-pages',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Markup on handwritten answer images (QUIZ_PAPER_KEPT_PAGES.md §3.3).
  'paper-image-markup': {
    label: 'Mark up handwritten answers',
    icon: Highlighter,
    description:
      'Teachers add highlights, shapes, stamps and comments on handwritten answers, and they print on the work.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Mark up handwritten answers',
    group: 'questions',
    requires: 'paper-handwritten-responses',
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
  'freshservice-sync': {
    label: 'FreshService articles',
    icon: Globe,
    description: 'Sends web tour steps to FreshService as help articles.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'integrations',
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
  'claude-picture-uploads': {
    label: 'Claude connector: pictures from the chat',
    icon: Bot,
    description:
      "Pictures a teacher shares with Claude can go on Guided Learning slides, quiz questions and flashcards. They save to the teacher's Google Drive.",
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
  // Quiz Monitor "Live view": one student's in-progress attempt, redrawn from saved data.
  'quiz-live-view': {
    label: 'Quiz Live view',
    icon: MonitorPlay,
    description:
      "Teachers watch one student's quiz in progress from Monitor, with Nudge and screenshots.",
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Live view',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-live-view-nudge': {
    label: 'Quiz Live view: Nudge',
    icon: BellRing,
    description: 'Teachers send a Nudge from Live view.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Nudge',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
    requires: 'quiz-live-view',
  },
  'quiz-live-view-nudge-note': {
    label: 'Quiz Live view: Nudge note',
    icon: MessageSquare,
    description: 'Teachers add a short note to a Nudge.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Nudge note',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
    requires: 'quiz-live-view',
  },
  'quiz-live-view-screenshot': {
    label: 'Quiz Live view: Screenshot',
    icon: Camera,
    description: 'Teachers save a picture of Live view to their Drive.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Screenshot',
    group: 'assigning',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
    requires: 'quiz-live-view',
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
  // My Classes "View Student Page". Admin-only until Paul has used it in prod.
  'class-student-page': {
    label: 'View Student Page',
    icon: Eye,
    description: "Teachers open a class's student page from My Classes.",
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Course and Agenda setup in My Classes (docs/plans/COURSE_AND_AGENDA.md D19). Admin-only until Paul has used it in prod.
  'course-agenda': {
    label: 'Courses and Agenda',
    icon: Presentation,
    description:
      'Link classes into a Course and show its daily Agenda to students.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'classlink-clean-names': {
    label: 'Short ClassLink class names',
    icon: Download,
    description:
      'Classes imported from ClassLink get a short name with the course and period.',
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
  // Per-step access for the class group editor; public until an admin narrows it.
  'group-symbols': {
    label: 'Group symbols',
    icon: Shapes,
    description: 'Symbol step when a teacher makes a class group.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'group-schedules': {
    label: 'Group schedules',
    icon: CalendarClock,
    description: 'Schedule step and board reminders for class groups.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  'group-settings': {
    label: 'Group additional settings',
    icon: Settings2,
    description: 'Additional settings step for class groups.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
  },
  // Share content binding (H2): opt-in sub-share calendars, no legacy pick seed. Admin-only until Paul has tested it.
  'share-content-safeguards': {
    label: 'Share content safeguards',
    icon: Share2,
    description:
      'Sub shares include only the calendars a teacher ticks; shared items publish only from the owner’s picks.',
    stage: 'preview',
    afterLaunch: 'retire',
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
  'district-library': {
    label: 'District library',
    icon: Library,
    description:
      'Quizzes and question banks admins publish to buildings, grades or teachers.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
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
  // Server also requires gemini-functions; its daily limit applies to admins too (helpCenterDetails.ts).
  'help-center-ai': {
    label: 'Help Center: Generate with AI',
    icon: Sparkles,
    description: 'Fills in a tour item from its steps.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'ai',
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
  // Who gets Mini App submissions; Assignment modes must also allow them.
  'mini-app-results': {
    label: 'Mini App submissions',
    icon: ListChecks,
    description:
      'Lets these teachers collect Mini App submissions. Needs Submissions in Assignment modes.',
    stage: 'preview',
    afterLaunch: 'retire',
    widget: 'miniApp',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Dropdown and Drag blank types.
  'quiz-blank-types': {
    label: 'Fill in the blank: dropdown and drag',
    icon: SquareChevronDown,
    description:
      'Blanks can be a dropdown list or a word bank students drag words from, as well as typed.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'quiz',
    modalLabel: 'Dropdown and drag blanks',
    group: 'questions',
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
  'weather-details': {
    label: 'Weather details',
    icon: CloudSun,
    description: 'Dew point, humidity, wind and more on the Weather widget.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'weather',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'seating-chart-plans': {
    label: 'Seating Chart: seating plans',
    icon: LayoutGrid,
    description:
      'Save several seating plans per board and switch between them.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'seating-chart',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'document-camera-pro': {
    label: 'Camera as a document camera',
    icon: Camera,
    description:
      'Zoom, turn, freeze and draw on the Camera image, and compare photos side by side.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'webcam',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'noise-meter-pro': {
    label: 'Sound: noise meter upgrades',
    icon: Gauge,
    description:
      'Target level, Too loud alert, calibration, quiet time goal and a summary of how loud the class was.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'sound',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'whiteboard-pro': {
    label: 'Drawing: whiteboard tools',
    icon: PenLine,
    description:
      'Zoom and pan, a highlighter, a laser pointer, sticky notes and shape tools.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'drawing',
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
  // Admin-only until saved, like Guided Learning AI; the server denies non-admins while no doc exists.
  'flashcards-ai': {
    label: 'Flashcards: AI',
    icon: Sparkles,
    description: 'Drafts flashcards from a topic in the set editor.',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'flashcards',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'music-my-songs': {
    label: 'My songs in Music',
    icon: Music,
    description: 'Teachers add their own YouTube songs to the Music widget.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'music',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Focus on SpartBoard pages (CHROME_EXTENSION.md F14, F15). Admin-only until Paul has tested it in prod.
  'focus-sessions': {
    label: 'Focus: page protections',
    icon: Target,
    description:
      'Block copy, paste and print, and require fullscreen, on quizzes and video activities.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Unusual-input flags on quizzes. Admin-only until Paul has tested it in prod.
  'input-signals': {
    label: 'Unusual input flags',
    icon: MousePointerClick,
    description:
      'Flags quiz answers that look entered by another app (clicks with no mouse movement, machine-like typing, pasted text) and replays how written answers were typed.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Only useful where the district pushes the extension to student profiles.
  'managed-profile-check': {
    label: 'Managed profile check',
    icon: MousePointerClick,
    description:
      'Adds a sign to quiz attempts that ran outside a school-managed Chrome profile. Needs the SpartBoard extension pushed to student accounts and Unusual input flags on.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'students',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Assign to Staff: the link needs district Google sign-in and results show each person's name and email.
  'staff-audience': {
    label: 'Assign to staff',
    icon: UsersRound,
    description:
      'Assign quizzes, videos, mini apps, flashcards and guided learning to district staff.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'universal-import': {
    label: 'Import anything',
    icon: Download,
    description:
      'Bring a file, link, web page or pasted text into SpartBoard, and send pages with the Chrome extension.',
    stage: 'preview',
    afterLaunch: 'keep',
    category: 'integrations',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Per-type Import rollout; each also needs universal-import.
  'import-extension-send': {
    label: 'Import: send from the Chrome extension',
    icon: Send,
    description:
      'Shows Send to SpartBoard in the Chrome extension and the notice for pages waiting on the board.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-board-drop': {
    label: 'Import: drop onto a board',
    icon: FileUp,
    description:
      'Opens Add to board when a file, link or text is dropped onto a board.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-flashcards': {
    label: 'Import: Flashcards',
    icon: Layers,
    description: 'Offers Flashcards for spreadsheets, rows of terms and pages.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-google-forms': {
    label: 'Import: Google Forms',
    icon: ClipboardList,
    description:
      'Offers Quiz or Poll for a Google Form sent from the extension.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-activity-wall': {
    label: 'Import: Activity Wall',
    icon: StickyNote,
    description: 'Offers Activity Wall for a page or file, using AI.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-new-board': {
    label: 'Import: New board',
    icon: LayoutDashboard,
    description: 'Offers New board for a page or file, using AI.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-guided-learning': {
    label: 'Import: Guided Learning',
    icon: GraduationCap,
    description:
      'Offers Guided Learning for slides and Guided Learning files, in Add to board and in the widget.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-notebook': {
    label: 'Import: Notebook',
    icon: PenLine,
    description:
      'Offers Notebook for notebook files and slides, in Add to board and in the widget.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-video-activity': {
    label: 'Import: Video Activity',
    icon: Video,
    description:
      'Offers Video activity for YouTube videos and Edpuzzle lessons.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-mini-app': {
    label: 'Import: Mini App',
    icon: LayoutGrid,
    description: 'Offers Mini App for web page files.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-pdf': {
    label: 'Import: PDF',
    icon: FileText,
    description: 'Offers PDF for PDF files.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-sticker': {
    label: 'Import: Sticker',
    icon: Smile,
    description: 'Offers Sticker for pictures.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-embed': {
    label: 'Import: Embed',
    icon: Globe,
    description: 'Offers Embed for web links.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-link': {
    label: 'Import: Link',
    icon: Link2,
    description: 'Offers Link for web links.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-schoology-course': {
    label: 'Import: whole Schoology course',
    icon: Library,
    description: 'Offers Whole course for a Schoology course export.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'import-straight-to-board': {
    label: 'Import: add straight to the board',
    icon: Zap,
    description:
      'A dropped file or link that offers one widget skips Add to board and goes straight onto the board.',
    stage: 'preview',
    afterLaunch: 'retire',
    requires: 'universal-import',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'video-import-ai': {
    label: 'Video import: AI questions',
    icon: Sparkles,
    description:
      'Offers "Generate questions with AI" when a YouTube video is sent to SpartBoard.',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'video-activity',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-question-audio': {
    label: 'Recorded question audio',
    icon: Mic,
    description: 'Teachers record their voice for a quiz question.',
    group: 'questions',
    stage: 'permanent',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'quiz-random-numbers': {
    label: 'Random-number questions',
    icon: Hash,
    description:
      'Fill in the Blank questions with random numbers. Each student gets their own numbers.',
    group: 'questions',
    stage: 'preview',
    afterLaunch: 'keep',
    widget: 'quiz',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'assigned-tab': {
    label: 'Assigned tab',
    icon: ClipboardList,
    description: 'Library and Assigned tabs. Each class has its own status.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'picked-student-names': {
    label: 'Assigned students',
    icon: Users,
    description:
      'Assignment rows list the students an assignment went to. Names show under each class.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'writing-peer-review': {
    label: 'Writing peer review',
    icon: Users,
    description:
      "Teachers pair students to read, comment on or suggest edits to each other's writing.",
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'subs-live-tours': {
    label: 'Live tours for subs',
    icon: UserCheck,
    description:
      'Subs get a Help button with live tours. Admins record them on the sub page.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'student-live-tours': {
    label: 'Live tours for students',
    icon: GraduationCap,
    description:
      'Students get a Help button with live tours. Admins record them in View as student.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'assign-open-check': {
    label: 'Assign: no duplicate classes',
    icon: CopyX,
    description:
      'Assign locks classes that already have the item open. New classes can join that assignment.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'modification-fewer-questions': {
    label: 'Modifications: fewer questions',
    icon: ListChecks,
    description:
      'A quiz modification group can answer fewer questions. Scores count only those questions.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'student-set-time': {
    label: 'Quiz: schedule one student',
    icon: CalendarClock,
    description:
      'The quiz monitor can schedule a quiz for one student. Their class can stay paused.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  // Server only: functions/src/turnInQueue.ts checks it when a run ends (AB-388).
  'server-turn-in': {
    label: 'Turn in work after End',
    icon: ClipboardCheck,
    description:
      'Open work turns in after End or Close. The teacher tab can be closed.',
    stage: 'preview',
    afterLaunch: 'retire',
    defaultAccessLevel: 'admin',
    defaultEnabled: true,
    missingDocPublic: false,
  },
  'assignments-hub': {
    label: 'Assignments hub',
    icon: ClipboardList,
    description: 'The Assignments list in the sidebar menu.',
    stage: 'permanent',
    afterLaunch: 'keep',
    category: 'sharing',
    defaultAccessLevel: 'public',
    defaultEnabled: true,
    missingDocPublic: true,
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
  focus: 'admin',
  // Writing assignment plan D19: admins first.
  writing: 'admin',
  agenda: 'admin',
};

export const getWidgetDefaultAccessLevel = (
  widgetType: WidgetType | InternalToolType
): AccessLevel =>
  WIDGET_DEFAULT_ACCESS_LEVEL[widgetType as WidgetType] ?? 'public';
