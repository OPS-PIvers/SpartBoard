export type WidgetType =
  | 'clock'
  | 'traffic'
  | 'text'
  | 'checklist'
  | 'random'
  | 'dice'
  | 'sound'
  | 'drawing'
  | 'qr'
  | 'embed'
  | 'poll'
  | 'webcam'
  | 'scoreboard'
  | 'expectations'
  | 'weather'
  | 'schedule'
  | 'calendar'
  | 'lunchCount'
  | 'classes'
  | 'instructionalRoutines'
  | 'time-tool'
  | 'miniApp'
  | 'materials'
  | 'stickers'
  | 'sticker'
  | 'seating-chart'
  | 'catalyst'
  | 'catalyst-instruction'
  | 'catalyst-visual'
  | 'smartNotebook'
  | 'recessGear'
  | 'pdf'
  | 'quiz'
  | 'talking-tool'
  | 'breathing'
  | 'mathTools'
  | 'mathTool'
  | 'nextUp'
  | 'onboarding'
  | 'countdown'
  | 'car-rider-pro'
  | 'blending-board'
  | 'music'
  | 'specialist-schedule'
  | 'graphic-organizer'
  | 'concept-web'
  | 'reveal-grid'
  | 'numberLine'
  | 'syntax-framer'
  | 'hotspot-image'
  | 'starter-pack'
  | 'video-activity'
  | 'guided-learning'
  | 'custom-widget'
  | 'soundboard'
  | 'url'
  | 'activity-wall'
  | 'first-5'
  | 'work-symbols'
  | 'blooms-taxonomy'
  | 'blooms-detail'
  | 'need-do-put-then'
  | 'stations';

// --- ROSTER SYSTEM TYPES ---

export interface ClassLinkClass {
  sourcedId: string;
  title: string;
  classCode?: string;
  subject?: string;
}

export interface ClassLinkStudent {
  sourcedId: string;
  givenName: string;
  familyName: string;
  email: string;
}

export interface ClassLinkData {
  classes: ClassLinkClass[];
  studentsByClass: Record<string, ClassLinkStudent[]>;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  /** Teacher-distributed join code used for live sessions and quizzes (zero-padded, e.g. "01") */
  pin: string;
  /**
   * Stable ClassLink link, stamped when the student is imported or merged from
   * ClassLink. Enables re-sync without duplicating rows even if the student's
   * name changes upstream. Undefined for manually created students.
   */
  classLinkSourcedId?: string;
  /**
   * Student email. Captured from ClassLink imports and from test-class member
   * lists. Lives only in the Drive student-list JSON alongside name/PIN — per
   * the existing PII architecture (see `useRosters.ts` PII migration), this
   * field is NOT written to any Firestore document. Surfaced as an optional
   * column in `RosterEditorModal` so teachers can verify imports.
   */
  email?: string;
  /**
   * Stable IDs of classmates this student must never be grouped with in the
   * Randomizer's group-maker mode. Maintained bidirectionally: if B is in A's
   * list, A is in B's list.
   */
  restrictedStudentIds?: string[];
}

/**
 * Shape of the Firestore roster document — contains NO student PII.
 * Student names/PII live exclusively in a Google Drive file (driveFileId).
 */
export interface ClassRosterMeta {
  id: string;
  name: string;
  /** Drive file ID for the JSON file containing Student[] */
  driveFileId: string | null;
  /** Denormalised count for UI display without loading Drive */
  studentCount: number;
  createdAt: number;
  /**
   * Daily absent list. The Randomizer excludes these students from picks,
   * shuffles, and groups on the matching date. Treated as empty when `date`
   * does not equal today in the teacher's local timezone — so stale entries
   * from prior days are auto-ignored without needing cleanup.
   */
  absent?: { date: string; studentIds: string[] };
  /** Where the roster originated. Absent on legacy docs → treat as 'local'. */
  origin?: 'classlink' | 'local';
  /**
   * ClassLink class `sourcedId`. Present iff the roster was imported or merged
   * from a ClassLink class. Drives session `classIds[]` derivation so the
   * student-side ClassLink SSO gate (firestore.rules `passesStudentClassGate`)
   * resolves without the assignment layer having to know about ClassLink.
   */
  classlinkClassId?: string;
  /**
   * Test-class slug (the `testClasses/{id}` doc id, without the `test:` prefix).
   * Present iff the roster was imported from an admin-managed test class. Drives
   * session `classIds[]` derivation so the test-bypass SSO student's custom-token
   * claim (`classIds: [<slug>]`, minted by `studentLoginV1`) matches the
   * assignment session — without claiming `origin: 'classlink'`, which would
   * falsely tag this as a real ClassLink roster in the picker badge and merge
   * logic.
   */
  testClassId?: string;
  /** ClassLink class code (e.g. "MATH-7-P3"); rendered in the picker badge tooltip. */
  classlinkClassCode?: string;
  /** ClassLink subject label; used for reconciliation and teacher-visible filters. */
  classlinkSubject?: string;
  /** ClassLink tenant/organization ID; required to scope re-sync API calls. */
  classlinkOrgId?: string;
  /** Epoch ms of the last ClassLink import or merge for this roster. */
  classlinkSyncedAt?: number;
  /**
   * Google Classroom `courseId` this ClassLink roster is linked to, set via the
   * "Link to Google Classroom" action. Mirrors the canonical mapping stored at
   * `/classroom_course_links/{courseId}`; kept here so the roster UI can show
   * the linked state. Enables the Classroom Add-on to resolve a launching
   * student to this class's OneRoster `sourcedId` (PII-free name resolution).
   */
  googleClassroomCourseId?: string;
  /**
   * Schoology section LTI `context_id` this ClassLink roster is linked to, set
   * via the "Link to Schoology" action. Mirrors the canonical mapping stored at
   * `/lti_course_links/{contextId}`; kept here so the roster UI can show the
   * linked state. The Schoology side can only be linked after SpartBoard has
   * SEEN the section via a launch (no "list my courses" API), so this is set
   * from the post-launch / SidebarClasses linking flow, not at assign time.
   */
  ltiContextId?: string;
}

/**
 * In-memory roster shape (used by hooks and components).
 * Extends the Firestore metadata with the students array loaded from Drive.
 */
export interface ClassRoster extends ClassRosterMeta {
  students: Student[];
  /**
   * Present when the Drive student-list load failed for this roster.
   * Distinguishes "genuinely empty roster" from "load failed, students
   * unknown" so the UI can show a retry banner instead of "0 students".
   */
  loadError?: string;
}

// --- PLC (PROFESSIONAL LEARNING COMMUNITY) TYPES ---

/**
 * A Professional Learning Community: a small group of teachers who
 * collaborate on the same assignments and share aggregated student results.
 *
 * Stored at the top level (`/plcs/{plcId}`) rather than under a single user
 * because reads must work for every member, not just the lead.
 */
/**
 * A PLC member's role. Drives edit/admin permissions:
 * - `lead`: sole owner; exactly one per PLC. Can rename, invite, remove
 *   members, change roles, transfer leadership, and delete the PLC.
 * - `coLead`: shares lead/co-lead management powers (role changes, transfers)
 *   but is not the canonical owner.
 * - `member`: can author/edit PLC content but cannot manage membership.
 * - `viewer`: read-only; cannot edit any PLC content.
 */
export type PlcRole = 'lead' | 'coLead' | 'member' | 'viewer';

/**
 * One entry in the canonical `Plc.members` map (keyed by uid). Replaces the
 * parallel `memberUids` / `memberEmails` arrays as the source of truth for
 * membership, while those legacy fields are retained as denormalized indexes
 * during rollout. `status: 'removed'` marks a member who has left/been removed
 * but whose record is kept for attribution; only `status === 'active'` members
 * count as current.
 */
export interface PlcMember {
  uid: string;
  /** Lowercased email. */
  email: string;
  displayName: string;
  role: PlcRole;
  /** ms since epoch, resolved from a Firestore `serverTimestamp()` on read. */
  joinedAt: number;
  status: 'active' | 'removed';
}

export interface Plc {
  id: string;
  name: string;
  /**
   * Optional org tenancy (Decision 1.1). Inferred from member email domains
   * (matched against `/organizations/{orgId}/domains`). `null`/absent means
   * the PLC is tenancy-free (e.g. cross-district PLCs).
   */
  orgId?: string | null;
  /** Optional building tenancy (Decision 1.1). `null`/absent when unscoped. */
  buildingId?: string | null;
  /**
   * Canonical membership map (Decision 1.2): uid → member record. New PLCs
   * always write this. Legacy PLCs may lack it — read membership via the
   * `getPlcMembers` helper, which synthesizes from `memberUids` /
   * `memberEmails` / `leadUid` when `members` is absent.
   */
  members: Record<string, PlcMember>;
  /**
   * Denormalized convenience mirror of the member whose role is `lead`.
   * Kept because Firestore can't query inside a map and several read paths
   * still reference it directly during rollout. Derived from `members` on
   * every membership write.
   */
  leadUid: string;
  /**
   * Denormalized index of all current member uids, kept because Firestore
   * can't `array-contains`-query a map and `usePlcs` lists PLCs via
   * `where('memberUids','array-contains',uid)`. Maintained on every
   * membership write alongside `members`.
   */
  memberUids: string[];
  /**
   * uid → lowercased email for each current member. Retained as legacy /
   * back-compat (the `members` map now carries email canonically). Read via
   * the `getPlcMemberEmails` / `getPlcTeammateEmails` helpers, which prefer
   * the map and fall back to this array.
   */
  memberEmails: Record<string, string>;
  /**
   * URL of the single Google Sheet that aggregates this PLC's assignment
   * results. Auto-created the first time any member assigns a quiz with
   * Share-with-PLC enabled. Subsequent PLC assignments reuse this URL
   * instead of prompting the teacher to paste one. `null` (or absent) means
   * "not yet created — the next Share-with-PLC assignment should create it."
   * Cleared back to `null` if the sheet is later deleted in Drive so the
   * next assignment regenerates transparently.
   */
  sharedSheetUrl?: string | null;
  /**
   * PLC dashboard section toggles. Any member can flip these — they govern
   * which optional sections render in the PLC Dashboard view. Absent or
   * partial maps are merged against `DEFAULT_PLC_FEATURE_SETTINGS` so legacy
   * PLCs (and any newly added flags) default to enabled. Always read via
   * `getPlcFeatures(plc)` rather than `plc.features` directly.
   */
  features?: PlcFeatureSettings;
  /**
   * Opt-in weekly email digest flag (Decision 2.3, §5). Default `false` —
   * absent/false means no digest is sent. Any PLC member may toggle it via the
   * `isUpdatingPlcDigestOptIn()` rules branch. The scheduled `plcWeeklyDigest`
   * Cloud Function composes ONE shared summary per opted-in PLC (no per-member
   * fan-out) only when this is `true` AND the global `plc-digest.enabled` kill
   * switch is on.
   */
  digestOptIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Per-PLC dashboard section toggles. Any member can flip these. Use
 * `getPlcFeatures(plc)` when reading so legacy PLCs (no `features` field)
 * and partial maps merge against `DEFAULT_PLC_FEATURE_SETTINGS`.
 *
 * `completedAssignments` is intentionally NOT a flag — the index of finished
 * PLC assignments is always visible since it's the read-only history view
 * that anchors the dashboard.
 */
export interface PlcFeatureSettings {
  /** PLC Quiz Library tab (Phase 2). */
  quizzes: boolean;
  /** PLC Video Activities tab (Phase 4). */
  videoActivities: boolean;
  /** PLC Notes tab (Phase 5). */
  notes: boolean;
  /** PLC To-Do list tab (Phase 5). */
  todos: boolean;
  /** PLC Shared Boards tab (Phase 6). */
  sharedBoards: boolean;
}

export const DEFAULT_PLC_FEATURE_SETTINGS: PlcFeatureSettings = {
  quizzes: true,
  videoActivities: true,
  notes: true,
  todos: true,
  sharedBoards: true,
};

/**
 * Merge a (possibly absent or partial) `Plc.features` map against
 * `DEFAULT_PLC_FEATURE_SETTINGS`. Use this everywhere the dashboard reads
 * feature flags so legacy PLCs and newly added flags default to enabled.
 */
export function getPlcFeatures(plc: Plc): PlcFeatureSettings {
  return { ...DEFAULT_PLC_FEATURE_SETTINGS, ...(plc.features ?? {}) };
}

/**
 * One row in `plcs/{plcId}/assignment_index/{assignmentId}`. Written by the
 * assignment author at create time when their assignment opts into PLC
 * mode (i.e. `QuizAssignmentSettings.plc` is set). Lets every PLC member
 * read a unified list of "PLC assignments my teammates have run" without
 * cross-user collection-group queries on each teacher's `quiz_assignments`.
 *
 * Snapshot fields (title, ownerName, sheetUrl) are taken at create time;
 * Phase 1 does not mirror later edits. The doc id matches the source
 * assignment's id for easy join-back.
 */
/**
 * One question's identity at the moment a teacher published her PLC
 * contribution. Stored on each `PlcContribution` so the cross-teacher
 * aggregate view can detect schema drift (one teammate ahead of another
 * on a synced quiz, or copy-mode divergence) and render the warning
 * instead of silently misaligning columns.
 */
export interface PlcContributionQuestion {
  id: string;
  text: string;
  points: number;
}

/**
 * One student's response within a teacher's PLC contribution. This is the
 * Firestore-native replacement for a row of the shared Google Sheet —
 * carries everything the PlcTab needs to render aggregates without
 * re-running the grader at view time. `pointsByQuestionId` is keyed by
 * question id (not array index) so a missing entry means "unanswered"
 * unambiguously and survives reordering.
 */
export interface PlcContributionResponse {
  studentDisplayName: string;
  pin: string | null;
  classPeriod: string;
  status: 'completed' | 'in-progress';
  /** Whole-number percent (0-100). `null` when status !== 'completed'. */
  scorePercent: number | null;
  pointsEarned: number;
  maxPoints: number;
  tabSwitchWarnings: number;
  /** ms timestamp; `null` when status !== 'completed'. */
  submittedAt: number | null;
  /**
   * Per-question points earned, keyed by question id. Absent keys = not
   * answered. Value `0` = answered incorrectly. Value `> 0` = correct or
   * partial credit (matches `gradeAnswer().pointsEarned` semantics).
   */
  pointsByQuestionId: Record<string, number>;
}

/**
 * One teacher's contribution to a PLC's cross-teacher results aggregate.
 * Replaces the Google-Sheet-based aggregation that lived in
 * `quizDriveService.readPlcSheet`. Each (quiz, teacher) pair has exactly
 * one contribution doc at `/plcs/{plcId}/contributions/{quizId}_{teacherUid}`.
 *
 * The viewing teacher's PlcTab subscribes to the parent collection and
 * groups contributions by `syncGroupId` (when set) or `quizId` (legacy
 * unsynced quizzes) — that's how it identifies "the same logical quiz"
 * across teachers who each have their own local quiz doc.
 *
 * Auto-published from QuizResults.tsx when the owning teacher views her
 * results — no manual export needed for the PLC tab to see her data.
 */
export interface PlcContribution {
  id: string;
  schemaVersion: 1;
  /** The publishing teacher's *local* quizId — different across members for synced quizzes. */
  quizId: string;
  /**
   * Cross-teacher identifier for synced quizzes — read from `quiz.sync.groupId`.
   * `null` for unsynced quizzes (legacy). Stored as a forward-compatibility
   * hook: today's PlcTab groups contributions by exact question-id sequence
   * rather than syncGroupId, because in practice `pullSyncedQuiz` keeps
   * synced teammates' question ids identical anyway. If we ever let local
   * question ids drift while staying logically synced, swap the grouping
   * key in PlcTab to use this field.
   */
  syncGroupId: string | null;
  /** Publishing teacher's UID. Must equal `request.auth.uid` on write. */
  teacherUid: string;
  /** Display name snapshot — survives later display-name changes. */
  teacherName: string;
  /** Question identities at publish time — used by PlcTab to detect schema drift. */
  questionsSnapshot: PlcContributionQuestion[];
  /** One entry per student response captured at publish time. */
  responses: PlcContributionResponse[];
  /** ms timestamp; the only mutable identity field on update. */
  updatedAt: number;
}

export interface PlcAssignmentIndexEntry {
  id: string;
  /**
   * Discriminator for the source assignment widget. PR3a widens this to
   * accept `'video-activity'` (rules updated alongside); PR3b will start
   * writing VA index entries via `useVideoActivityAssignments`.
   */
  kind: 'quiz' | 'video-activity';
  /** UID of the teacher who created the assignment. Always a PLC member. */
  ownerUid: string;
  /** Display name snapshot — avoids a `/users` lookup per row. */
  ownerName: string;
  /** Lowercased email snapshot — used for member matching in the UI. */
  ownerEmail: string;
  /** Quiz title at create time. */
  title: string;
  /** Shared PLC Google Sheet URL (mirrored from `Plc.sharedSheetUrl`). */
  sheetUrl: string;
  /**
   * Live status of the source assignment. Mirrored fire-and-forget from
   * `useQuizAssignments` whenever the canonical assignment changes status
   * (`active` → `paused`, `paused` → `active`, `active|paused` →
   * `inactive`). Drives the In-progress vs Completed split in the PLC
   * Assignments tab — `active|paused` shows under In-progress, `inactive`
   * shows under Completed. Legacy entries written before Phase 3 lack the
   * field; the parser defaults missing/invalid values to `'active'` so
   * legacy entries surface in In-progress until their owner deactivates
   * them.
   */
  status: QuizAssignmentStatus;
  createdAt: number;
}

/**
 * One PLC-authored assignment template, stored at
 * `plcs/{plcId}/assignments/{plcAssignmentId}`.
 *
 * Templates are authored by any PLC member (either via the explicit
 * Library "share" flow or as a fire-and-forget side effect of toggling
 * "PLC mode" on a personal assignment) and represent an assignment any
 * teammate can pick up onto their own board. Templates do NOT carry
 * `classIds`/`rosterIds` — those are filled in by each importer.
 *
 * The doc points at a canonical `synced_quizzes/{syncGroupId}` doc, so
 * importers can pull content even though the source quiz lives only in
 * the author's Drive. Same orphan-tolerant posture as `PlcQuizEntry`:
 * deleting a template does NOT cascade to teammates' already-imported
 * personal assignments.
 */
export interface PlcAssignmentTemplate {
  /** Doc id; matches the document key under `plcs/{plcId}/assignments/`. */
  id: string;
  /** Quiz title at share time; mirrored on later peer publishes. */
  quizTitle: string;
  /** Source quiz id — informational only (importers don't need access). */
  quizId: string;
  /** Pointer to the canonical `/synced_quizzes/{groupId}` doc. */
  syncGroupId: string;
  /** Default session mode the importer's assignment will inherit. */
  sessionMode: QuizSessionMode;
  /** Default session options the importer's assignment will inherit. */
  sessionOptions: QuizSessionOptions;
  /**
   * Default attempt limit. `null` (or absent) = unlimited; legacy templates
   * predating attempt limits parse to `null`.
   */
  attemptLimit: number | null;
  /** UID of the teacher who shared this template. Immutable. */
  sharedBy: string;
  /** Lowercased email snapshot for display. Immutable. */
  sharedByEmail: string;
  /** Display name snapshot for attribution. Immutable. */
  sharedByName: string;
  /** ms timestamp at first share. Immutable. */
  sharedAt: number;
  /** ms timestamp; bumped on title/setting mirror updates. */
  updatedAt: number;
}

/**
 * One quiz shared with a PLC, stored at `plcs/{plcId}/quizzes/{plcQuizId}`.
 *
 * The doc is a lightweight header that points at the canonical
 * `synced_quizzes/{syncGroupId}` doc — questions live there, not here, so
 * list rendering avoids an N+1 read against the sync collection. `title`
 * and `questionCount` are best-effort mirrors of the canonical doc; they
 * get bumped fire-and-forget after a successful publish, but the source
 * of truth for content is always the synced group.
 *
 * Any PLC member can share, edit (via the synced group), or unshare a
 * quiz — same posture as Phase 5 notes/todos. The `sharedBy` snapshot is
 * for attribution only; deleting your personal copy does NOT cascade-
 * delete the PLC entry (orphan-tolerant per Phase 2 spec).
 */
export interface PlcQuizEntry {
  /** Doc id; matches the document key under `plcs/{plcId}/quizzes/`. */
  id: string;
  /** Mirrored from the synced group; used for list rendering. */
  title: string;
  /** Mirrored from the synced group's questions array length. */
  questionCount: number;
  /** Pointer to the canonical `/synced_quizzes/{groupId}` doc. */
  syncGroupId: string;
  /** UID of the original sharer. Immutable. */
  sharedBy: string;
  /** Lowercased email snapshot for display. Immutable. */
  sharedByEmail: string;
  /** Display name snapshot for attribution. Immutable. */
  sharedByName: string;
  /** ms timestamp at first share. Immutable. */
  sharedAt: number;
  /** ms timestamp; bumped on title/questionCount mirror updates. */
  updatedAt: number;
  /**
   * Optional default session mode a teacher can pick up when assigning this
   * shared quiz. Absent on legacy entries shared before run-settings moved
   * onto the quiz library.
   */
  sessionMode?: QuizSessionMode;
  /**
   * Optional default session options a teacher can pick up when assigning
   * this shared quiz. Absent on legacy entries.
   */
  sessionOptions?: QuizSessionOptions;
  /**
   * Optional default attempt limit (`null` = unlimited). Absent on legacy
   * entries; a teacher can pick this up when assigning.
   */
  attemptLimit?: number | null;
  /**
   * Optional source quiz id — informational only, the personal quiz this was
   * shared from. Absent on legacy entries.
   */
  quizId?: string;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the shared quiz into Trash (restorable until the Wave-4
   * GC hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

/**
 * One video activity shared with a PLC, stored at
 * `plcs/{plcId}/video_activities/{plcVideoActivityId}`.
 *
 * Mirrors `PlcQuizEntry` in shape and lifecycle:
 *   - lightweight header pointing at `synced_video_activities/{syncGroupId}`
 *     (questions + per-question scoring live there, not here)
 *   - any current PLC member can share / edit-mirror / unshare
 *   - identity + attribution fields are immutable post-create
 *
 * Differences from quizzes:
 *   - carries `youtubeUrl` so the tile + tab can render a thumbnail without
 *     loading the full content blob
 *   - sync collection is `synced_video_activities/`, not `synced_quizzes/`
 */
export interface PlcVideoActivityEntry {
  /** Doc id; matches the document key under `plcs/{plcId}/video_activities/`. */
  id: string;
  /** Mirrored from the synced group; used for list rendering. */
  title: string;
  /**
   * Mirrored from the source activity. Empty string if the source lacked a
   * URL at share time. Tile rendering may use this to fetch the YouTube
   * thumbnail; downstream consumers should always defend against `''`.
   */
  youtubeUrl: string;
  /** Mirrored from the synced group's questions array length. */
  questionCount: number;
  /** Pointer to the canonical `/synced_video_activities/{groupId}` doc. */
  syncGroupId: string;
  /** UID of the original sharer. Immutable. */
  sharedBy: string;
  /** Lowercased email snapshot for display. Immutable. */
  sharedByEmail: string;
  /** Display name snapshot for attribution. Immutable. */
  sharedByName: string;
  /** ms timestamp at first share. Immutable. */
  sharedAt: number;
  /** ms timestamp; bumped on title/questionCount mirror updates. */
  updatedAt: number;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the shared video activity into Trash (restorable until
   * the Wave-4 GC hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

/**
 * One shared note in a PLC notebook. Members CRUD freely; LWW on edits,
 * upgraded with an optimistic-concurrency `version` precondition (Decision 2.4)
 * to surface edit conflicts instead of silently last-write-wins.
 */
export interface PlcNote {
  id: string;
  title: string;
  body: string;
  /**
   * Note flavor (Decision 2.5b). `'freeform'` (default / legacy) is a plain
   * shared note; `'meeting'` notes carry the agenda → decisions → action-items
   * template and link to a `PlcMeeting` via `meetingId`. Absent on legacy notes
   * — read as `'freeform'`.
   */
  kind?: 'freeform' | 'meeting';
  /**
   * Link to the `PlcMeeting` record this note documents (Decision 2.5b). Set
   * only on `kind === 'meeting'` notes; `null`/absent otherwise.
   */
  meetingId?: string | null;
  createdBy: string;
  createdAt: number;
  lastEditedBy: string;
  lastEditedAt: number;
  /**
   * Monotonic edit counter for optimistic concurrency (Decision 2.4). Each
   * successful update bumps it by exactly 1; a stale writer's precondition
   * fails and the client raises the conflict toast (reuse the
   * `SyncedQuizVersionConflictError` pattern). Absent on legacy notes — both
   * sides treat "absent" as a valid no-version state during rollout.
   */
  version?: number;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the note into Trash (restorable until the Wave-4 GC
   * hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

/**
 * One PLC to-do. Stored as one doc per todo (not an array on a parent doc)
 * so concurrent edits don't serialize against the whole list.
 */
export interface PlcTodo {
  id: string;
  text: string;
  done: boolean;
  /**
   * uid of the member this to-do is assigned to (Decision 3.9 / meeting action
   * items). `null`/absent means unassigned. Must be a current PLC member uid.
   */
  assigneeUid?: string | null;
  /**
   * Optional due date (ms since epoch). `null`/absent means no due date.
   */
  dueAt?: number | null;
  /**
   * Provenance link to the `PlcMeeting` whose action item spawned this to-do
   * (Decision 3.9). `null`/absent for to-dos created directly in the list.
   */
  meetingId?: string | null;
  createdBy: string;
  createdAt: number;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the to-do into Trash (restorable until the Wave-4 GC
   * hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

// --- PLC shared Google Docs ---
export interface PlcDoc {
  id: string;
  /** Human label for the doc tab/list row. */
  title: string;
  /** Raw Google Docs/Drive URL as pasted by a member. Rendered via convertToEmbedUrl(). */
  url: string;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the doc into Trash (restorable until the Wave-4 GC
   * hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

/**
 * Coarse per-section presence (Decision 2.1), stored at
 * `plcs/{plcId}/presence/{uid}` (doc id == the member's uid). The client writes
 * its own doc on mount and on a ~45s heartbeat while the dashboard is open, and
 * best-effort deletes it on unmount / `pagehide`. "Who's here" = presence docs
 * whose `lastActiveAt` falls within ~90s, filtered client-side. The Wave-4
 * `gcPlcOrphans` function prunes stale docs so abandoned tabs don't linger.
 *
 * `section` widens to `string` here (rather than importing the component-layer
 * `PlcSectionId`, which would create a `types.ts` → `components/` cycle). The
 * canonical narrowed alias lives in `context/usePlcContext.ts` as
 * `PlcPresenceEntry`, which re-types `section` as `PlcSectionId | 'meeting'`
 * and is the shape the store slot and selectors carry.
 */
export interface PlcPresence {
  uid: string;
  displayName: string;
  /** Active PLC section id (or `'meeting'`); a `PlcSectionId | 'meeting'`. */
  section: string;
  /** serverTimestamp resolved to ms on read; heartbeat ~45s. */
  lastActiveAt: number;
}

/**
 * The closed set of activity event types written to the append-only PLC
 * activity log (Decision 2.2). Each maps to one user-facing summary string
 * under `plcDashboard.activity.event.*`.
 */
export type PlcActivityType =
  | 'member_joined'
  | 'member_left'
  | 'role_changed'
  | 'assessment_created'
  | 'assessment_shared'
  | 'assessment_results_ready'
  | 'meeting_held'
  | 'note_created'
  | 'comment_added'
  | 'item_deleted'
  | 'item_restored';

/**
 * One entry in the append-only PLC activity log (Decision 2.2), stored at
 * `plcs/{plcId}/activity/{eventId}`. Written fire-and-forget from the mutation
 * paths (never blocking the canonical write — mirrors
 * `writePlcAssignmentIndexEntry`). The listener loads the latest N (e.g.
 * `limit(50)`); the Wave-4 `gcPlcOrphans` function trims events older than
 * ~90 days. Clients may create but never update/delete (GC is server-side).
 *
 * "Since you were here" = events whose `createdAt > PlcUnreadState.lastSeenAt`.
 */
export interface PlcActivityEvent {
  id: string;
  type: PlcActivityType;
  /** uid of the member who triggered the event. Must equal `request.auth.uid`. */
  actorUid: string;
  /** Display-name snapshot — survives later display-name changes. */
  actorName: string;
  /**
   * The kind of object the event is about (e.g. `'assessment' | 'note' |
   * 'comment' | 'dataCard' | 'meeting' | 'todo' | 'member'`). Free-form string
   * so new target kinds don't require a rules/type change; absent for events
   * with no specific target. */
  targetType?: string;
  /** Id of the target object (e.g. assessmentId or `assessmentId:questionId`). */
  targetId?: string;
  /** Display-title snapshot of the target, for rendering without a join. */
  targetTitle?: string;
  /** serverTimestamp resolved to ms on read. */
  createdAt: number;
}

/**
 * One scoped comment with @mentions (Decision 2.6), stored at
 * `plcs/{plcId}/comments/{commentId}`. Comments start on Shared Data result
 * cards (`targetType: 'dataCard'`) and extend to assessments/notes. Each
 * mention raises an activity event + unread for the mentioned member.
 *
 * Edit/soft-delete posture: the author may edit `body`/`editedAt` or soft-
 * delete via `deletedAt`; any member may soft-delete (tidy-up). Identity fields
 * (`id`, `targetType`, `targetId`, `authorUid`, `authorName`, `createdAt`,
 * `mentions`) are immutable on update.
 */
export interface PlcComment {
  id: string;
  /** Comment target kind. Starts with `'dataCard'`. */
  targetType: 'dataCard' | 'assessment' | 'note';
  /** Target id — e.g. `assessmentId` or `assessmentId:questionId`. */
  targetId: string;
  /** Author uid. Must equal `request.auth.uid` on create. Immutable. */
  authorUid: string;
  /** Display-name snapshot — survives later display-name changes. Immutable. */
  authorName: string;
  body: string;
  /** Mentioned member uids; each → an activity event + unread for that user. */
  mentions: string[];
  /** serverTimestamp resolved to ms on read. Immutable. */
  createdAt: number;
  /** ms timestamp of the last body edit; `null`/absent if never edited. */
  editedAt?: number | null;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp hides the comment (restorable until the Wave-4 GC hard-deletes
   * it). Unlike most content, ANY member may soft-delete a comment.
   */
  deletedAt?: number | null;
}

/**
 * Per-user, per-PLC private unread cursor (Decision 2.2), stored at
 * `/users/{uid}/plc_state/{plcId}` (owner-only). "Since you were here" is the
 * set of activity events with `createdAt > lastSeenAt`; the sidebar badge
 * counts them. Advanced when the member opens the PLC / Home.
 */
export interface PlcUnreadState {
  /** serverTimestamp resolved to ms on read; the last time the member visited. */
  lastSeenAt: number;
}

/**
 * The team's designated common assessment (Decision 4.0c), stored at
 * `plcs/{plcId}/assessments/{assessmentId}`. PLC-owned (automatically gated by
 * the parent membership check). This is the first-class object that replaces
 * heuristic title-matching: results aggregate to one canonical id
 * (`PlcAssessmentAggregate.assessmentId`) and the team can track "who's run it."
 *
 * `syncGroupId` pins the canonical content (a `synced_quizzes` /
 * `synced_video_activities` group); it is immutable on update. `createdBy` and
 * `id` are likewise identity fields. Soft-deletable via `deletedAt`.
 */
export interface PlcCommonAssessment {
  id: string;
  /** Team-facing assessment title (e.g. "Unit 4 CFA"). */
  title: string;
  /** Which authoring surface backs this assessment. */
  kind: 'quiz' | 'video-activity';
  /**
   * Canonical content group id — the `synced_quizzes` /
   * `synced_video_activities` group whose results roll up to this assessment.
   * Immutable on update (pinned in rules).
   */
  syncGroupId: string;
  /** Optional unit/standard label for grouping (e.g. "Unit 4", "RL.6.2"). */
  unitLabel?: string;
  /** Optional open date (ms since epoch). `null`/absent means no open gate. */
  opensAt?: number | null;
  /** Optional due date (ms since epoch). `null`/absent means no due date. */
  dueAt?: number | null;
  /**
   * Lifecycle status:
   * - `planning`: designated but not yet open for teachers to run.
   * - `active`: teachers are running it with their classes.
   * - `reviewing`: data is being reviewed (typically in Meeting Mode).
   * - `closed`: review complete; archived.
   */
  status: 'planning' | 'active' | 'reviewing' | 'closed';
  /** uid of the member who designated the assessment. Immutable. */
  createdBy: string;
  /** serverTimestamp resolved to ms on read. Immutable. */
  createdAt: number;
  /** serverTimestamp resolved to ms on read; bumped on every update. */
  updatedAt: number;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the assessment into Trash (restorable until the Wave-4
   * GC hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

/**
 * The anonymized, member-readable rollup for one common assessment (Decisions
 * 6.0 + 3.3), stored at `plcs/{plcId}/aggregates/{assessmentId}` and written
 * **server-side only** by the `aggregatePlcAssessment` Cloud Function (clients
 * may read but never write). This is the PII fix and the Meeting-Mode data
 * spine in one: members read this small aggregate instead of every teacher's
 * raw `PlcContribution` (which carries student names and is owner-read-only).
 *
 * Crucially, `perTeacher` rows carry `studentCount` but **no student names and
 * no per-student rows** — the FERPA boundary is enforced here and in rules.
 */
export interface PlcAssessmentAggregate {
  /** Matches the `PlcCommonAssessment.id` this aggregate rolls up (== doc id). */
  assessmentId: string;
  /** Aggregate schema version, for forward-compatible recomputes. */
  schemaVersion: number;
  /** Number of teachers who have contributed results. */
  teacherCount: number;
  /** Total students across all contributing teachers' classes. */
  studentCount: number;
  /** Team-wide average score (0-100) across all teachers' students. */
  teamAveragePercent: number;
  /** Per-question correctness rollup, sorted/owned by the function. */
  perQuestion: Array<{
    questionId: string;
    /** Question prompt snapshot, for rendering without a content join. */
    text: string;
    /** Percent correct (0-100) across all teachers' students. */
    correctPercent: number;
    /** Point value of the question. */
    points: number;
  }>;
  /**
   * Per-teacher rollup — **anonymized**: a count of that teacher's students,
   * NEVER student names and NEVER per-student rows.
   */
  perTeacher: Array<{
    teacherUid: string;
    /** Display-name snapshot of the teacher (teacher identity, not student). */
    teacherName: string;
    /** Number of that teacher's classes/sections that ran the assessment. */
    classCount: number;
    /** That teacher's average score (0-100) across their students. */
    averagePercent: number;
    /** Count of that teacher's students. No names, no per-student rows. */
    studentCount: number;
  }>;
  /** serverTimestamp resolved to ms on read; when the function last recomputed. */
  ranAt: number;
}

/**
 * An archived, exportable record of one live PLC meeting (Decisions 4.0, 4.0b),
 * stored at `plcs/{plcId}/meetings/{meetingId}`. PLC-owned. Captures the guided
 * Meeting-Mode flow: which common assessments were reviewed, the decisions made
 * (optionally linked to a weak-question data card), and action items (which can
 * spawn `plcs/{plcId}/todos` via `actionItems[].todoId`).
 *
 * `attendeeUids` is seeded from presence at meeting time, editable before save.
 * Identity fields (`id`, `createdBy`) are immutable on update. Soft-deletable.
 */
export interface PlcMeeting {
  id: string;
  /** serverTimestamp resolved to ms on read; when the meeting was held. */
  heldAt: number;
  /** uid of the member facilitating the meeting. */
  facilitatorUid: string;
  /** uids of members present (seeded from presence, editable before save). */
  attendeeUids: string[];
  /** `PlcCommonAssessment` ids reviewed during the meeting. */
  assessmentIds: string[];
  /** Optional free-text agenda. */
  agenda?: string;
  /** Decisions captured during the meeting, each optionally linked to a data card. */
  decisions: Array<{
    id: string;
    text: string;
    /** Optional link to a weak-question / data card the decision responds to. */
    linkedDataCard?: { assessmentId: string; questionId?: string };
  }>;
  /** Action items captured during the meeting; each can spawn a PLC to-do. */
  actionItems: Array<{
    id: string;
    text: string;
    /** uid of the assignee. `null`/absent means unassigned. */
    assigneeUid?: string;
    /** Optional due date (ms since epoch). `null`/absent means no due date. */
    dueAt?: number | null;
    /** Id of the spawned `PlcTodo`, if the action item was promoted to one. */
    todoId?: string;
  }>;
  /** Optional free-text notes body (links to a `PlcNote` via `PlcNote.meetingId`). */
  notesBody?: string;
  /**
   * Lifecycle status: `in-progress` while the meeting is live in Meeting Mode,
   * `completed` once saved as a record.
   */
  status: 'in-progress' | 'completed';
  /** uid of the member who created the record. Immutable. */
  createdBy: string;
  /** serverTimestamp resolved to ms on read; bumped on every update. */
  updatedAt: number;
  /**
   * Soft-delete tombstone (Decision 3.1). `null`/absent means live; a non-null
   * ms timestamp moves the meeting into Trash (restorable until the Wave-4 GC
   * hard-deletes it after 30 days).
   */
  deletedAt?: number | null;
}

// --- Admin-curated resources pushed to PLCs ---
export type PlcResourceKind =
  | 'quiz'
  | 'video-activity'
  | 'assignment'
  | 'doc'
  | 'board';

export type PlcResourceScope = 'all' | 'selected';

export interface PlcResource {
  id: string;
  kind: PlcResourceKind;
  /** Display title shown in the admin list + the PLC inbox. */
  title: string;
  /** Optional admin note describing the resource / how to use it. */
  description: string;
  /**
   * Pointer to the canonical source. For quiz/video-activity/assignment this is
   * the `/synced_*` group id; for 'doc' this is the Google Docs URL; for 'board'
   * the `/shared_boards` shareId. Importers resolve per-kind.
   */
  refId: string;
  scope: PlcResourceScope;
  /** Target PLC ids when scope==='selected'. Empty when scope==='all'. */
  plcIds: string[];
  createdByAdminUid: string;
  createdByAdminEmail: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * An outstanding invitation for a teacher to join a PLC. Top-level so the
 * invitee can read pending invites by email without being a member of the
 * target PLC yet. The doc id is *deterministic* — `<plcId>_<emailLower>`
 * (see `plcInvitationDocId` in `usePlcInvitations` and `plcInviteDocId` in
 * `firestore.rules`) — which lets the accept-flow rule verify an outstanding
 * pending invite via an O(1) `get()` without enumerating the collection.
 * Re-sending an invite to the same email overwrites the prior record,
 * re-arming a declined invite.
 *
 * State machine: `pending` → `accepted` (joins PLC) | `declined` (no-op).
 * Terminal states are kept for audit; the invitee panel filters to `pending`.
 */
export interface PlcInvitation {
  id: string;
  plcId: string;
  /** Denormalized so the invite UI can render the PLC name without reading `/plcs/{plcId}` (which the invitee can't read until accepted). */
  plcName: string;
  /** Lowercased to match `request.auth.token.email.lower()` in Firestore rules. */
  inviteeEmailLower: string;
  invitedByUid: string;
  /** Denormalized inviter display name for the invitee panel. */
  invitedByName: string;
  invitedAt: number;
  status: 'pending' | 'accepted' | 'declined';
  respondedAt?: number;
  /**
   * Same-org tenancy stamp (Decision 1.1). Present when the inviting PLC's
   * root carried an `orgId` at send time, so the invite is scoped to the same
   * organization. Absent for legacy PLCs that have no `orgId` yet.
   */
  orgId?: string;
}

// --- LIVE SESSION TYPES ---

export interface LiveSession {
  id: string; // Usually the Teacher's User ID
  isActive: boolean;
  activeWidgetId: string | null;
  activeWidgetType: WidgetType | null;
  activeWidgetConfig?: WidgetConfig; // Config for the active widget
  background?: string; // Teacher's current dashboard background
  code: string; // A short 4-6 digit join code
  frozen: boolean; // Global freeze state
  createdAt: number;
}

export interface LiveStudent {
  id: string; // Unique ID for this session
  /** Student's roster PIN — replaces name to keep PII out of Firestore */
  pin: string;
  status: 'active' | 'frozen' | 'disconnected';
  joinedAt: number;
  lastActive: number;
}

// Supporting types for widget configs
export interface Point {
  x: number;
  y: number;
}

/**
 * Represents a position and span on a 12x12 spatial grid.
 */
export interface GridPosition {
  /** 0-11 (X-axis starting point) */
  col: number;
  /** 0-11 (Y-axis starting point) */
  row: number;
  /** 1-12 (Width in columns) */
  colSpan: number;
  /** 1-12 (Height in rows) */
  rowSpan: number;
}

export interface Path {
  points: Point[];
  color: string;
  width: number;
}

// --- Whiteboard object model (Phase 2a) ---
// DrawableObject is a polymorphic union that replaces the pen-only `Path[]`
// model used in Phase 1. All objects share an id + z + optional rotation;
// each kind adds its own geometry/style fields. Rendering dispatches on
// `kind` (see components/widgets/DrawingWidget/useDrawingCanvas.ts).

export type DrawableObjectKind =
  | 'path'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'image';

export interface BaseDrawableObject {
  id: string;
  kind: DrawableObjectKind;
  z: number;
  rotation?: number;
  /** UID of the user who drew this object — used to scope per-author Undo in synced annotation. */
  authorUid?: string;
}

export interface PathObject extends BaseDrawableObject {
  kind: 'path';
  points: Point[];
  color: string;
  width: number;
}

export interface RectObject extends BaseDrawableObject {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

export interface EllipseObject extends BaseDrawableObject {
  kind: 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

export interface LineObject extends BaseDrawableObject {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface ArrowObject extends BaseDrawableObject {
  kind: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface TextObject extends BaseDrawableObject {
  kind: 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
}

export interface ImageObject extends BaseDrawableObject {
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  assetId?: string;
}

export type DrawableObject =
  | PathObject
  | RectObject
  | EllipseObject
  | LineObject
  | ArrowObject
  | TextObject
  | ImageObject;

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface ScheduleItem {
  id?: string;
  /** @deprecated Use startTime instead. Falls back to startTime if not provided. */
  time?: string;
  task: string;
  done?: boolean;
  startTime?: string;
  endTime?: string;
  /**
   * Duration in seconds for timer-mode items. When set (and mode === 'timer'),
   * the item chains off the previous item's effective end time rather than
   * running off a fixed wall-clock window.
   */
  durationSeconds?: number;
  mode?: 'clock' | 'timer';
  linkedWidgets?: WidgetType[];
  spawnedWidgetIds?: string[];
  oneOffDate?: string; // YYYY-MM-DD: if set, item only shows on this specific date
}

export interface DailySchedule {
  id: string;
  name: string;
  items: ScheduleItem[];
  /** Days of the week this schedule is active (0 = Sunday, 1 = Monday, etc.) */
  days: number[];
}

export interface CalendarEvent {
  date: string;
  time?: string;
  title: string;
}

export type RoutineStructure = 'linear' | 'cycle' | 'visual-cue' | 'components';
export type RoutineAudience = 'student' | 'teacher';

export interface RoutineStep {
  id: string;
  text: string;
  icon?: string;
  stickerUrl?: string;
  imageUrl?: string;
  color?: string;
  attachedWidget?: {
    type: WidgetType;
    label: string;
    config: WidgetConfig;
  };
  label?: string;
}

// Widget-specific config types

export interface BuildingUrlDefaults {
  buildingId: string;
  urls?: {
    id: string;
    url: string;
    title?: string;
    color?: string;
  }[];
}

export interface UrlGlobalConfig {
  buildingDefaults?: Record<string, BuildingUrlDefaults>;
  dockDefaults?: Record<string, boolean>;
}

export interface UrlWidgetConfig {
  urls: {
    id: string;
    url: string;
    title?: string;
    color?: string;
    icon?: string;
    shape?: 'rectangle' | 'circle';
    imageUrl?: string;
  }[];
}

export interface ClockConfig {
  format24: boolean;
  showSeconds: boolean;
  themeColor?: string;
  fontFamily?: string;
  clockStyle?: string;
  glow?: boolean;
}

export interface TrafficConfig {
  active?: string;
}

export type TextSizePreset = 'small' | 'medium' | 'large' | 'x-large';

export interface TextConfig {
  content: string;
  bgColor: string;
  fontSize: number;
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  verticalAlign?: 'top' | 'center' | 'bottom';
}

export interface ChecklistConfig {
  items: ChecklistItem[];
  scaleMultiplier?: number;
  mode: 'manual' | 'roster';
  rosterMode?: 'class' | 'custom';
  firstNames?: string;
  lastNames?: string;
  completedNames?: string[]; // Tracks IDs or Names checked in roster mode
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  cardColor?: string;
  cardOpacity?: number;
}

export interface RandomGroup {
  id?: string;
  names: string[];
}

export interface RandomConfig {
  firstNames: string;
  lastNames: string;
  mode: string;
  groupSize?: number;
  lastResult?: string | string[] | RandomGroup[] | null;
  soundEnabled?: boolean;
  remainingStudents?: string[];
  rosterMode?: 'class' | 'custom';
  autoStartTimer?: boolean;
  visualStyle?: 'flash' | 'slots' | 'wheel';
  externalTrigger?: number;
  /** Jigsaw mode: original home groups (each student's "home base"). */
  jigsawHomeGroups?: RandomGroup[] | null;
  /** Jigsaw mode: expert groups derived from home groups via round-robin
   *  assignment with rotating offset across `numExpertGroups` buckets. */
  jigsawExpertGroups?: RandomGroup[] | null;
  /** Jigsaw mode: which view is currently shown on the front face. */
  jigsawView?: 'home' | 'expert';
  /** Jigsaw mode: explicit number of expert groups. When unset, defaults to
   *  max(2, ceil(numHomeGroups / 2)) — i.e. "2 home groups per expert group",
   *  clamped to a minimum of 2 to match the settings/stepper slider range. */
  numExpertGroups?: number;
  /** Jigsaw mode: explicit number of home groups (parallel to
   *  `numExpertGroups`). When unset, defaults to ceil(students / groupSize)
   *  for backward compatibility with widgets that pre-date this field —
   *  earlier builds derived home-group COUNT indirectly from `groupSize`
   *  (members per group), which felt unintuitive when the sibling EXPERT
   *  stepper meant a count. Stored as a target count; at pick time
   *  students get distributed into exactly this many buckets via
   *  `makeNameGroupsByCount` (round-robin) for custom-names mode, or
   *  `makeRestrictedGroupsByCount` (greedy smallest-safe-bucket) for
   *  class mode where restriction-aware placement matters. */
  numHomeGroups?: number;
  /** Manual editing: names pinned to their current group/index. Locked names
   *  stay put when Randomize is hit again; other students reshuffle around
   *  them. Can still be moved manually by drag. */
  lockedNames?: string[];
  /** Manual editing: names removed from the result and parked in the
   *  Unassigned tray. Excluded from re-randomize until dragged back into a
   *  group/list. */
  unassignedNames?: string[];
  /** Shuffle mode: names marked as "done" by tapping the check button on
   *  the chip — used for presentation order, lunch line, etc. The chip
   *  renders the name struck through. Marks are tied to the student name
   *  so they survive re-randomize (a fresh order doesn't erase what's
   *  already been completed). */
  doneNames?: string[];
}

export interface DiceConfig {
  count: number;
  diceColor?: string;
  dotColor?: string;
  /** Last roll result persisted so remote rolls are reflected on the board. */
  lastRoll?: number[];
}

export interface SoundboardSound {
  id: string;
  label: string;
  url: string; // The sound URL (may be empty for synthesized sounds)
  color?: string; // Optional custom color for the button
  synthesized?: boolean; // If true, use Web Audio API synthesis instead of URL
}

export interface SoundboardConfig {
  selectedSoundIds: string[]; // IDs of sounds available in the pool (from settings)
  activeSoundIds?: string[]; // IDs currently shown as big buttons; defaults to selectedSoundIds
}

export interface SoundboardBuildingConfig {
  availableSounds: SoundboardSound[]; // Legacy: sounds configured directly on a building
  enabledLibrarySoundIds?: string[]; // IDs from the standard library
  enabledCustomSoundIds?: string[]; // IDs from the shared custom library
}

export interface SoundboardGlobalConfig {
  buildingDefaults?: Record<string, SoundboardBuildingConfig>;
  customLibrarySounds?: SoundboardSound[]; // Shared custom sounds managed once by admins
}

export interface SoundConfig {
  sensitivity: number;
  visual: 'thermometer' | 'speedometer' | 'line' | 'balls';
  autoTrafficLight?: boolean;
  trafficLightThreshold?: number;
  syncExpectations?: boolean;
}

/** Active drawing tool. Replaces the legacy `config.color === 'eraser'` overload. */
export type ShapeTool =
  | 'pen'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'select';

/**
 * Eraser sub-tool. The DrawingWidget eraser surfaces three modes:
 *   - `stroke`  — pixel-based erase along the cursor path (legacy behavior,
 *                 `globalCompositeOperation = 'destination-out'`).
 *   - `object`  — click-and-drag deletes any object touched by the cursor in
 *                 one undo group. Width defines hit radius.
 *   - `lasso`   — draw a closed region; on pointer-up any object whose bbox
 *                 is fully enclosed (all four corners inside the polygon)
 *                 is removed in a single bulk command.
 */
export type EraserMode = 'stroke' | 'object' | 'lasso';

/**
 * Reserved background-template field for a Drawing page. Phase 2 PR 2.3
 * defines the field on the type so multi-page data can carry it forward; the
 * UI for selecting backgrounds and the CSS rendering layer land in PR 2.5.
 */
export type DrawingBackground = 'blank' | 'grid' | 'lines' | 'dots';

/**
 * One page of a multi-page DrawingWidget. Each page owns its own object list
 * (which keeps undo/redo, selection, and rendering trivially page-scoped) plus
 * an optional per-page background (populated by Phase 2 PR 2.5). The `id` is
 * stable across reorders so per-page state (e.g. the command stack keyed by
 * page id) survives Move Left / Move Right operations.
 */
export interface DrawingPage {
  id: string;
  objects: DrawableObject[];
  /** Per-page background template (falls back to widget-level background). Populated by Wave 7. */
  background?: DrawingBackground;
  /**
   * User-provided title. When absent or empty after trim, the UI falls back
   * to a 1-indexed default of `"Page N"`. Kept optional so existing pages
   * (migration round 2.3+) need no upgrade pass to gain the field.
   */
  title?: string;
}

export interface DrawingConfig {
  /**
   * @deprecated Annotation mode is now an app-level overlay (not a widget).
   * Legacy widgets may have this set; it is otherwise unused and kept only
   * for backward compatibility.
   */
  mode?: 'window' | 'overlay';
  /**
   * Pen-only stroke list. **Active** for the per-widget annotation feature
   * (`WidgetData.annotation.paths` on DraggableWindow). **Deprecated** for the
   * DrawingWidget — `migrateDrawingConfig` strips this field and any data is
   * rewritten into `pages[0].objects` as `PathObject[]`.
   */
  paths?: Path[];
  /**
   * @deprecated post-2.3 — migrated into `pages[0].objects` by
   * `migrateDrawingConfig`. Kept on the type so older clients reading new
   * data continue to compile, and so the migration can detect un-paged docs.
   */
  objects?: DrawableObject[];
  /**
   * Pages of drawable objects. When absent on read, `migrateDrawingConfig`
   * wraps any legacy `objects[]` into `pages: [{ id, objects }]`. After
   * Phase 2 PR 2.3 this is always present post-migration.
   */
  pages?: DrawingPage[];
  /** Active page index. Defaults to 0. Clamped to `[0, pages.length - 1]`. */
  currentPage?: number;
  /**
   * Active drawing color. Always a real color string after Phase 2 PR 2.1b —
   * the legacy `'eraser'` overload is migrated away by `migrateDrawingConfig`.
   */
  color?: string;
  width?: number;
  customColors?: string[];
  /** Active tool. When absent, defaults to `'pen'`. */
  activeTool?: ShapeTool;
  /** Active eraser sub-tool. Defaults to `'stroke'` (legacy pixel eraser). */
  eraserMode?: EraserMode;
  /** If true, rect/ellipse render filled with the current color (stroke unchanged). Default false. */
  shapeFill?: boolean;
  /**
   * Widget-level default background template applied to a page when the
   * page's own `background` field is unset. Populated by Phase 2 PR 2.5.
   * Defaults to `'blank'` when absent.
   */
  background?: DrawingBackground;
  /**
   * Phase 2 PR 2.6 — set once the widget's `pages[].objects[]` have been
   * relocated to the Firestore subcollection (see
   * `utils/migrateDrawingToSubcollection.ts`). After migration, the
   * dashboard doc keeps `pages[]` as a denormalized cache (id + background
   * only — `objects[]` is dropped). One-way flag: never unset.
   */
  subcollectionMigrated?: boolean;
}

export interface QRConfig {
  url?: string;
  showUrl?: boolean;
  syncWithTextWidget?: boolean;
  qrColor?: string;
  qrBgColor?: string;
}

export interface EmbedConfig {
  url: string;
  mode?: string;
  html?: string;
  refreshInterval?: number;
  isEmbeddable?: boolean;
  blockedReason?: string;
  zoom?: number;
  autoplay?: boolean;
  /** Start playback at this offset (seconds). YouTube only — Drive's /preview iframe ignores it. */
  startAtSeconds?: number;
}

export interface BuildingPollDefaults {
  buildingId: string;
  question?: string;
  options?: PollOption[];
}

export interface PollGlobalConfig {
  buildingDefaults: Record<string, BuildingPollDefaults>;
}

export interface PollConfig {
  question: string;
  options: PollOption[];
  /**
   * Public device-voting session id. When non-null, a public poll session
   * is LIVE: the board shows aggregated tallies from
   * `poll_sessions/{teacherUid}_{activePollSessionId}/votes` and manual ±
   * voting is disabled. This id is also the `:pollId` route segment of the
   * participant join link.
   */
  activePollSessionId?: string | null;
  /**
   * Most recent session id. Kept after a session stops so "Resume" can
   * reopen the same `poll_sessions` doc (and its prior votes); "Restart"
   * mints a fresh id instead.
   */
  lastPollSessionId?: string | null;
}

/**
 * A single public-poll vote document
 * (`poll_sessions/{teacherUid}_{pollId}/votes/{participantUid}`). Keyed by the
 * anonymous voter's uid (one vote per device); the Firestore rules enforce the
 * exact `{optionIndex, votedAt}` shape.
 */
export interface PollVoteDoc {
  optionIndex: number;
  votedAt: number;
}

export type ActivityWallMode = 'text' | 'photo';
export type ActivityWallIdentificationMode =
  | 'anonymous'
  | 'name'
  | 'pin'
  | 'name-pin';

export type ActivityWallArchiveStatus =
  | 'firebase'
  | 'syncing'
  | 'archived'
  | 'failed';

export interface ActivityWallSubmission {
  id: string;
  content: string;
  submittedAt: number;
  status: 'approved' | 'pending';
  participantLabel?: string;
  storagePath?: string;
  archiveStatus?: ActivityWallArchiveStatus;
  archiveStartedAt?: number;
  driveFileId?: string;
  archiveError?: string;
  archivedAt?: number;
}

export interface ActivityWallActivity {
  id: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  moderationEnabled: boolean;
  identificationMode: ActivityWallIdentificationMode;
  submissions: ActivityWallSubmission[];
  startedAt: number | null;
  /**
   * Optional ClassLink class `sourcedId` this activity is targeted at
   * (Phase 3D). When present, the value is mirrored onto the
   * `activity_wall_sessions/{sessionId}` document so that students who
   * signed in via ClassLink see the activity on their `/my-assignments`
   * page, and Firestore rules (`passesStudentClassGate`) enforce that
   * only students enrolled in this class can read the session doc.
   * Empty/undefined preserves the classic code/PIN-style (`?data=`) flow.
   */
  classId?: string;
}

/**
 * Per-user Activity Wall library entry stored at
 * `/users/{userId}/activity_wall_activities/{activityId}`. Holds the
 * reusable activity definition only — submissions live in
 * `activity_wall_sessions/{teacherUid}_{activityId}/submissions/*` and
 * `startedAt` is per-session runtime state, so neither is persisted here.
 */
export interface ActivityWallLibraryEntry {
  id: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  moderationEnabled: boolean;
  identificationMode: ActivityWallIdentificationMode;
  /**
   * @deprecated Phase 3D single-class targeting. Prefer `classIds` (Phase 5A).
   * Retained so legacy entries created before multi-class support continue to
   * gate student access correctly. New entries written by post-Phase-5A clients
   * set `classIds` and mirror `classIds[0]` here.
   */
  classId?: string;
  /**
   * Phase 5A multi-class ClassLink targeting. When non-empty, mirrors the
   * session doc's `classIds` so students see this activity on their
   * `/my-assignments` page if enrolled in any of the listed classes.
   * Empty / absent preserves the classic code/PIN (`?data=`) flow.
   */
  classIds?: string[];
  /**
   * Roster IDs backing the multi-class targeting. Derived from ClassLink
   * roster metadata; stored for reverse lookup and future migration.
   */
  rosterIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ActivityWallBuildingConfig {
  defaultMode?: ActivityWallMode;
  defaultIdentificationMode?: ActivityWallIdentificationMode;
  defaultModerationEnabled?: boolean;
}

export interface ActivityWallGlobalConfig {
  buildingDefaults?: Record<string, ActivityWallBuildingConfig>;
  dockDefaults?: Record<string, boolean>;
}

export interface ActivityWallConfig {
  /**
   * @deprecated Activities now live in the per-user library collection
   * `/users/{userId}/activity_wall_activities/{activityId}` (see
   * `useActivityWallLibrary`). This field is retained only so legacy
   * widgets created before the library can be migrated on mount; the
   * widget clears it to `[]` after migration. Do not write new values
   * here.
   */
  activities?: ActivityWallActivity[];
  activeActivityId?: string | null;
  draftActivity?: ActivityWallActivity;
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
  /**
   * Per-activity memory of the teacher's last-selected ClassLink target
   * class (Phase 3D). Keyed by `ActivityWallActivity.id`. Used to
   * pre-populate the target-class selector when the teacher re-opens the
   * editor for an existing activity. Entries are cleared when the teacher
   * picks "No class" so the map stays small.
   */
  lastClassIdByActivityId?: Record<string, string>;
}

/**
 * Firestore document shape for `activity_wall_sessions/{sessionId}`.
 *
 * The teacher's Activity Wall widget writes this doc when an activity
 * becomes active so the student app (and the `/my-assignments` listing)
 * can discover the session's configuration without relying on a
 * base64-encoded URL payload. `classId`, when present, gates
 * ClassLink-authenticated student access via Firestore rules.
 */
export interface ActivityWallSession {
  id: string;
  activityId: string;
  teacherUid: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  moderationEnabled: boolean;
  identificationMode: ActivityWallIdentificationMode;
  updatedAt: number;
  /** See `ActivityWallActivity.classId` — omitted for code/PIN-only launches. */
  classId?: string;
  /**
   * When `true`, a `shared_activity_walls/{shareId}` doc references this
   * session as a view-only gallery. The Firestore rules use this flag to
   * unlock anonymous read access on submissions so gallery viewers can see
   * the work without joining the live session.
   */
  publiclyShared?: boolean;
}

/**
 * Firestore document shape for `shared_activity_walls/{shareId}`.
 *
 * Created by the teacher when they want to publish a view-only gallery
 * link to the submissions of an existing Activity Wall session. The
 * gallery viewer is unauthenticated (uses anonymous Firebase Auth) so the
 * doc carries everything the viewer needs to render the page without
 * touching the owning user's `/users/{uid}/...` collections.
 */
export interface SharedActivityWall {
  id: string;
  /** Activity wall session id (`${teacherUid}_${activityId}`). */
  sessionId: string;
  /** Teacher uid — used to gate update/delete. */
  originalAuthor: string;
  /** Snapshot of the activity's title at share time. */
  title: string;
  /** Snapshot of the activity's prompt at share time. */
  prompt: string;
  mode: ActivityWallMode;
  /**
   * Inherited from the parent activity. Gallery commenters identify
   * themselves the same way the original submitters did.
   */
  identificationMode: ActivityWallIdentificationMode;
  allowComments: boolean;
  allowCommentResponses: boolean;
  allowLikes: boolean;
  /** Millis epoch — `null` means the link never expires. */
  expiresAt: number | null;
  createdAt: number;
  /**
   * Teacher can revoke a link without deleting the doc, which keeps
   * existing comments/likes intact in case they want to re-enable later.
   */
  revoked?: boolean;
}

/**
 * Comment posted by a gallery viewer on a specific submission.
 * Lives at `shared_activity_walls/{shareId}/comments/{commentId}`.
 */
export interface ActivityWallComment {
  id: string;
  /** Submission this comment is attached to. */
  submissionId: string;
  /**
   * Parent comment id when this is a reply, or `null` for a top-level
   * comment. Replies are only allowed when the share has
   * `allowCommentResponses === true`.
   */
  parentCommentId: string | null;
  content: string;
  /** Display label built from the share's `identificationMode`. */
  participantLabel: string;
  /** Firebase auth uid of the commenter (anonymous uid for viewers). */
  authorUid: string;
  createdAt: number;
}

/**
 * Like on a submission within a shared gallery. Lives at
 * `shared_activity_walls/{shareId}/likes/{submissionId}__{authorUid}` —
 * the deterministic doc id enforces one-like-per-viewer-per-submission
 * without a separate counter document.
 */
export interface ActivityWallLike {
  id: string;
  submissionId: string;
  authorUid: string;
  createdAt: number;
}

export interface WebcamConfig {
  deviceId?: string;
  zoomLevel?: number;
  isMirrored?: boolean;
  autoSendToNotes?: boolean;
  isRemoteMode?: boolean;
  remoteCaptureDataUrl?: string;
  remoteCaptureTimestamp?: number;
}

export interface ScoreboardTeam {
  id: string;
  name: string;
  score: number;
  color?: string;
  linkedGroupId?: string;
}

export interface ScoreboardConfig {
  /** @deprecated use teams array instead */
  scoreA?: number;
  /** @deprecated use teams array instead */
  scoreB?: number;
  /** @deprecated use teams array instead */
  teamA?: string;
  /** @deprecated use teams array instead */
  teamB?: string;
  teams?: ScoreboardTeam[];
  /** Display layout: card grid or compact rows */
  layout?: 'cards' | 'rows';
  /** When set, indicates this scoreboard is being live-synced from a quiz widget */
  liveQuizWidgetId?: string;
}

export interface ExpectationsConfig {
  voiceLevel: number | null; // 0, 1, 2, 3, or 4
  workMode: 'individual' | 'partner' | 'group' | null;
  interactionMode:
    | 'none'
    | 'respectful'
    | 'listening'
    | 'productive'
    | 'discussion'
    | null;
  instructionalRoutine?: string; // Legacy/K-8
  activeRoutines?: string[]; // New: 9-12 Multi-select
  layout?: 'secondary' | 'elementary';
  syncSoundWidget?: boolean;
}

export interface ExpectationsOptionOverride {
  enabled: boolean;
  customLabel?: string;
  customSub?: string;
}

export interface ExpectationsBuildingConfig {
  volumeOverrides?: Record<number, ExpectationsOptionOverride>;
  groupOverrides?: Record<string, ExpectationsOptionOverride>;
  interactionOverrides?: Record<string, ExpectationsOptionOverride>;
  showVolume?: boolean;
  showGroup?: boolean;
  showInteraction?: boolean;
}

export interface ExpectationsGlobalConfig {
  buildings: Record<string, ExpectationsBuildingConfig>;
}

// --- WORK SYMBOLS ---

export interface WorkSymbolsConfig {
  selectedSymbolId: string | null;
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  titlePosition?: 'bottom' | 'top';
}

export interface WorkSymbol {
  id: string;
  title: string;
  imageUrl: string;
  /** Building IDs this symbol is available in. Empty = all buildings. */
  buildings: string[];
}

export interface WorkSymbolsGlobalConfig {
  symbols: WorkSymbol[];
}

// --- BLOOM'S TAXONOMY ---

export type BloomsLevelKey =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export type BloomsCategoryKey =
  | 'questionStems'
  | 'actionVerbs'
  | 'activityTypes'
  | 'assessmentIdeas'
  | 'iCanStatements'
  | 'dokAlignment';

export type BloomsContent = Partial<
  Record<BloomsLevelKey, Partial<Record<BloomsCategoryKey, string[]>>>
>;

export interface BloomsTaxonomyConfig {
  enabledCategories?: BloomsCategoryKey[];
  aiTopic?: string;
  themeColor?: string;
}

export interface BloomsDetailConfig {
  parentWidgetId: string;
  level: BloomsLevelKey;
  category?: BloomsCategoryKey;
  buildingId?: string;
}

export interface BloomsTaxonomyGlobalConfig {
  buildingDefaults?: Record<string, BloomsTaxonomyBuildingConfig>;
}

export interface BloomsTaxonomyBuildingConfig {
  contentOverrides?: BloomsContent;
  availableCategories?: BloomsCategoryKey[];
  aiEnabled?: boolean;
  defaultEnabledCategories?: BloomsCategoryKey[];
}

export interface TalkingToolStem {
  id: string;
  text: string;
}

export interface TalkingToolCategory {
  id: string;
  label: string;
  color: string;
  icon: string;
  stems: TalkingToolStem[];
}

export interface TalkingToolGlobalConfig {
  categories?: TalkingToolCategory[];
}

export interface WeatherConfig {
  temp: number;
  condition: string;
  isAuto?: boolean;
  locationName?: string;
  lastSync?: number | null;
  city?: string;
  source?: 'openweather' | 'earth_networks';
  feelsLike?: number;
  showFeelsLike?: boolean;
  hideClothing?: boolean;
  syncBackground?: boolean;
  fontFamily?: string;
  fontColor?: string;
}

export interface WeatherTemperatureRange {
  id: string;
  min: number;
  max: number;
  type?: 'range' | 'above' | 'below';
  message: string;
  imageUrl?: string;
}

export interface WeatherGlobalConfig {
  fetchingStrategy: 'client' | 'admin_proxy';
  updateFrequencyMinutes: number;
  temperatureRanges: WeatherTemperatureRange[];
  source?: 'openweather' | 'earth_networks';
  city?: string;
  showFeelsLike?: boolean;
}

export interface RecessGearTemperatureRange {
  id: string;
  min: number;
  max: number;
  type?: 'range' | 'above' | 'below';
  label: string;
  icon?: string;
  imageUrl?: string;
  category: 'clothing' | 'footwear' | 'accessory';
}

export interface RecessGearGlobalConfig {
  fetchingStrategy: 'client' | 'admin_proxy';
  updateFrequencyMinutes: number;
  temperatureRanges: RecessGearTemperatureRange[];
  source?: 'openweather' | 'earth_networks';
  city?: string;
  useFeelsLike?: boolean;
}

export interface GlobalWeatherData {
  temp: number;
  feelsLike?: number;
  condition: string;
  locationName: string;
  updatedAt: number;
  source?: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface WebcamGlobalConfig {
  // Config properties will go here if added in the future
}

export interface BuildingScheduleDefaults {
  buildingId: string;
  items: ScheduleItem[];
  schedules?: DailySchedule[];
}

export interface ScheduleGlobalConfig {
  buildingDefaults: Record<string, BuildingScheduleDefaults>;
}

// --- Embed Global Config ---
export interface BuildingEmbedDefaults {
  buildingId: string;
  hideUrlField?: boolean;
  whitelistUrls?: string[];
}

export interface EmbedGlobalConfig {
  buildingDefaults: Record<string, BuildingEmbedDefaults>;
}

// --- Reveal Grid Global Config ---
export interface BuildingRevealGridDefaults {
  buildingId: string;
  columns?: 2 | 3 | 4 | 5;
  revealMode?: 'flip' | 'fade';
  fontFamily?: GlobalFontFamily;
  defaultCardColor?: string;
  defaultCardBackColor?: string;
}

export interface RevealGridGlobalConfig {
  buildingDefaults: Record<string, BuildingRevealGridDefaults>;
}

// --- Breathing Global Config ---
export interface BuildingBreathingDefaults {
  buildingId: string;
  pattern?: '4-4-4-4' | '4-7-8' | '5-5';
  visual?: 'circle' | 'lotus' | 'wave';
  color?: string;
}

export interface BreathingGlobalConfig {
  buildingDefaults: Record<string, BuildingBreathingDefaults>;
}

// --- Clock Global Config ---
export interface BuildingClockDefaults {
  buildingId: string;
  format24?: boolean;
  fontFamily?: string;
  themeColor?: string;
  clockStyle?: 'modern' | 'lcd' | 'minimal';
  glow?: boolean;
}

export interface ClockGlobalConfig {
  buildingDefaults: Record<string, BuildingClockDefaults>;
}

// --- TimeTool (Timer/Stopwatch) Global Config ---
export interface BuildingTimeToolDefaults {
  buildingId: string;
  /** 'timer' counts down from `duration`; 'stopwatch' counts up from zero. */
  mode?: 'timer' | 'stopwatch';
  /** Digital readout vs the visual countdown ring. */
  visualType?: 'digital' | 'visual';
  duration?: number; // in seconds
  /** Alert sound played when a timer reaches zero. */
  selectedSound?: 'Chime' | 'Blip' | 'Gong' | 'Alert';
  /** Hex accent colour (a `WIDGET_PALETTE` value). */
  themeColor?: string;
  /** Whether the digits render with a neon glow. */
  glow?: boolean;
  /** Prefixed `FONTS`-id (e.g. `'font-mono'`); absence/`'global'` = inherit. */
  fontFamily?: string;
  /** Number-face style for the digital readout. */
  clockStyle?: 'modern' | 'lcd' | 'minimal';
  timerEndTrafficColor?: 'red' | 'yellow' | 'green' | null;
  timerEndTriggerRandom?: boolean;
  timerEndTriggerNextUp?: boolean;
  /** Rotate the first Stations widget when the timer ends. */
  timerEndTriggerStationsRotate?: boolean;
}

export interface TimeToolGlobalConfig {
  buildingDefaults: Record<string, BuildingTimeToolDefaults>;
}

// --- Checklist Global Config ---
export interface ChecklistDefaultItem {
  id: string;
  text: string;
}

export interface BuildingChecklistDefaults {
  buildingId: string;
  items?: ChecklistDefaultItem[]; // Default item labels pre-populated on widget creation
  scaleMultiplier?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
  cardColor?: string;
  cardOpacity?: number;
}

export interface ChecklistGlobalConfig {
  buildingDefaults: Record<string, BuildingChecklistDefaults>;
}

// --- Stations Global Config ---
export interface BuildingStationsDefaults {
  buildingId: string;
  /**
   * Stored in the shared `TypographySettings` value space — a `FONTS` id such
   * as `'font-sans'` / `'font-mono'`. The `'global'` sentinel (inherit from the
   * dashboard) is represented by absence/`undefined`, never the literal string.
   * Seeds `StationsConfig.fontFamily`, decoded at render via `getFontClass()`.
   */
  fontFamily?: string;
  fontColor?: string;
  cardColor?: string;
  cardOpacity?: number;
}

export interface StationsGlobalConfig {
  buildingDefaults: Record<string, BuildingStationsDefaults>;
}

// --- Sound Global Config ---
export interface BuildingSoundDefaults {
  buildingId: string;
  visual?: 'thermometer' | 'speedometer' | 'line' | 'balls';
  sensitivity?: number;
}

export interface SoundGlobalConfig {
  buildingDefaults: Record<string, BuildingSoundDefaults>;
}

// --- Note (text) Global Config ---
export interface BuildingNoteDefaults {
  buildingId: string;
  fontSize?: number;
  bgColor?: string;
  /**
   * Prefixed `FONTS`-id value (e.g. `'font-sans'`), matching the value space
   * the TextWidget toolbar / `getFontClass()` consume. `'global'` (inherit) is
   * persisted as absence, same as the Stations/NeedDoPutThen panels.
   */
  fontFamily?: string;
  fontColor?: string;
  verticalAlign?: 'top' | 'center' | 'bottom';
}

export interface NoteGlobalConfig {
  buildingDefaults: Record<string, BuildingNoteDefaults>;
}

// --- Traffic Light Global Config ---
export interface BuildingTrafficLightDefaults {
  buildingId: string;
  active?: 'red' | 'yellow' | 'green' | null;
}

export interface TrafficLightGlobalConfig {
  buildingDefaults: Record<string, BuildingTrafficLightDefaults>;
}

// --- Random Global Config ---
export interface BuildingRandomDefaults {
  buildingId: string;
  visualStyle?: 'flash' | 'slots' | 'wheel';
  soundEnabled?: boolean;
}

export interface RandomGlobalConfig {
  buildingDefaults: Record<string, BuildingRandomDefaults>;
}

// --- Dice Global Config ---
export interface BuildingDiceDefaults {
  buildingId: string;
  count?: number; // Default number of dice (1-6)
}

export interface DiceGlobalConfig {
  buildingDefaults: Record<string, BuildingDiceDefaults>;
}

// --- Scoreboard Global Config ---
export interface ScoreboardDefaultTeam {
  id: string;
  name: string;
  color?: string;
}

export interface BuildingScoreboardDefaults {
  buildingId: string;
  teams?: ScoreboardDefaultTeam[];
}

export interface ScoreboardGlobalConfig {
  buildingDefaults: Record<string, BuildingScoreboardDefaults>;
}

// --- Drawing Global Config ---
export interface BuildingDrawingDefaults {
  buildingId: string;
  width?: number;
  customColors?: string[];
}

export interface DrawingGlobalConfig {
  buildingDefaults: Record<string, BuildingDrawingDefaults>;
}

// --- QR Global Config ---
export interface BuildingQRDefaults {
  buildingId: string;
  defaultUrl?: string;
  qrColor?: string;
  qrBgColor?: string;
}

export interface QRGlobalConfig {
  buildingDefaults: Record<string, BuildingQRDefaults>;
}

// --- Materials Global Config ---
export interface BuildingMaterialsDefaults {
  buildingId: string;
  selectedItems?: string[]; // IDs of materials selected by default
}

export interface MaterialDefinition {
  id: string;
  label: string;
  icon: string;
  color: string;
  textColor?: string;
}

export interface MaterialsGlobalConfig {
  customMaterials?: MaterialDefinition[];
  buildingDefaults: Record<string, BuildingMaterialsDefaults>;
}

export interface CalendarGlobalEvent {
  id: string;
  date: string; // ISO Date string (YYYY-MM-DD)
  title: string;
}

export interface BuildingCalendarDefaults {
  buildingId: string;
  events: CalendarEvent[];
  googleCalendarIds?: string[];
  /** Latest events fetched from Google Calendar by an admin proxy */
  cachedEvents?: CalendarEvent[];
  /** Timestamp of the last successful proxy sync for this building */
  lastProxySync?: number;
}

export interface CalendarGlobalConfig {
  blockedDates: string[]; // Array of ISO Date strings (YYYY-MM-DD)
  buildingDefaults: Record<string, BuildingCalendarDefaults>;
  /** How often the admin proxy should refresh data (in hours) */
  updateFrequencyHours?: number;
  dockDefaults?: Record<string, boolean>;
}

export interface ScheduleConfig {
  /** @deprecated Use schedules instead. */
  items: ScheduleItem[];
  schedules?: DailySchedule[];
  localEvents?: CalendarEvent[];
  isBuildingSyncEnabled?: boolean;
  lastSyncedBuildingId?: string;
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  autoProgress?: boolean;
  /**
   * When true, the widget automatically scrolls to keep the active time slot
   * centered in the viewport, showing 1 completed + 1 active + 2 upcoming items.
   * Resets to the top each day as items re-activate based on the current time.
   */
  autoScroll?: boolean;
  /** Card background color as a hex string, e.g. '#ffffff'. Default: '#ffffff'. */
  cardColor?: string;
  /** Card background opacity, 0 (fully transparent) to 1 (fully opaque). Default: 1. */
  cardOpacity?: number;
  /** Persisted schedule tab selection in the settings panel. Not used by the front-face display. */
  settingsSelectedScheduleId?: string | null;
}

export interface CalendarConfig {
  events: CalendarEvent[];
  isBuildingSyncEnabled?: boolean;
  lastSyncedBuildingId?: string;
  daysVisible?: number;
  /** Individual Google Calendar IDs added by the user */
  personalCalendarIds?: string[];
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  /** Card background color as a hex string, e.g. '#ffffff'. Default: '#ffffff'. */
  cardColor?: string;
  /** Card background opacity, 0 (fully transparent) to 1 (fully opaque). Default: 1. */
  cardOpacity?: number;
}

export interface LunchMenuItem {
  name: string;
  /** Nutrislice CDN URL for the food's photo. Undefined when the menu entry has no image. */
  imageUrl?: string;
}

export interface LunchMenuDay {
  hotLunch: LunchMenuItem;
  /** Items served alongside the entree, in the order Nutrislice lists them, up to (but excluding) the bento alternative. */
  hotLunchSides: LunchMenuItem[];
  bentoBox: LunchMenuItem;
  date: string; // ISO String
}

export interface LunchCountConfig {
  schoolSite:
    | 'schumann-elementary'
    | 'orono-intermediate-school'
    | 'orono-middle-school'
    | 'orono-high-school';
  cachedMenu?: LunchMenuDay | null;
  lastSyncDate?: string | null;
  isManualMode: boolean;
  manualHotLunch: string;
  manualBentoBox: string;
  roster: string[]; // List of student names
  assignments: Record<string, 'hot' | 'bento' | 'home' | null>;
  recipient?: string;
  syncError?: string | null; // To display E-SYNC-404 etc.
  rosterMode?: 'class' | 'custom';
  /** Hour portion of the lunch time (e.g. "11") */
  lunchTimeHour?: string;
  /** Minute portion of the lunch time (e.g. "30") */
  lunchTimeMinute?: string;
  /** Selected grade level (K, 1, 2, MAC for Schumann; 3, 4, 5 for Intermediate) */
  gradeLevel?: string;
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
}

export interface BuildingClassesDefaults {
  buildingId: string;
  classLinkEnabled?: boolean;
}

export interface ClassesGlobalConfig {
  buildingDefaults: Record<string, BuildingClassesDefaults>;
}

export interface ClassesConfig {
  classLinkEnabled?: boolean;
}

export interface InstructionalRoutinesConfig {
  selectedRoutineId: string | null;
  customSteps: RoutineStep[];
  favorites: string[];
  scaleMultiplier: number;
  structure?: RoutineStructure;
  audience?: RoutineAudience;
}

export interface TimeToolConfig {
  mode: 'timer' | 'stopwatch';
  visualType: 'digital' | 'visual';
  duration: number; // in seconds
  elapsedTime: number; // in seconds
  isRunning: boolean;
  startTime?: number | null; // timestamp when last started (Date.now())
  selectedSound: 'Chime' | 'Blip' | 'Gong' | 'Alert';
  timerEndVoiceLevel?: number | null; // 0-4 voice level to set when timer ends
  timerEndTrafficColor?: 'red' | 'yellow' | 'green' | null;
  timerEndTriggerRandom?: boolean; // Whether to trigger random picker when timer ends
  timerEndTriggerNextUp?: boolean; // Whether to advance NextUp queue when timer ends
  timerEndTriggerStationsRotate?: boolean; // Whether to rotate the first Stations widget when timer ends
  themeColor?: string;
  glow?: boolean;
  fontFamily?: string;
  clockStyle?: 'modern' | 'lcd' | 'minimal';
  adjustStepSeconds?: number; // step size (in seconds) for the on-face +/- buttons; default 60
}

// 1. Define the Data Model for a Mini App
export interface MiniAppItem {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  order?: number;
  /**
   * Optional folder assignment (Wave 3). `null` or missing = root.
   * Refers to a folder id in `/users/{userId}/miniapp_folders/{folderId}`.
   */
  folderId?: string | null;
}

/**
 * A MiniAppItem published to the global library by an admin.
 * Lives in the `/global_mini_apps/{id}` Firestore collection.
 * `buildings` is a list of building IDs this app is targeted to;
 * an empty array means it is available to all buildings.
 * This field is always persisted (never omitted) so Firestore queries on it are reliable.
 */
export interface GlobalMiniAppItem extends MiniAppItem {
  buildings: string[];
  gradeLevels?: GradeLevel[];
}

// 2. Define the Widget Configuration
export interface MiniAppConfig {
  activeApp: MiniAppItem | null;
  /** True when activeApp was created via smart-paste and has not yet been saved to the library */
  activeAppUnsaved?: boolean;
  /** Persisted library grid/list toggle. */
  libraryViewMode?: 'grid' | 'list';
  /**
   * @deprecated Pre-unification memory, written as ClassLink class
   * `sourcedId`s. Read as a fallback (via `mapLegacyClassIdsToRosterIds`) to
   * seed the picker only when `lastRosterIdsByAppId` is absent; never written
   * by new code.
   */
  lastClassIdsByAppId?: Record<string, string[]>;
  /**
   * Remembers the last roster selection the teacher made per app, keyed by
   * appId. Used to pre-populate the picker on subsequent assigns.
   */
  lastRosterIdsByAppId?: Record<string, string[]>;
  /**
   * @deprecated The per-assignment Submissions toggle was removed when
   * `assignment-modes` shipped — Mini App's submission behavior is now
   * driven by the org-wide admin setting (see `getAssignmentMode`). New
   * code never writes this field; preserved on the type only for legacy
   * configs that may still carry it. Will be removed in a future major.
   */
  lastSubmissionsEnabledByAppId?: Record<string, boolean>;
}

/**
 * A persistent assignment session for a MiniApp.
 * Lives in the `/mini_app_sessions/{sessionId}` Firestore collection.
 * Created by teachers; read by students via the `/miniapp/{sessionId}` route.
 */
export interface MiniAppSession {
  id: string;
  appId: string;
  appTitle: string;
  appHtml: string;
  teacherUid: string;
  assignmentName: string;
  status: 'active' | 'ended';
  createdAt: number;
  endedAt?: number;
  /**
   * ClassLink class sourcedIds this session is targeted to. Present when the
   * teacher picked one or more classes in the assign modal; absent (or empty)
   * for shareable-link-only launches. Used by the student `/my-assignments`
   * feed (array-contains-any) to surface the session to every enrolled
   * student across any of the selected classes.
   */
  classIds?: string[];
  /**
   * Roster IDs backing this session (new unified path). Derived from the
   * teacher's picker selection; `classIds[]` above is derived from these
   * rosters' `classlinkClassId` for the SSO gate. Absent on legacy sessions.
   */
  rosterIds?: string[];
  /**
   * Whether the sandboxed mini-app iframe should show its Submit button and
   * accept student submissions into the `submissions/` subcollection. Absent
   * for legacy sessions (treated as `false` — view-only — by the runner).
   */
  submissionsEnabled?: boolean;
  /**
   * Frozen at creation from the org-wide `assignment-modes` admin setting.
   * Determines whether students see a tracked Share link (`'view-only'`) or
   * the full assignment experience (`'submissions'`). Absent on pre-feature
   * sessions; consumers must default to `'submissions'`.
   */
  mode?: AssignmentMode;
}

/**
 * A single student submission inside `/mini_app_sessions/{sessionId}/submissions/{submissionId}`.
 *
 * `submissionId` is:
 *   - The per-assignment HMAC pseudonym for ClassLink-authenticated students
 *     (returned from the `getAssignmentPseudonymV1` Cloud Function). Stable
 *     within the assignment so a student cannot double-submit but unlinkable
 *     across assignments without the server HMAC secret.
 *   - The anonymous Firebase Auth UID for legacy shared-link launches. Also
 *     stable per-device per-session.
 *
 * No PII is ever persisted — the submission shape is deliberately opaque.
 */
export interface MiniAppSubmission {
  submittedAt: number;
  /**
   * The submitting student's Firebase Auth uid. Matches `request.auth.uid` at
   * write time. For studentRole (ClassLink) launches this is the ephemeral
   * per-session SSO uid — the stable identity is the doc ID (pseudonym). For
   * anonymous launches this equals the doc ID. Firestore rules key self-reads
   * off this field so studentRole users can read their own submission back
   * via the completion check in /my-assignments without exposing anyone
   * else's submission.
   */
  studentUid: string;
  /**
   * Payload forwarded from the sandboxed iframe's postMessage. Always a
   * top-level object because Firestore rules enforce `payload is map`;
   * scalar/array payloads from the iframe are wrapped in `{ value }` by
   * the submission handler before persisting.
   */
  payload: Record<string, unknown>;
}

export interface PdfItem {
  id: string;
  name: string;
  storageUrl: string;
  storagePath: string;
  size: number;
  uploadedAt: number;
  order?: number;
}

export interface GlobalPdfItem extends PdfItem {
  buildings?: string[];
  createdAt?: number;
}

export interface PdfGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

export interface BreathingConfig {
  pattern: '4-4-4-4' | '4-7-8' | '5-5';
  visual: 'circle' | 'lotus' | 'wave';
  color: string;
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
}

// --- MATH TOOLS TYPES ---

/** All individual math manipulative types available in the Math Tools suite */
export type MathToolType =
  | 'ruler-in' // 12-inch ruler (standard)
  | 'ruler-cm' // 30 cm metric ruler
  | 'protractor' // 180° semicircular protractor
  | 'number-line' // Interactive number line
  | 'base-10' // Base-10 blocks (units, rods, flats)
  | 'fraction-tiles' // Fraction bar tiles
  | 'geoboard' // Virtual geoboard with pegs
  | 'pattern-blocks' // Pattern blocks (hexagons, trapezoids, etc.)
  | 'algebra-tiles' // Algebra tiles (x², x, 1 tiles)
  | 'coordinate-plane' // Cartesian coordinate plane
  | 'calculator'; // Basic four-function calculator

/** Default grade levels for each individual math tool */
export type MathToolGradeLevels = Record<MathToolType, GradeLevel[]>;

/** Global admin config for the mathTools widget – stored in feature_permissions */
export interface MathToolsGlobalConfig {
  /** Per-tool grade level overrides (which building levels can see each tool) */
  toolGradeLevels?: Partial<MathToolGradeLevels>;
  /**
   * DPI calibration factor per building (pixels per CSS inch).
   * Defaults to 96 (the CSS spec reference pixel).
   * Admins can calibrate this for their specific IFP hardware.
   */
  dpiCalibration?: number;
}

/** Config for the mathTools PALETTE widget (the toolbox that launches tools) */
export interface MathToolsConfig {
  /** DPI calibration override stored locally; admin may override at building level */
  dpiCalibration?: number;
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
}

/** Number line display mode */
export type NumberLineMode = 'integers' | 'decimals' | 'fractions';

export interface PlaceValueBlock {
  id: string;
  type: '1' | '10' | '100' | '1000';
  x: number;
  y: number;
}

/** Config for an individual mathTool widget instance */
export interface MathToolConfig {
  /** Which math tool this instance displays */
  toolType: MathToolType;
  /**
   * Pixels per physical inch used for true-scale rendering.
   * Defaults to 96 (CSS reference pixel = 1in exactly per CSS spec).
   * Can be calibrated per-device in widget settings.
   */
  pixelsPerInch?: number;
  /** Ruler measurement system ('in' | 'cm' | 'both') — for ruler tools */
  rulerUnits?: 'in' | 'cm' | 'both';
  /** Number line mode — for number-line tool */
  numberLineMode?: NumberLineMode;
  /** Number line range minimum — for number-line tool */
  numberLineMin?: number;
  /** Number line range maximum — for number-line tool */
  numberLineMax?: number;
  /** Rotation angle in degrees (0–360) — for measurement tools */
  rotation?: number;
  /** Fraction denominator — for fraction-tiles tool */
  fractionDenominator?: number;
  /** Calculator display string */
  calcDisplay?: string;
  /** Calculator expression accumulator */
  calcExpression?: string;
  /** If true, render as a bare sticker without widget header chrome */
  stickerMode?: boolean;
  /** For manipulative piece stickers – identifies the specific piece (e.g. 'unit', 'rod', '1-2', 'hexagon') */
  stickerPiece?: string;
  placeValueBlocks?: PlaceValueBlock[];
  placeValueColumns?: string[];
}

export interface PdfConfig {
  activePdfId: string | null;
  activePdfUrl: string | null;
  activePdfName: string | null;
}

export interface MaterialsConfig {
  selectedItems: string[];
  activeItems: string[];
  title?: string;
  titleFont?: string;
  titleColor?: string;
}

export interface CatalystRoutine {
  id: string;
  title: string;
  icon?: string;
  buttonColor?: string;
  iconColor?: string;
  imageUrl?: string;
  description?: string;
  widgets: Omit<WidgetData, 'id'>[];
  createdAt: number;
}

export interface CatalystSet {
  id: string;
  title: string;
  imageUrl?: string;
  description?: string;
  routines: CatalystRoutine[];
  createdAt: number;
}

export type CatalystConfig = {
  initialSetId?: string;
};

export interface CatalystGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

export interface CatalystInstructionConfig {
  routineId: string;
  stepIndex: number;
  title?: string;
  instructions?: string;
}

export interface CatalystVisualConfig {
  routineId: string;
  stepIndex: number;
  title?: string;
  icon?: string;
  category?: string;
}

export interface StickerConfig {
  url?: string;
  icon?: string;
  color?: string;
  label?: string;
  rotation?: number;
  size?: number;
}

export interface StickerBookConfig {
  uploadedUrls?: string[];
  favorites?: string[];
  stickerOrder?: string[];
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
}

export interface GlobalSticker {
  url: string;
  gradeLevels?: GradeLevel[];
}

export interface StickerGlobalConfig {
  globalStickers?: (string | GlobalSticker)[];
}

export interface FurnitureItem {
  id: string;
  type: 'desk' | 'table-rect' | 'table-round' | 'rug' | 'teacher-desk';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
}

export type SeatingChartTemplate = 'freeform' | 'rows' | 'horseshoe' | 'pods';

export interface BuildingSeatingChartDefaults {
  buildingId: string;
  rosterMode?: 'class' | 'custom';
}

export interface SeatingChartGlobalConfig {
  buildingDefaults?: Record<string, BuildingSeatingChartDefaults>;
}

export interface SeatingChartConfig {
  furniture: FurnitureItem[];
  assignments: Record<string, string>; // studentId -> furnitureId
  gridSize: number;
  rosterMode?: 'class' | 'custom';
  names?: string; // Line separated names for custom roster
  template?: SeatingChartTemplate;
  templateColumns?: number; // Number of columns for 'rows' template
}

/**
 * A lesson/section within an imported notebook. SMART Notebook files group
 * their pages into lessons (e.g. "9.1", "Review") in their imsmanifest.xml;
 * the importer preserves that grouping (from the raw manifest, or from a
 * converted .spartnb bundle's manifest.json) so the Viewer can offer lesson
 * navigation. Optional — notebooks imported without section metadata simply
 * have no sections.
 */
export interface NotebookSection {
  /** Lesson/section title from the source notebook. */
  title: string;
  /** 0-based index of this section's first page within pageUrls. */
  startIndex: number;
  /** Number of pages in this section. */
  pageCount: number;
}

export interface NotebookItem {
  id: string;
  title: string;
  pageUrls: string[];
  pagePaths: string[];
  assetUrls?: string[];
  createdAt: number;
  /** Optional lesson grouping; present when the imported file carried it. */
  sections?: NotebookSection[];
  /**
   * Object-to-page hyperlinks authored in edit mode. In present mode each
   * link renders as an invisible clickable hotspot over the page image
   * (positioned by xFrac/yFrac/wFrac/hFrac of the page's intrinsic size)
   * that jumps to `targetPage` when tapped. The hotspot box is captured at
   * link creation; it does not auto-track subsequent moves of the linked
   * object (re-link to refresh).
   */
  objectLinks?: NotebookObjectLink[];
}

export interface NotebookObjectLink {
  /** Stable id for this link, separate from objectId so the same object
   *  could in principle carry multiple hotspots in the future. */
  id: string;
  /** data-edit-id of the linked SVG object (assigned by the page editor). */
  objectId: string;
  /** 0-based page index the link lives on. */
  sourcePage: number;
  /** 0-based page index to jump to when the hotspot is clicked. */
  targetPage: number;
  /** Hotspot box, normalized [0..1] against the page's intrinsic dims. */
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
}

/**
 * An asset image placed on a notebook page (from the Assets panel). Position
 * and size are stored as fractions of the rendered page rectangle so they track
 * the page across widget resizes and maximize. Scoped to a specific notebook +
 * page, persisted per widget instance in SmartNotebookConfig.placedAssets.
 */
export interface PlacedNotebookAsset {
  id: string;
  notebookId: string;
  /** 0-based page index the asset is placed on. */
  page: number;
  url: string;
  /** Top-left position as a fraction of page width/height [0..1]. */
  xFrac: number;
  yFrac: number;
  /** Width as a fraction of page width (0..1]; height follows the image ratio. */
  wFrac: number;
}

export interface SmartNotebookConfig {
  activeNotebookId: string | null;
  storageLimitMb?: number;
  /**
   * Appearance fields, surfaced via the shared `TypographySettings` /
   * `SurfaceColorSettings` primitives in `SmartNotebookAppearanceSettings`.
   * These are user-level only and are intentionally NOT admin-configurable
   * per building: the widget renders imported SMART pages as image/SVG and
   * has no themed text/surface chrome to apply them to, so there is no
   * per-building default worth exposing. See `BuildingSmartNotebookDefaults`
   * (storage limit only) and the `case 'smartNotebook'` handler in
   * `utils/adminBuildingConfig.ts`.
   */
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
  /** Library layout preference; persists per widget instance. Defaults to cards. */
  libraryDisplayMode?: 'cards' | 'list';
  /** Assets placed on pages (Assets panel → page overlay), per widget instance. */
  placedAssets?: PlacedNotebookAsset[];
}

/**
 * A notebook published for staff sharing, stored at `/shared_notebooks/{shareId}`.
 * Pages/assets reference the original author's Storage download URLs (the
 * token in each URL grants cross-user read), so no files are duplicated to
 * create the share. A recipient pastes `${origin}/share/notebook/{shareId}` to
 * import a copy. Mirrors the shared_quizzes / shared_assignments shape.
 */
export interface SharedNotebook {
  title: string;
  pageUrls: string[];
  assetUrls?: string[];
  sections?: NotebookSection[];
  /**
   * Object-to-page hyperlinks authored by the original teacher. Page indices
   * (sourcePage/targetPage) and normalized hotspot fractions stay valid across
   * a copy import because the importer preserves page order, and the linked
   * SVG objects' `data-edit-id`s round-trip unchanged through the re-upload.
   */
  objectLinks?: NotebookObjectLink[];
  originalAuthor: string;
  sharedAt: number;
}

export interface BuildingSmartNotebookDefaults {
  buildingId: string;
  storageLimitMb?: number; // Admin-only: MB limit for notebook file uploads
  // No appearance defaults (cardColor/cardOpacity/fontFamily/fontColor):
  // SmartNotebook renders image/SVG pages and does not theme any surface or
  // text, so per-building appearance defaults would set values the widget
  // never reads. Those fields stay user-level only — see SmartNotebookConfig.
}

export interface SmartNotebookGlobalConfig {
  buildingDefaults?: Record<string, BuildingSmartNotebookDefaults>;
}

export interface RecessGearConfig {
  linkedWeatherWidgetId?: string | null;
  useFeelsLike?: boolean;
}

// --- QUIZ TYPES ---

/**
 * Question types supported in the quiz widget.
 * MC = Multiple Choice, FIB = Fill in the Blank,
 * Matching = Match left to right, Ordering = Place items in correct sequence,
 * short = single-paragraph written response (manually graded),
 * essay = multi-paragraph written response (manually graded).
 */
export type QuizQuestionType =
  | 'MC'
  | 'FIB'
  | 'Matching'
  | 'Ordering'
  | 'short'
  | 'essay';

/**
 * True iff the question type requires manual teacher grading
 * (i.e. there is no auto-grader for student responses).
 */
export function isWrittenQuestionType(type: QuizQuestionType): boolean {
  return type === 'short' || type === 'essay';
}

export interface QuizQuestion {
  id: string;
  /** Time limit in seconds. 0 = no time limit. */
  timeLimit: number;
  text: string;
  type: QuizQuestionType;
  /**
   * MC/FIB: the correct answer text.
   * Matching: pipe-separated pairs "term1:def1|term2:def2"
   * Ordering: pipe-separated items in correct order "item1|item2|item3"
   * short/essay: always empty string (no key — graded manually).
   */
  correctAnswer: string;
  /** MC only: up to 4 incorrect answer choices */
  incorrectAnswers: string[];
  /** Point value for this question. Defaults to 1 if not set. */
  points?: number;
  /**
   * Matching only. Extra incorrect definitions added to the student's
   * word bank to increase difficulty (e.g., 3 terms but 6 definitions).
   * Empty/undefined = no distractors. Stored separately so they can never
   * be mistakenly read as correct pairs.
   */
  matchingDistractors?: string[];
  /**
   * Per-question opt-in for partial credit on Matching/Ordering. Ignored
   * for MC/FIB/short/essay. Defaults to false.
   */
  allowPartialCredit?: boolean;
  /**
   * short/essay only. Optional placeholder shown inside the student's
   * editor (e.g. "Cite at least two pieces of evidence.").
   */
  placeholder?: string;
  /**
   * short/essay only. Soft cap shown in the editor's word counter.
   * Not enforced server-side; the student can exceed it. Undefined or 0
   * means no cap is displayed.
   */
  maxWords?: number;
}

/**
 * Result of grading a student's answer to a single quiz question.
 * Replaces the legacy boolean return so partial credit (Matching / Ordering)
 * can be expressed without changing wire formats.
 */
export interface GradeResult {
  /** True iff the answer earned full credit. */
  isCorrect: boolean;
  /** Points actually awarded (fractional ok). */
  pointsEarned: number;
  /** Max points for this question (= q.points ?? 1). */
  pointsMax: number;
}

/** Full quiz data stored in Google Drive as JSON */
export interface QuizData {
  id: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Synchronized-quiz linkage on a library quiz. Present iff the quiz
 * participates in a `/synced_quizzes/{groupId}` group shared with one
 * or more PLC peers. Edits by any participant publish to the canonical
 * doc and bump its `version`; library cards show a "Sync available"
 * pill when `lastSyncedVersion < group.version`.
 *
 * Modeled as a single optional sub-object (rather than two parallel
 * optional fields) so the type forbids partial states like "synced but
 * no version" or "version but no group" — both fields are required or
 * neither is present.
 */
export interface QuizMetadataSyncLinkage {
  /** Doc id under `/synced_quizzes/{groupId}`. */
  groupId: string;
  /**
   * The `version` of the canonical group doc this local Drive replica
   * was last reconciled with. Used as a stale-detector against the
   * canonical's live `version`.
   */
  lastSyncedVersion: number;
}

/** Lightweight metadata stored in Firestore (avoids Drive API on every list) */
export interface QuizMetadata {
  id: string;
  title: string;
  driveFileId: string;
  questionCount: number;
  createdAt: number;
  updatedAt: number;
  /**
   * Optional folder assignment (Wave 3). `null` or missing = root.
   * Refers to a folder id in `/users/{userId}/quiz_folders/{folderId}`.
   */
  folderId?: string | null;
  /** Synchronized-quiz linkage; see `QuizMetadataSyncLinkage`. */
  sync?: QuizMetadataSyncLinkage;
  /** Behavior settings authored in the editor; synced to PLC members. */
  behavior?: QuizBehaviorSettings;
  /**
   * Optional manual ordering index for drag-reorder in the Library view.
   * Omitted for quizzes never manually reordered.
   */
  order?: number;
}

export type QuizSessionStatus = 'waiting' | 'active' | 'paused' | 'ended';
export type QuizSessionMode = 'teacher' | 'auto' | 'student';

/**
 * Common session-level toggles applicable to any assignment widget that
 * mirrors the Quiz pattern. Currently extended by `QuizSessionOptions`
 * and `VideoActivitySessionOptions`; other widgets may opt in by
 * extending too. Keep this surface small — only fields with the same
 * semantics across widgets belong here; widget-specific knobs go on the
 * per-widget extension type.
 */
export interface BaseSessionOptions {
  tabWarningsEnabled?: boolean;
  /**
   * Block copy / cut / paste in the student answer UI. Adds a layer of test
   * integrity alongside tab-switch detection — a student can't switch to
   * another tab, compose an answer there, then paste a block of text back in.
   * Default false (copy/paste allowed) preserves the pre-existing behavior.
   */
  blockCopyPaste?: boolean;
  showResultToStudent?: boolean;
  showCorrectAnswerToStudent?: boolean;
  showCorrectOnBoard?: boolean;
  /**
   * Randomize the order of questions per student per attempt. When on, every
   * student in the class sees questions in their own order, and each retake
   * by the same student gets a fresh order too. (Self-paced quiz only —
   * teacher-paced/auto sessions ignore this toggle.)
   */
  shuffleQuestions?: boolean;
  /**
   * Randomize the order of answer options (MC choices, Matching right side,
   * Ordering items) per student per attempt. Independent of the always-on
   * teacher-client shuffle in `toPublicQuestion`; this toggle controls the
   * second per-student shuffle that runs in the student client. Default
   * (when the field is absent on legacy/in-flight sessions) is treated as
   * ON to preserve pre-toggle behavior.
   */
  shuffleAnswerOptions?: boolean;
}

/** Options passed from the quiz assignment modal to configure session toggles. */
export interface QuizSessionOptions extends BaseSessionOptions {
  speedBonusEnabled?: boolean;
  streakBonusEnabled?: boolean;
  showPodiumBetweenQuestions?: boolean;
  soundEffectsEnabled?: boolean;
}

/**
 * Behavior settings that travel WITH a quiz (authored in the editor, synced
 * to PLC members). Distinct from per-assignment targeting (class periods,
 * dueAt) which is chosen at Assign time. Snapshotted onto the assignment/
 * session docs at create time, so editing these later only affects FUTURE
 * assigns (freeze-live).
 */
export interface QuizBehaviorSettings {
  sessionMode: QuizSessionMode;
  sessionOptions: QuizSessionOptions;
  /** null = unlimited; positive int = hard cap. */
  attemptLimit: number | null;
}

/**
 * Student-safe question stored in the session document.
 * Never contains correctAnswer so students cannot cheat by inspecting
 * Firestore/network traffic. Answer choices are pre-shuffled by the teacher
 * client at session-create time (in `toPublicQuestion`) before the doc is
 * written to Firestore.
 */
export interface QuizPublicQuestion {
  id: string;
  type: QuizQuestion['type'];
  text: string;
  timeLimit: number;
  /** MC only: all answer choices pre-shuffled (correct identity unknown) */
  choices?: string[];
  /** Matching only: left-side terms (prompt side) */
  matchingLeft?: string[];
  /**
   * Matching only: right-side definitions, pre-shuffled and merged with any
   * teacher-provided distractors. Distractors are intentionally NOT exposed
   * as a separate field on the public payload — that would let a student
   * read off the exact wrong options from devtools.
   */
  matchingRight?: string[];
  /** Ordering only: items to sequence, pre-shuffled */
  orderingItems?: string[];
  /** short/essay only: optional editor placeholder */
  placeholder?: string;
  /** short/essay only: optional soft word cap shown in the editor */
  maxWords?: number;
  /** short/essay only: max points the teacher can award. */
  points?: number;
}

export interface QuizLeaderboardEntry {
  /** Optional — SSO `studentRole` joiners have no PIN; identity is `name`. */
  pin?: string;
  /**
   * Auth uid of the student who owns this row. Lets the student-side
   * leaderboard highlight "my row" for SSO joiners (whose `pin` is missing)
   * by matching `auth.currentUser.uid` instead of a roster PIN.
   */
  studentUid?: string;
  name?: string;
  score: number;
  rank: number;
}

/** Live quiz session document in Firestore (/quiz_sessions/{sessionId}) */
export interface QuizSession {
  id: string; // session UUID (same as QuizAssignment.id)
  /** FK back to /users/{teacherUid}/quiz_assignments/{assignmentId}. 1:1 with session. */
  assignmentId: string;
  quizId: string;
  quizTitle: string;
  teacherUid: string;
  status: QuizSessionStatus;
  sessionMode: QuizSessionMode;
  /** -1 = lobby/waiting room, 0+ = currently displayed question index */
  currentQuestionIndex: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Timestamp when the session will automatically advance (auto-progress mode) */
  autoProgressAt?: number | null;
  /** Short alphanumeric code students use to join */
  code: string;
  totalQuestions: number;
  /**
   * Student-safe questions (no correctAnswer) so the session document can be
   * read by students without leaking the answer key. Teachers grade using the
   * full QuizData loaded from Drive, not from this field.
   */
  publicQuestions: QuizPublicQuestion[];

  /**
   * True once at least one Schoology LTI student has launched this session and
   * the launch carried an NRPS membership endpoint (set server-side by the
   * launch-exchange CF). Signals the teacher monitor to resolve Schoology
   * student names on-read via `ltiResolveNamesForAssignmentV1`. Absent/false on
   * every non-LTI session, so the monitor skips that call entirely. No PII —
   * just a routing flag.
   */
  ltiNrps?: boolean;

  // ─── Toggles (Phase 1) ─────────────────────────────────────────────────────
  /** Whether tab-switch detection is active on student devices (default true) */
  tabWarningsEnabled?: boolean;
  /**
   * Block copy / cut / paste in the student quiz UI (default false). Mirrored
   * from the assignment's `sessionOptions.blockCopyPaste` so the student
   * client doesn't need a second fetch.
   */
  blockCopyPaste?: boolean;
  /** Show right/wrong indicator to students after they submit (default false) */
  showResultToStudent?: boolean;
  /** Reveal the correct answer text to students after submit (default false) */
  showCorrectAnswerToStudent?: boolean;
  /** Show the correct answer on the teacher's projected board (default false) */
  showCorrectOnBoard?: boolean;
  /**
   * Teacher-written map of questionId → correct answer text.
   * Students read from this after submitting; only populated when the
   * teacher reveals an answer.
   */
  revealedAnswers?: Record<string, string>;

  // ─── Gamification (Phase 2) ─────────────────────────────────────────────────
  /** Award bonus points for fast answers (default false) */
  speedBonusEnabled?: boolean;
  /** Award streak multipliers for consecutive correct answers (default false) */
  streakBonusEnabled?: boolean;
  /** Show a podium/leaderboard between questions (default false) */
  showPodiumBetweenQuestions?: boolean;
  /** Play sound effects during the quiz (default false) */
  soundEffectsEnabled?: boolean;
  /**
   * Per-student per-attempt question-order shuffle (default false / absent).
   * Mirrored from the assignment's `sessionOptions.shuffleQuestions` so the
   * student client doesn't need a second fetch.
   */
  shuffleQuestions?: boolean;
  /**
   * Per-student per-attempt answer-option shuffle. Absent on legacy sessions
   * — consumers must default to `true` to preserve the pre-toggle behavior
   * (the second client-side shuffle was always on before this flag landed).
   */
  shuffleAnswerOptions?: boolean;
  /** Current phase within a question: 'answering' (default) or 'reviewing' (between-question review) */
  questionPhase?: 'answering' | 'reviewing';
  /** Top-N leaderboard snapshot broadcast by the teacher for student view. */
  liveLeaderboard?: QuizLeaderboardEntry[];

  // ─── Multi-class period support ─────────────────────────────────────────────
  /** Selected class period roster names available for students to join. */
  periodNames?: string[];

  // ─── ClassLink target class (Phase 3A, Phase 5A multi-class) ───────────────
  /**
   * @deprecated Phase 5A — retained only for transitional compatibility.
   * Populated to `classIds[0]` when `classIds` is non-empty so older clients
   * and pre-migration Firestore rules keep working. Prefer `classIds`.
   */
  classId?: string;
  /**
   * Multi-class ClassLink target: the list of ClassLink class `sourcedId`s
   * this session is targeted at. When non-empty, students who signed in via
   * the ClassLink / Google flow will see this session on their
   * `/my-assignments` page, and Firestore rules (via
   * `passesStudentClassGateList`) enforce that the student has at least one
   * of these classes in their `classIds` auth-token claim. An empty or
   * missing list preserves the classic code/PIN-only flow — the gate is a
   * no-op for non-studentRole users.
   */
  classIds?: string[];
  /**
   * Roster IDs backing this session (unified targeting). `classIds` above is
   * derived from these rosters' `classlinkClassId` metadata.
   */
  rosterIds?: string[];
  /**
   * Map from each targeted classId (`classlinkClassId` or `testClassId`) to
   * its corresponding roster name (= period name). SSO students read this
   * at join time to write `classPeriod` directly onto their response doc,
   * matching the snapshot-at-write-time semantics of the anonymous PIN
   * flow. Empty/missing for legacy sessions and for sessions with no
   * SSO-eligible rosters — those fall back to teacher-side roster
   * enrichment in `QuizResults`.
   */
  classPeriodByClassId?: Record<string, string>;

  /**
   * Max completed submissions allowed per student (mirrored from the
   * assignment so student-side code can read it without a second fetch).
   * `null`/`undefined` = unlimited (legacy sessions).
   */
  attemptLimit?: number | null;

  /**
   * Frozen at creation from the org-wide `assignment-modes` admin setting.
   * Determines whether students see a tracked Share link (`'view-only'`) or
   * the full live-quiz experience (`'submissions'`). Absent on pre-feature
   * sessions; consumers must default to `'submissions'`.
   */
  mode?: AssignmentMode;
  /**
   * Mirror of `QuizAssignment.scoreVisibility`. Absent / `'none'` means
   * scores have not been published to students yet. Read by the student
   * `/my-assignments` Completed review screen to decide which fields
   * (score / per-answer correctness / correct-answer text) to surface.
   *
   * `revealedAnswers` (above) is the source of truth for correct-answer
   * text when `scoreVisibility === 'score-responses-and-answers'` —
   * `publishAssignmentScores` populates it with every question's
   * canonical answer in one batch.
   */
  scoreVisibility?: QuizScoreVisibility;
  /**
   * Mirror of QuizAssignment.protection so the student app — which only reads
   * /quiz_sessions — can decide whether to mount watermark + tab-warning UI.
   * Cleared by `unpublishAssignmentScores`.
   */
  protection?: ResultsProtection;
  /**
   * Server-set timestamp for the most recent `publishAssignmentScores` call.
   * Mirrored from the assignment doc so the student app (which only reads
   * `/quiz_sessions`) can stamp the watermark with a publish time without
   * needing access to the teacher's assignment doc. Cleared by
   * `unpublishAssignmentScores`.
   */
  scorePublishedAt?: number;
  /**
   * Set when this assignment is attached to a Google Classroom coursework
   * item via the add-on. Drives the "Push grades to Google Classroom" action
   * in the Results view. `maxPoints` is the quiz's total point value (the
   * grade scale) so a pushed grade reads identically in Classroom (e.g.
   * 17/20, not a percentage out of 100). Mirrored onto the matching
   * `QuizAssignment` doc.
   */
  classroomAttachment?: ClassroomAttachmentLink;
  /**
   * Item D part 2: when posted to MULTIPLE Google courses (one per linked
   * ClassLink class), every attachment is recorded here. Read via
   * `getClassroomAttachments()`, which falls back to the singular
   * `classroomAttachment` (single-course + student-initiated) for back-compat.
   */
  classroomAttachments?: ClassroomAttachmentLink[];
  /**
   * Set server-side (launch-exchange CF) when a Schoology LTI student launches
   * this assignment. Carries the resource-link id needed to resolve each
   * student's AGS line item, so the teacher can push grades to the Schoology
   * gradebook from the dashboard Results view — the LTI analogue of
   * `classroomAttachment`. No PII; just routing ids. The grade scale
   * (`maxPoints`) is derived from the quiz at push time, not stored here.
   */
  ltiAttachment?: LtiAttachmentLink;
}

/**
 * Linkage between a SpartBoard quiz assignment and a Google Classroom
 * coursework attachment created via the add-on. Persisted on BOTH the
 * `QuizSession` (read by the Results monitor) and the per-teacher
 * `QuizAssignment` doc (the teacher-owned archive copy).
 */
export interface ClassroomAttachmentLink {
  attachmentId: string;
  courseId: string;
  itemId: string;
  /** = the quiz's total points; the grade scale pushed grades are capped to. */
  maxPoints: number;
  attachedAt?: number;
  /**
   * True ONLY for the partner-first assign flow, where SpartBoard CREATED the
   * parent courseWork (`itemId`) and therefore may set its `assignedGrade` +
   * return it — the FINAL-grade ("Publish = Push") path. Absent for
   * student-initiated attachments (the teacher's Classroom composer owns the
   * courseWork, so Google rejects assignedGrade patches); those use the DRAFT
   * pointsEarned path via the manual "Push grades" button instead.
   */
  ownsCourseWork?: boolean;
}

/**
 * Linkage between a SpartBoard assignment and a Schoology LTI 1.3 resource
 * link, captured server-side on the first student launch. Drives the "Push to
 * Schoology" action in the Results view (the AGS analogue of
 * `ClassroomAttachmentLink`). Persisted on the session doc (`QuizSession` /
 * `VideoActivitySession`). The per-student AGS line item is resolved from
 * `lti_grade_links/{pseudonymUid}/resources/{resourceLinkId}`, so only the
 * `resourceLinkId` (+ originating context) needs to live here. No PII.
 */
export interface LtiAttachmentLink {
  /** The Schoology resource-link id; keys each student's AGS line item. */
  resourceLinkId: string;
  /** The Schoology context (course) id the attachment was launched in. */
  contextId?: string;
}

export interface QuizResponseAnswer {
  questionId: string;
  /** MC/FIB: string. Matching: "term1:def1|term2:def2". Ordering: "item1|item2|item3" */
  answer: string;
  answeredAt: number;
  /**
   * Not written by the student (to prevent client-side forgery).
   * Always recomputed from the question + answer using gradeAnswer() on the
   * teacher / results side. Optional so existing Firestore documents with a
   * stored value are still valid.
   */
  isCorrect?: boolean;
  /** Percentage speed bonus earned from answering quickly (0–50 means +0% to +50%). */
  speedBonus?: number;
  /**
   * Distinguishes a debounced autosave draft (written-response only) from an
   * explicit submit. Missing on legacy docs written before drafts existed and
   * on MC/FIB/Matching/Ordering answers (those have no autosave path) —
   * treat missing as `'submitted'` via {@link isAnswerSubmitted}.
   */
  status?: 'draft' | 'submitted';
}

/**
 * True when the answer should be treated as the student's final submission.
 * Returns `true` for legacy rows missing the `status` field — they predate
 * draft autosave and were always explicit submits.
 */
export function isAnswerSubmitted(a: QuizResponseAnswer): boolean {
  return a.status !== 'draft';
}

export type QuizResponseStatus = 'joined' | 'in-progress' | 'completed';

/**
 * Per-student response document in Firestore
 * (/quiz_sessions/{sessionId}/responses/{responseKey}).
 *
 * `responseKey` (the Firestore doc id) is deterministic:
 *   - For studentRole (SSO) auth: equals the student's auth uid.
 *   - For PIN/anonymous auth: derived from pin + classPeriod so it survives
 *     storage/device resets, preventing attempt-limit bypass.
 *
 * The `studentUid` field below still carries the Firebase auth uid of whoever
 * wrote the doc — Firestore rules enforce ownership against this field
 * (not the key), since the key is no longer guaranteed to match the uid.
 */
export interface QuizResponse {
  /**
   * The Firestore doc key under /responses. Populated at read time by the
   * teacher/student hooks from snapshot.doc.id; never persisted as a field.
   * Callers should use this (rather than `studentUid`) when deleting a
   * response, since the key may be pin-derived for anonymous joiners.
   */
  _responseKey?: string;
  /**
   * Firebase Auth UID of the student who wrote the doc — anonymous for PIN
   * joiners, the SSO uid for studentRole joiners. Used for ownership checks
   * in Firestore rules. Historically also served as the doc key; that is no
   * longer guaranteed for anonymous joiners (see `_responseKey`).
   */
  studentUid: string;
  /**
   * Student's roster PIN. Teacher cross-references this with the Drive roster
   * to identify the student. No name or email is stored in Firestore.
   *
   * Optional because SSO `studentRole` joiners (launched from /my-assignments)
   * have no PIN — their identity is `studentUid`, resolved to a name via
   * `getPseudonymsForAssignmentV1` on the teacher side. Anonymous PIN joiners
   * always set this field.
   */
  pin?: string;
  joinedAt: number;
  /**
   * Firestore server-stamped time of the student's most recent answer
   * write (draft or submitted). Stamped on every `submitAnswer` call,
   * at join time, and whenever a join/unlock path resets the response.
   * NOT touched by tab-switch warnings. Used by the scheduled idle
   * auto-submit Cloud Function to find responses that have been
   * sitting in `joined`/`in-progress` past the assignment's idle
   * threshold.
   *
   * Server-stamped (Firestore Timestamp) — not a client `Date.now()` —
   * so a Chromebook with a skewed clock can't (a) seed a past
   * timestamp and get force-finalized on the next sweep, (b) seed a
   * future timestamp to evade auto-submit indefinitely, or (c) trip
   * the monotonic rule when two tabs disagree on the wall clock.
   *
   * Optional on legacy responses written before the field existed —
   * those are skipped by the inequality query, which is the correct
   * behavior (don't retroactively auto-submit historical attempts).
   */
  lastWriteAt?: import('firebase/firestore').Timestamp;
  /**
   * Set by the idle auto-submit Cloud Function when a stale response
   * was finalized without the student clicking Submit. Lets the
   * teacher's results view differentiate "submitted intentionally"
   * from "auto-submitted after timeout".
   */
  autoSubmitted?: boolean;
  status: QuizResponseStatus;
  answers: QuizResponseAnswer[];
  /**
   * Percentage score 0–100 if computed and persisted, or null if not yet graded.
   * Not currently written by either the student or the teacher app — scoring is
   * computed on the fly in the results view using gradeAnswer() against the
   * full quiz data loaded from Drive.
   */
  score: number | null;
  submittedAt: number | null;
  /**
   * Tracks how many times the student left the quiz tab or minimized the window.
   * Used for maintaining quiz integrity.
   */
  tabSwitchWarnings?: number;
  /**
   * Number of tab-switch / focus-loss events the student has accumulated while
   * viewing **published results**. Distinct from `tabSwitchWarnings`, which
   * tracks tab switches during the active quiz-taking attempt. Server-rule
   * enforced to only ever increase from a student write — teacher writes (via
   * `unlockResultsForStudent`) can decrement.
   */
  resultsTabWarnings?: number;
  /**
   * True once `resultsTabWarnings` reaches `session.protection.tabWarningThreshold`.
   * Read by the student app to redirect to My Assignments, and by the teacher's
   * monitor to surface the lock badge + unlock affordance.
   */
  resultsLockedOut?: boolean;
  /** Wall-clock ms when `resultsLockedOut` last flipped from false → true. */
  resultsLockedOutAt?: number;
  /** Which class period the student selected when joining (multi-class support). */
  classPeriod?: string;
  /**
   * Class id (`classlinkClassId` or `testClassId`) the SSO student belongs to.
   * Written at SSO join time as the intersection of the student's `classIds`
   * custom-token claim with the session's targeted `classIds`. Only populated
   * for non-anonymous (SSO) joiners — anonymous PIN joiners pick a period
   * directly and write `classPeriod` instead. The teacher-side results view
   * resolves this id to a roster name when `classPeriod` is missing, which
   * keeps the period filter and shared-sheet "Class Period" column populated
   * for SSO students who never went through the period picker.
   */
  classId?: string;
  /**
   * Number of times this student has completed the quiz under this response
   * doc. Incremented on the transition `in-progress -> completed` via
   * `completeQuiz`. Used together with `QuizSession.attemptLimit` to enforce
   * the attempts cap: a student can re-join (and the doc is reset to
   * `status: 'joined'`) until `completedAttempts >= attemptLimit`.
   *
   * Undefined on legacy docs written before multi-attempt support; the hook
   * treats missing+`status==='completed'` as a single completed attempt.
   */
  completedAttempts?: number;
  /**
   * The assignment's `syncedVersion` at the moment this response was
   * created OR last touched before a sync rebuilt the session questions.
   * Set to the assignment's pre-sync `syncedVersion` when
   * `syncAssignmentToLatest` runs against a session with existing
   * responses, so the results UI can flag rows as "Answered before
   * v{N+1} update." Absent on responses written outside synced mode.
   */
  preSyncVersion?: number;
  /**
   * True when a teacher has manually unlocked an auto-submitted or
   * attempt-limit-locked response so the student can resume. The hooks
   * preserve `answers` on the next rejoin and skip the "Warning N of 3"
   * modal — any further tab-switch finalizes the attempt immediately.
   * Cleared back to false on the student's next completion.
   */
  unlocked?: boolean;
  /** Client timestamp (ms) when the teacher unlocked the attempt. */
  unlockedAt?: number;
  /**
   * Teacher-written manual grades for written question types
   * (`short`, `essay`). Keyed by `QuizQuestion.id`. Lives outside the
   * `answers[]` array so teacher writes don't need to rewrite the
   * student's answer payload, and so Firestore rules can lock students
   * out of grading via the existing `changedKeys().hasOnly([...])`
   * whitelist — `grading` is simply not in the list, so any student
   * write that includes it is rejected.
   *
   * Auto-graded question types (MC/FIB/Matching/Ordering) do not use
   * this map; their correctness is recomputed on the fly by `gradeAnswer`.
   */
  grading?: { [questionId: string]: WrittenAnswerGrade };
}

/**
 * Per-question manual grade record for written-response questions.
 * Stored under `QuizResponse.grading[questionId]`.
 */
export interface WrittenAnswerGrade {
  /**
   * Points awarded. Clamped client-side to `0 <= pointsAwarded <=
   * (question.points ?? 1)`. Phase 2/3 will add a server-side cap
   * in Firestore rules once rules can look up the question by id.
   */
  pointsAwarded: number;
  /** Optional summary comment the teacher leaves on the response. */
  overallComment?: string;
  /**
   * Phase 2: sanitized HTML snapshot of the student's `answer` captured the
   * first time the teacher saves a grade carrying annotations. Frozen and
   * immutable from that point on. Annotation `from`/`to` offsets index into
   * the plaintext projection of THIS snapshot — not the student's live
   * `answer` text — so annotations stay anchored even if the teacher later
   * unlocks the attempt and the student edits. Optional so Phase 1 grades
   * (no annotations) remain valid.
   */
  gradingSnapshot?: string;
  /** Phase 2 (annotations). Empty/undefined when no highlights were added. */
  annotations?: WrittenAnswerAnnotation[];
  /** Phase 3 (rubrics). Empty/undefined in Phase 1. */
  rubricScores?: WrittenAnswerRubricScore[];
  /** Teacher's auth uid that wrote the grade. */
  gradedBy: string;
  /** Client timestamp (ms) when the grade was saved. */
  gradedAt: number;
}

/**
 * Phase 2 annotation shape. Reserved here so we don't churn the type
 * later. The exact storage model (marks-in-document vs sidecar offsets)
 * is an open question deferred to Phase 2 design.
 */
export interface WrittenAnswerAnnotation {
  id: string;
  /** Inclusive start offset into the sanitized plaintext projection. */
  from: number;
  /** Exclusive end offset. */
  to: number;
  highlightColor?: 'yellow' | 'green' | 'pink' | 'blue';
  comment?: string;
  authorUid: string;
  createdAt: number;
}

/**
 * Phase 3 rubric score shape. Reserved here so we don't churn the type
 * later.
 */
export interface WrittenAnswerRubricScore {
  criterionId: string;
  levelId: string;
  /** Snapshot for resilience against later rubric edits. */
  points: number;
  note?: string;
}

/**
 * Per-roster, non-PII PIN index. Stored at
 * `/users/{teacherUid}/rosters/{rosterId}/pin_index/{indexKey}`.
 *
 * Bridges PIN-joining students into the same identity space as SSO
 * (`studentLoginV1`) joiners. The index maps `(period, pin)` → the same
 * HMAC pseudonym uid `studentLoginV1` would mint for the student, so a
 * PIN client can sign in via `pinLoginV1` with a custom token whose uid
 * matches the SSO uid. Result: one student, one response doc per
 * session, regardless of which auth path they took. Closes the
 * mixed-auth duplicate path (Hypothesis E in the attempt-cap fix).
 *
 * Non-PII by design: the doc holds only opaque hashes and ids. PIN
 * values are SpartBoard-internal join codes and don't identify a person
 * without the (private) roster.
 *
 * Index key (`indexKey`):
 *   `${encodeResponseKeySegment(period)}__${encodeResponseKeySegment(pin)}`
 * — same encoder Quiz response docs use, so the shape is consistent
 * across PIN-related collections.
 *
 * Populated by `commitRosterPinIndexV1` (callable, teacher-only). Read
 * via `admin SDK` inside `pinLoginV1` (callable, public). Clients never
 * read or write these docs directly.
 */
export interface RosterPinIndexEntry {
  /** HMAC(STUDENT_PSEUDONYM_HMAC_SECRET, `sid:${classlinkSourcedId}`). */
  pseudonym: string;
  /**
   * The student's ClassLink class `sourcedId`. Written into the minted
   * custom token's `classIds` claim so the student passes
   * `passesStudentClassGate` on the session's responses.
   */
  classId: string;
  /**
   * ClassLink organization id (from the parent roster's `classlinkOrgId`).
   * Stored on each pin_index entry so `pinLoginV1` can mint the custom
   * token with the right `orgId` claim using a single doc read per
   * roster probe — without it, the function would have to fan out a
   * `collectionGroup('rosters').where('classlinkClassId'…)` lookup on
   * every PIN login (a hot path: every PIN-bridged join). Empty string
   * for rosters whose roster doc is missing the field.
   */
  orgId: string;
  /** Raw period name. Diagnostic only — `indexKey` carries the encoded form. */
  period: string;
  /** Server-time ms of the most recent index rebuild for this entry. */
  updatedAt: number;
}

/**
 * Cross-launch attempt ledger. Stored at the top level
 * `/quiz_attempt_ledger/{ledgerId}` where
 * `ledgerId = ${assignmentId}__${studentUid}` (`assignmentId` = the session id).
 *
 * Per-session response docs reset every launch, so they can't enforce a
 * teacher's "1 attempt" intent across re-launches of the SAME assignment. The
 * ledger sits above the per-launch responses and accumulates a student's
 * completed attempts on ONE assignment — scoped per ASSIGNMENT, NOT per quiz
 * template. Each assignment a teacher builds from the same library quiz gets its
 * own ledger entry, so a student can complete every one of them; the cap only
 * blocks re-attempts of the same assignment.
 *
 * Identity: keyed by the student's auth.uid, which for SSO joiners is the
 * stable HMAC pseudonym minted by `studentLoginV1`. PIN joiners' anonymous
 * auth uids rotate per device, so the ledger only enforces meaningfully for
 * SSO joiners — until Phase 3's `pinLoginV1` unifies the PIN flow onto the
 * same uid space, at which point the ledger covers PIN joiners too without
 * any change to this shape.
 */
export interface QuizAttemptLedger {
  /**
   * The quiz template id (`QuizSession.quizId`). Metadata only — retained for
   * reference/analytics and required by the Firestore rules; NOT part of the
   * ledger key (the key is `${assignmentId}__${studentUid}`).
   */
  quizId: string;
  /** Matches `auth.uid`. Other half of the deterministic ledger key. */
  studentUid: string;
  /**
   * UID of the teacher who owns the quiz. Carried so Firestore rules can
   * authorize the teacher's reset action without a second `get()` to look
   * up the parent quiz; also supports admin-only repair flows.
   */
  teacherUid: string;
  /**
   * Monotonic counter — incremented inside the same transaction that flips
   * a session's response doc to `status: 'completed'`. The teacher reset
   * path (see `removeStudent`) sets this back to 0.
   */
  completedAttempts: number;
  /** Server-time `Date.now()` of the most recent successful completion. */
  lastAttemptAt: number;
  /**
   * Session id of the most recent successful completion. Diagnostic
   * breadcrumb only — never read for enforcement.
   */
  lastSessionId?: string;
}

/** Global admin configuration for the Quiz widget */
export interface QuizGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

/** Widget configuration for the quiz widget (teacher side) */
export interface QuizConfig {
  view: 'manager' | 'import' | 'editor' | 'preview' | 'results' | 'monitor';
  /** Tab within the manager view: library of saved quizzes, in-progress assignments, or archived (inactive) assignments. */
  managerTab?: 'library' | 'active' | 'archive';
  selectedQuizId: string | null;
  selectedQuizTitle: string | null;
  /** Assignment currently opened in monitor/results views. */
  activeAssignmentId: string | null;
  /** Session code when a live quiz is running (denormalized from the active assignment for display). */
  activeLiveSessionCode: string | null;
  /** Quiz session ID for viewing historical results */
  resultsSessionId: string | null;
  /** PLC mode: export results to a shared Google Sheet */
  plcMode?: boolean;
  /** URL of the shared Google Sheet for PLC exports */
  plcSheetUrl?: string;
  /** Teacher's display name for the export sheet */
  teacherName?: string;
  /** @deprecated Use periodNames instead. */
  periodName?: string;
  /** Selected class period roster names. */
  periodNames?: string[];
  /** PLC member emails (informational only for v1) */
  plcMemberEmails?: string[];
  /** Whether the live scoreboard sync is enabled during a quiz session */
  liveScoreboardEnabled?: boolean;
  /** Widget ID of the synced scoreboard widget */
  liveScoreboardWidgetId?: string;
  /** Whether to display student names or PINs on the live scoreboard */
  liveScoreboardMode?: 'pin' | 'name';
  /** When to update scores: on quiz completion or after each question */
  liveScoreboardScoring?: 'completion' | 'per-question';
  /** Persisted library grid/list toggle. */
  libraryViewMode?: 'grid' | 'list';
  /**
   * @deprecated Pre-Phase-5A single-class memory. Read-only fallback now.
   */
  lastClassIdByQuizId?: Record<string, string>;
  /**
   * @deprecated Phase 5A ClassLink-sourcedId map. Read-only fallback for
   * pre-unification configs; new code writes `lastRosterIdsByQuizId`.
   */
  lastClassIdsByQuizId?: Record<string, string[]>;
  /**
   * Per-quiz memory of the last roster selection in the Assign modal.
   * Pre-selects the picker on re-launch.
   */
  lastRosterIdsByQuizId?: Record<string, string[]>;
}

// --- QUIZ ASSIGNMENT TYPES ---

/**
 * Lifecycle state of a quiz assignment.
 * - `active`: the student URL is live and accepting submissions.
 * - `paused`: the student URL is live but submissions are blocked; students see a paused placeholder.
 * - `inactive`: the student URL is dead; existing responses are preserved for review.
 */
export type QuizAssignmentStatus = 'active' | 'paused' | 'inactive';

/**
 * Score-publication visibility level for a quiz assignment.
 *
 * Set by the teacher's "Publish Scores" action on an archived assignment.
 * Controls what each student sees on the `/my-assignments` Completed
 * review screen.
 *
 * - `none`: scores not published. Students see only "submitted".
 * - `score-only`: students see their numeric score (out of total).
 * - `score-and-responses`: students see score + each of their answers
 *   marked correct/incorrect, but not the correct answer.
 * - `score-responses-and-answers`: students see score, their answers
 *   marked correct/incorrect, AND the correct answer for each question.
 *
 * Mirrored to the matching `QuizSession` doc so students can read the
 * level without needing access to the teacher's assignment doc.
 */
export type QuizScoreVisibility =
  | 'none'
  | 'score-only'
  | 'score-and-responses'
  | 'score-responses-and-answers';

/**
 * Anti-screenshot protections applied to a student's view of published quiz
 * results. Mirrored from QuizAssignment → QuizSession at publish time so the
 * student app (which only reads sessions) can render protection without
 * needing access to the teacher's assignment doc.
 */
export interface ResultsProtection {
  /** Show a repeating low-opacity overlay with student name + publish timestamp. */
  watermarkEnabled: boolean;
  /** Detect visibility/focus changes and warn → lock student when threshold hit. */
  tabWarningEnabled: boolean;
  /**
   * Number of warnings before lockout. 1–10 inclusive. Only meaningful when
   * `tabWarningEnabled` is true. Defaults to 3 in the UI but persisted
   * explicitly so historical assignments stay accurate after the default changes.
   */
  tabWarningThreshold: number;
}

export const RESULTS_PROTECTION_DEFAULTS: ResultsProtection = {
  watermarkEnabled: true,
  tabWarningEnabled: false,
  tabWarningThreshold: 3,
};

export const RESULTS_TAB_WARNING_THRESHOLD_MIN = 1;
export const RESULTS_TAB_WARNING_THRESHOLD_MAX = 10;

/**
 * PLC linkage for a quiz assignment. Present iff the assignment is in PLC
 * mode (the originator opted into "Share with PLC" at create time, or the
 * importer is a member of the originator's PLC). The presence of this
 * sub-object is the canonical predicate — `plcMode` was a separate boolean
 * pre-refactor and is now derived as `!!settings.plc`.
 *
 * All four fields are required-when-present so the type makes the implicit
 * invariant explicit: a PLC-mode assignment always has an id, a name, a
 * sheet URL, and a member-email roster snapshot. Pre-refactor docs that
 * had `plcMode === true` but were missing one of `plcId`/`plcName`/
 * `plcSheetUrl` are degraded-state — the read mapper passes them through
 * WITHOUT a `plc` field, matching the non-PLC code path so downstream
 * consumers don't see partial-PLC objects.
 */
export interface PlcLinkage {
  /**
   * Id of the PLC this assignment is shared with. Used by the importer to
   * decide whether to preserve PLC linkage (member) or strip it and surface
   * a "you're not in this PLC" prompt (non-member).
   */
  id: string;
  /**
   * Display name of the PLC at the time of assignment creation. Snapshotted
   * onto the share doc so the non-member toast can name the PLC even though
   * the importer can't read the live `/plcs/{plcId}` doc (rules block it).
   */
  name: string;
  /** URL of the shared Google Sheet that PLC results export to. */
  sheetUrl: string;
  /** Snapshot of the PLC member emails at create time. */
  memberEmails: string[];
  /**
   * True iff this sheet was created by the system (`createPlcSheetAndShare`)
   * rather than pasted by the teacher. The settings modal uses this to decide
   * whether the "Auto-Generated PLC Sheet" toggle should default ON, including
   * after a PLC peer imports the share. Absent on legacy/manual-paste linkages.
   */
  autoGenerated?: boolean;
}

/**
 * Settings that can be carried between assignments and are shareable in PLCs.
 * These do NOT include the quiz content itself — content is always sourced from the library.
 */
export interface QuizAssignmentSettings {
  /** Free-text label shown in the archive (e.g. "Period 2"). */
  className?: string;
  sessionMode: QuizSessionMode;
  sessionOptions: QuizSessionOptions;
  /**
   * PLC linkage. Present iff the assignment is "PLC mode" — exporting to
   * a shared Google Sheet for the PLC team. Use `!!settings.plc` as the
   * canonical predicate; pre-refactor flat fields (`plcMode`, `plcSheetUrl`,
   * `plcId`, `plcName`, `plcMemberEmails`) are mapped into this sub-object
   * by `migrateLegacyAssignmentShape` on read.
   */
  plc?: PlcLinkage;
  teacherName?: string;
  /** @deprecated Use periodNames instead. Kept for backwards compat. */
  periodName?: string;
  /** Selected class period roster names. Replaces singular periodName. */
  periodNames?: string[];
  /**
   * Unified roster targeting (new post-unification assignments). Written
   * additively alongside `periodNames` for back-compat: the edit modal
   * derives both fields from the selected rosters on save. Legacy
   * assignments without `rosterIds` continue to read via `periodNames`
   * (and session `classIds`). No backfill of existing assignments.
   */
  rosterIds?: string[];
  /**
   * Max completed submissions allowed per student. `null`/`undefined` means
   * unlimited (legacy). `1` (default for new assignments) means one-and-done.
   * Enforced at `joinQuizSession` time by checking the student's own existing
   * response doc; teachers can reset a student's attempt by removing them from
   * the live monitor, which deletes the response doc.
   */
  attemptLimit?: number | null;
  /** Optional due date (ms epoch). Absent / null = no due date. PLC-config + board both honor it. */
  dueAt?: number | null;
  /**
   * Whether `dueAt` encodes a chosen time-of-day (set by the date+time picker)
   * vs a legacy/date-only value stored as UTC midnight. Read back by the picker
   * and by the Classroom due-date conversion to choose verbatim-time vs
   * end-of-day. Absent = date-only (legacy/other create paths).
   */
  dueAtHasTime?: boolean;
}

/**
 * A single instance of a quiz being assigned out. Stored per-teacher at
 * `/users/{teacherUid}/quiz_assignments/{assignmentId}`. The assignment id is
 * also the id of the matching `/quiz_sessions/{sessionId}` document (1:1).
 */
export interface QuizAssignment extends QuizAssignmentSettings {
  /** Assignment UUID — also the sessionId. */
  id: string;
  quizId: string;
  quizTitle: string;
  /** Drive file id of the source quiz so the monitor can hydrate after reload. */
  quizDriveFileId: string;
  teacherUid: string;
  /** Join code for the student URL. Denormalized from the session doc for archive display. */
  code: string;
  status: QuizAssignmentStatus;
  createdAt: number;
  updatedAt: number;
  /**
   * URL of the Google Sheet produced by the teacher's last Results → Export.
   * Persisted so re-entering the Results view after navigating away keeps the
   * "Open Sheet" shortcut instead of reverting to "Export". Export is
   * idempotent (same title ⇒ same sheet) so a stale URL safely regenerates
   * the same sheet if re-exported.
   */
  exportUrl?: string;
  /**
   * Response keys (`getResponseDocKey`) that have already been written to
   * the linked sheet. Powers the "Update Sheet" affordance: the next update
   * appends only the responses NOT in this set, so re-exporting after more
   * students finish doesn't duplicate already-exported rows.
   *
   * Set chosen over a (createdAt, key) cursor because the set is correct
   * even when responses arrive out-of-order (network hiccups, retroactive
   * writes from anonymous students reconnecting), whereas a cursor would
   * silently miss any response with `createdAt < cursor`. The unbounded-
   * growth concern is real but distant: each key is ~15-20 bytes, and the
   * realistic ceiling for a single PLC assignment shared across a team is
   * a few hundred to low thousands of rows — orders of magnitude under
   * Firestore's 1MiB doc limit. If a PLC ever sustains tens of thousands
   * of rows on one assignment, switch this to a separate subcollection or
   * a (createdAt, key) cursor with a deterministic sort order at append
   * time.
   */
  exportedResponseIds?: string[];
  /**
   * Synchronized-quiz linkage. Present iff the assignment was created
   * from a synced library quiz; mirrored from the source quiz's
   * linkage at assignment-create time rather than re-derived on read,
   * so a later quiz detach can't silently strip the linkage from
   * in-flight assignments.
   *
   * `groupId` points at `/synced_quizzes/{groupId}`. `syncedVersion` is
   * the canonical version reflected in the assignment's session
   * `publicQuestions[]`; `group.version > syncedVersion` flips the
   * assignment card's "Sync" affordance.
   *
   * Modeled as a single optional sub-object so partial states ("group
   * but no version", or vice versa) can't typecheck.
   */
  sync?: QuizAssignmentSyncLinkage;
  /** Frozen at creation from the org-wide `assignment-modes` admin setting.
   *  Mirrors QuizSession.mode. Absent on pre-feature assignments. */
  mode?: AssignmentMode;
  /**
   * Score-publication visibility level. Absent / `'none'` means scores
   * have not been published to students yet. Mirrored to the matching
   * `QuizSession` doc by `publishAssignmentScores`.
   */
  scoreVisibility?: QuizScoreVisibility;
  /**
   * Anti-screenshot protections applied when results are visible to students.
   * `undefined` = no protection (legacy assignments pre-feature). Mirrored to
   * the session doc by `publishAssignmentScores`.
   */
  protection?: ResultsProtection;
  /**
   * Timestamp of the most recent `publishAssignmentScores` call. Used by
   * the archive UI to surface "Published <date>" text on cards whose
   * scores have been shared with students.
   */
  scorePublishedAt?: number;
  /**
   * Set when this assignment is attached to a Google Classroom coursework
   * item via the add-on. Mirrors the matching `QuizSession.classroomAttachment`
   * (written together at attach time). `maxPoints` is the quiz's total point
   * value so pushed grades read identically in Classroom.
   */
  classroomAttachment?: ClassroomAttachmentLink;
  /** Item D part 2 — multi-course attachments (read via getClassroomAttachments). */
  classroomAttachments?: ClassroomAttachmentLink[];
}

/** See `QuizAssignment.sync`. */
export interface QuizAssignmentSyncLinkage {
  groupId: string;
  syncedVersion: number;
}

/**
 * Synchronized canonical quiz shared by multiple PLC peers, stored at
 * `/synced_quizzes/{groupId}`.
 *
 * This is the source-of-truth for synced-mode shares. Each peer's local
 * `quiz_metadata` carries `syncGroupId` referencing this doc; the Drive-
 * resident JSON acts as an editing canvas + cached replica. When any peer
 * saves an edit, the editor runs a Firestore transaction that increments
 * `version`, writes the new `questions` + `title`, and stamps `updatedBy`.
 * Other peers' `onSnapshot` listeners fire and the library card surfaces a
 * "Sync available" pill.
 *
 * Last-write-wins on content; the transaction's monotonic `version`
 * increment serializes concurrent saves. Participants are added/removed via
 * the `joinSyncedQuizGroup` / `leaveSyncedQuizGroup` Cloud Functions so
 * Firestore rules can keep client writes scoped to existing participants.
 */
export interface SyncedQuizGroup {
  /** Group id (Firestore doc id). */
  id: string;
  /**
   * Monotonically increasing version. Bumped inside a Firestore transaction
   * on every content write so peers can detect divergence without diffing
   * questions. Initial value is `1` at create time.
   */
  version: number;
  title: string;
  questions: QuizQuestion[];
  /** Behavior settings authored in the editor; synced to PLC members. */
  behavior?: QuizBehaviorSettings;
  /**
   * Roster of participating teachers. Keyed by Firebase Auth uid → metadata.
   * Modified only by the Cloud Function paths so the rules-side write check
   * can be a simple `auth.uid in resource.data.participants` predicate.
   */
  participants: Record<string, { joinedAt: number }>;
  /**
   * Optional PLC linkage. Populated when the originating share was generated
   * from a PLC-mode assignment. Reserved for downstream PLC notification
   * routing (so stale-content alerts can be scoped to the right PLC inbox);
   * no behavior consumes this field today.
   */
  plcId?: string;
  createdAt: number;
  updatedAt: number;
  /** Auth uid of whoever last published an edit (for participant attribution). */
  updatedBy: string;
}

/**
 * Shared-assignment document stored at `/shared_assignments/{shareId}`.
 * Unlike a shared quiz, this carries assignment settings (including the PLC
 * sheet URL) so another teacher can paste the link and get both the library
 * quiz and a preconfigured, paused assignment in one step.
 */
export interface SharedQuizAssignment {
  /** Shared-doc id (Firestore auto-id). */
  id: string;
  /** Inlined quiz data so the importer can copy it into their own library. */
  title: string;
  questions: QuizQuestion[];
  createdAt: number;
  updatedAt: number;
  assignmentSettings: QuizAssignmentSettings;
  /** Original author's UID. */
  originalAuthor: string;
  sharedAt: number;
  /**
   * If present, this share offers a "Sync" import option that joins the
   * importer to the named synced group. The inlined `questions[]` above is
   * still the source of truth for "Make a copy" imports and as a bootstrap
   * snapshot for the synced importer's initial Drive write.
   *
   * Absent on legacy share docs and on shares explicitly published as
   * copy-only — the import-mode picker only appears when this is set.
   */
  syncGroupId?: string;
}

/**
 * Synchronized canonical Video Activity shared by multiple PLC peers, stored
 * at `/synced_video_activities/{groupId}`. Counterpart to `SyncedQuizGroup`.
 *
 * Each peer's local `video_activity_metadata` carries `sync.groupId`
 * referencing this doc; the Drive-resident JSON acts as an editing canvas +
 * cached replica. Edits run inside a Firestore transaction that increments
 * `version`, writes the new `questions`/`title`/`youtubeUrl`, and stamps
 * `updatedBy`. Other peers' `onSnapshot` listeners surface a "Sync available"
 * pill on the library card.
 *
 * Last-write-wins on content; the monotonic `version` increment serializes
 * concurrent saves. Participants are added/removed via the
 * `joinSyncedVideoActivityGroup` / `leaveSyncedVideoActivityGroup` Cloud
 * Functions so Firestore rules can keep client writes scoped to existing
 * participants.
 */
export interface SyncedVideoActivityGroup {
  /** Group id (Firestore doc id). */
  id: string;
  /**
   * Monotonically increasing version. Bumped inside a Firestore transaction
   * on every content write. Initial value is `1` at create time.
   */
  version: number;
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  /** Behavior settings authored in the editor; synced to PLC members. */
  behavior?: VideoActivityBehaviorSettings;
  /**
   * Roster of participating teachers. Keyed by Firebase Auth uid → metadata.
   * Modified only by the Cloud Function paths so the rules-side write check
   * can be a simple `auth.uid in resource.data.participants` predicate.
   */
  participants: Record<string, { joinedAt: number }>;
  /** Optional PLC linkage for downstream notification routing. */
  plcId?: string;
  createdAt: number;
  updatedAt: number;
  /** Auth uid of whoever last published an edit. */
  updatedBy: string;
}

/**
 * A single bounded version-history snapshot of a synced group's PRE-edit
 * content, stored at `/synced_quizzes/{groupId}/versions/{versionId}` and
 * `/synced_video_activities/{groupId}/versions/{versionId}` (PRD §5.1, §3.10,
 * Decision 5.1).
 *
 * Snapshots are written fire-and-forget by the publish path AFTER the
 * canonical transaction commits, so versioning never blocks (or fails) a
 * publish. The collection is pruned to the newest `VERSION_HISTORY_LIMIT`
 * (10) on each write; a server-side GC handles any further trimming.
 * "Restore version" copies a snapshot's `content` back to canonical via the
 * normal version-precondition publish path, which bumps `version`.
 *
 * `content` is the discriminated payload — a quiz snapshot carries the quiz
 * shape (`title` + `questions` + optional `behavior`), a video-activity
 * snapshot additionally carries `youtubeUrl`. The `version` field records the
 * canonical version this snapshot's content represented at capture time.
 *
 * Identity is immutable: the doc is create-only from the client; no update or
 * delete is permitted (GC is server-side via the Admin SDK).
 */
export interface PlcQuizVersionContent {
  title: string;
  questions: QuizQuestion[];
  behavior?: QuizBehaviorSettings;
}

export interface PlcVideoActivityVersionContent {
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  behavior?: VideoActivityBehaviorSettings;
}

/**
 * Generic version snapshot shape, parameterized by the canonical content it
 * captures. `SyncedQuizVersionSnapshot` and `SyncedVideoActivityVersionSnapshot`
 * are the two concrete forms; `SyncedVersionSnapshot` is the union the rules +
 * restore path discriminate over (a quiz snapshot has no `youtubeUrl`; a VA
 * snapshot does).
 */
export interface PlcVersionSnapshot<
  TContent = PlcQuizVersionContent | PlcVideoActivityVersionContent,
> {
  /** The canonical `version` this snapshot's content represented. */
  version: number;
  /** The pre-edit content captured at snapshot time (discriminated by shape). */
  content: TContent;
  /** Auth uid of whoever published the edit that produced this snapshot. */
  savedBy: string;
  /** Wall-clock millis the snapshot was written. */
  savedAt: number;
}

export type SyncedQuizVersionSnapshot =
  PlcVersionSnapshot<PlcQuizVersionContent>;
export type SyncedVideoActivityVersionSnapshot =
  PlcVersionSnapshot<PlcVideoActivityVersionContent>;
export type SyncedVersionSnapshot =
  | SyncedQuizVersionSnapshot
  | SyncedVideoActivityVersionSnapshot;

/**
 * Shared-assignment document stored at
 * `/shared_video_activity_assignments/{shareId}`. Counterpart to
 * `SharedQuizAssignment` — kept in a parallel collection rather than mixed
 * into `/shared_assignments` so the existing quiz-only `originalAuthor`-
 * gated rules don't need a `kind` discriminator.
 */
export interface SharedVideoActivityAssignment {
  /** Shared-doc id (Firestore auto-id). */
  id: string;
  /** Inlined activity data so the importer can copy it into their own library. */
  title: string;
  youtubeUrl: string;
  questions: VideoActivityQuestion[];
  createdAt: number;
  updatedAt: number;
  assignmentSettings: VideoActivityAssignmentSettings;
  /** Original author's UID. */
  originalAuthor: string;
  sharedAt: number;
  /**
   * If present, this share offers a "Sync" import option that joins the
   * importer to the named synced group. Absent on copy-only shares.
   */
  syncGroupId?: string;
}

// --- VIDEO ACTIVITY TYPES ---

/**
 * Question types supported by the Video Activity widget. Distinct from
 * `QuizQuestionType` — VA introduces `'MA'` (multi-answer / "select all
 * that apply") and does not surface Matching or Ordering, which don't
 * map cleanly to a video-cue-point pause.
 */
export type VideoActivityQuestionType = 'MC' | 'FIB' | 'MA';

/**
 * A question tied to a specific timestamp in a YouTube video.
 *
 * Storage shape per `type`:
 *   - `MC`:  `correctAnswer` is the correct option text;
 *            `incorrectAnswers` are distractors.
 *   - `FIB`: `correctAnswer` is the canonical accepted answer;
 *            `acceptableVariants` (optional) is a list of additional
 *            accepted forms (e.g. ["color", "colour"]).
 *   - `MA`:  `correctAnswer` is `|`-encoded correct selections
 *            ("opt1|opt2|opt3"); `incorrectAnswers` are the distractor
 *            options shown alongside. Mirrors the Matching/Ordering
 *            convention so the wire format stays uniform.
 *
 * Inherits `points?` and `allowPartialCredit?` from `QuizQuestion`. MA
 * uses `allowPartialCredit` to score (|correct ∩ given| − |given − correct|)
 * / |correct| × points; without partial credit the question is all-or-nothing.
 */
export type VideoActivityQuestion = Omit<
  QuizQuestion,
  'type' | 'matchingDistractors'
> & {
  type: VideoActivityQuestionType;
  /** Seconds into the video when this question should trigger. */
  timestamp: number;
  /**
   * FIB only — additional accepted answers beyond `correctAnswer`. Each
   * variant is normalized (whitespace + case collapsed) before comparison
   * via `normalizeAnswer`. Empty/missing = the canonical answer is the
   * only accepted form.
   */
  acceptableVariants?: string[];
};

/** Full video activity data stored in Google Drive as JSON. */
export interface VideoActivityData {
  id: string;
  title: string;
  youtubeUrl: string;
  /** Total video duration in seconds, populated after the first player load. */
  videoDuration?: number;
  questions: VideoActivityQuestion[];
  createdAt: number;
  updatedAt: number;
}

/**
 * See `VideoActivityMetadata.sync`. Mirrors `QuizMetadataSyncLinkage`:
 * present iff the activity participates in a `/synced_video_activities/{groupId}`
 * group. Both fields are required or neither is present so the type forbids
 * partial states.
 */
export interface VideoActivityMetadataSyncLinkage {
  /** Doc id under `/synced_video_activities/{groupId}`. */
  groupId: string;
  /**
   * The `version` of the canonical group doc this local Drive replica was
   * last reconciled with. Used as a stale-detector against the canonical's
   * live `version`.
   */
  lastSyncedVersion: number;
}

/** Lightweight metadata stored in Firestore (avoids Drive API on every list). */
export interface VideoActivityMetadata {
  id: string;
  title: string;
  youtubeUrl: string;
  driveFileId: string;
  questionCount: number;
  createdAt: number;
  updatedAt: number;
  /** Optional manual ordering index for drag-reorder in the Library view. */
  order?: number;
  /**
   * Optional folder assignment (Wave 3). `null` or missing = root.
   * Refers to a folder id in `/users/{userId}/video_activity_folders/{folderId}`.
   */
  folderId?: string | null;
  /**
   * Optional sync-group linkage for PR3 PLC sharing. Present iff this
   * activity participates in a synced group. Mirrors `QuizMetadata.sync`.
   */
  sync?: VideoActivityMetadataSyncLinkage;
  /** Behavior settings authored in the editor; synced to PLC members. */
  behavior?: VideoActivityBehaviorSettings;
}

export type VideoActivityView = 'manager' | 'create' | 'results' | 'monitor';

/** Widget configuration for the video activity widget (teacher side). */
export interface VideoActivityConfig {
  view: VideoActivityView;
  selectedActivityId: string | null;
  selectedActivityTitle: string | null;
  /** Session ID for the currently viewed results session. */
  resultsSessionId: string | null;
  /** Default settings for sessions created via this widget */
  autoPlay?: boolean;
  requireCorrectAnswer?: boolean;
  allowSkipping?: boolean;
  /** Persisted library grid/list toggle. */
  libraryViewMode?: 'grid' | 'list';
  /**
   * @deprecated Pre-Phase-5A single-class memory. Read-only fallback now.
   */
  lastClassIdByActivityId?: Record<string, string>;
  /**
   * @deprecated Phase 5A ClassLink-sourcedId map. Read-only fallback for
   * pre-unification configs; new code writes `lastRosterIdsByActivityId`.
   */
  lastClassIdsByActivityId?: Record<string, string[]>;
  /**
   * Per-activity memory of the last roster selection in the Assign modal.
   * Pre-selects the picker on re-launch.
   */
  lastRosterIdsByActivityId?: Record<string, string[]>;
}

/**
 * Player-behavior controls that the student-side VideoPlayer reads directly.
 * Captured at assignment-create time and mirrored onto the session doc so the
 * student client can enforce them without a teacher round-trip.
 */
export interface VideoActivitySessionSettings {
  autoPlay: boolean;
  /**
   * Legacy "rewind to section start on incorrect answer" flag. New code
   * prefers `VideoActivitySessionOptions.rewindOnIncorrectSeconds`. When that
   * field is absent, `requireCorrectAnswer === true` is interpreted as
   * "rewind to the previous question's timestamp" (the historical behavior).
   */
  requireCorrectAnswer: boolean;
  allowSkipping: boolean;
}

/**
 * Score-visibility levels mirroring `QuizAssignment.scoreVisibility`. Controls
 * what the student sees on the post-completion screen.
 */
export type VideoActivityScoreVisibility =
  | 'none'
  | 'score-only'
  | 'score-and-responses'
  | 'score-responses-and-answers';

/**
 * Assignment-policy options for a Video Activity session. Distinct from
 * `VideoActivitySessionSettings` (player behavior) — these are the
 * security/feedback/scoring knobs that mirror the Quiz toggle group.
 */
export interface VideoActivitySessionOptions extends BaseSessionOptions {
  /**
   * Hard cap on the number of times the student may attempt the activity
   * (one increment per `completedAttempts` bump). null/undefined = unlimited.
   * Compared against `VideoActivityResponse.completedAttempts`, which is a
   * single counter — not per-question.
   */
  attemptLimit?: number | null;
  /**
   * Seconds to rewind on a wrong submission. 0 / undefined = no rewind. When
   * set and > 0, supersedes the legacy `requireCorrectAnswer` rewind-to-
   * section-start behavior.
   */
  rewindOnIncorrectSeconds?: number;
  /** Points to deduct per incorrect submission. 0 / undefined = no penalty. */
  pointPenaltyOnIncorrect?: number;
  /** Controls how much of the result the student sees post-completion. */
  scoreVisibility?: VideoActivityScoreVisibility;
  /** Optional due date (ms epoch). Absent / null = no due date. */
  dueAt?: number | null;
  /** Whether `dueAt` encodes a chosen time-of-day vs a legacy date-only epoch. */
  dueAtHasTime?: boolean;
}

/** VA counterpart of QuizBehaviorSettings. */
export interface VideoActivityBehaviorSettings {
  sessionMode: QuizSessionMode;
  sessionOptions: Omit<
    VideoActivitySessionOptions,
    'attemptLimit' | 'dueAt' | 'dueAtHasTime'
  >;
  attemptLimit: number | null;
}

export interface GlobalVideoActivity extends VideoActivityMetadata {
  /** Building IDs this activity is assigned to; empty array = all buildings */
  buildings?: string[];
}

export interface VideoActivityGlobalConfig {
  dockDefaults?: Record<string, boolean>;
  aiEnabled?: boolean;
}

/**
 * A Firestore session document giving students access to an activity.
 * Stored at /video_activity_sessions/{sessionId}
 */
export interface VideoActivitySession {
  id: string;
  activityId: string;
  activityTitle: string;
  assignmentName: string;
  teacherUid: string;
  youtubeUrl: string;
  /** Full questions including correctAnswer — used server-side for grading. */
  questions: VideoActivityQuestion[];
  /** Session-level player-behavior controls configured at assignment time. */
  settings?: VideoActivitySessionSettings;
  /**
   * Assignment-policy options (security, feedback, attempt limits, scoring).
   * Mirrors QuizSession.sessionOptions. Absent on pre-PR1 sessions.
   */
  sessionOptions?: VideoActivitySessionOptions;
  status: 'active' | 'ended';
  /**
   * Roster PINs allowed to join. Teacher sets this when assigning to a class.
   * Empty array means any PIN is accepted.
   */
  allowedPins: string[];
  createdAt: number;
  endedAt?: number;
  /** Optional Unix timestamp when the session link expires. */
  expiresAt?: number;
  /**
   * @deprecated Phase 5A — retained only for transitional compatibility.
   * Populated to `classIds[0]` when `classIds` is non-empty so older clients
   * and pre-migration Firestore rules keep working. Prefer `classIds`.
   */
  classId?: string;
  /**
   * Multi-class ClassLink target list. ClassLink-authenticated students whose
   * token `classIds` claim overlaps this list see the session on their
   * `/my-assignments` page; Firestore rules (`passesStudentClassGateList`)
   * enforce the class gate. An empty/missing list preserves the classic
   * PIN-only flow.
   */
  classIds?: string[];
  /**
   * Optional class-period names (typically local roster names) available for
   * students to choose from after entering their PIN. When present and > 1,
   * the student app shows a post-PIN picker and writes the chosen value to
   * the response's `classPeriod` field. Mirrors the QuizSession pattern.
   */
  periodNames?: string[];
  /**
   * Roster IDs backing this session (unified targeting). `classIds` above is
   * derived from these rosters' `classlinkClassId` metadata.
   */
  rosterIds?: string[];
  /**
   * Optional map of ClassLink `classId` → period name. Lets the SSO join
   * path resolve the joining student's period without prompting them.
   * Mirrors `QuizSession.classPeriodByClassId`.
   */
  classPeriodByClassId?: Record<string, string>;
  /**
   * Frozen at creation from the org-wide `assignment-modes` admin setting.
   * Determines whether students see a tracked Share link (`'view-only'`) or
   * the full assignment experience (`'submissions'`). Absent on pre-feature
   * sessions; consumers must default to `'submissions'`.
   */
  mode?: AssignmentMode;
  /**
   * Map of question id → revealed correct answer string. Populated by the
   * teacher's Publish Scores flow (PR3) when the chosen `scoreVisibility`
   * level reveals correct answers to students. Absent until publish runs.
   * Mirrors `QuizSession.revealedAnswers`.
   */
  revealedAnswers?: Record<string, string>;
  /**
   * Optional sync-group linkage. Mirrors `QuizSession.sync`. Set when the
   * assignment was created from (or imported as) a synced share so peer
   * edits to the canonical group flow through to this session on next
   * teacher sync-pull.
   */
  sync?: VideoActivitySessionSyncLinkage;
  /**
   * Mirror of `VideoActivityAssignmentSettings.scoreVisibility`. Authoritative
   * for what the student sees on the post-completion screen. Absent /
   * `'none'` means the teacher hasn't published scores yet — student-side
   * UI must hide percentages/correct counts in that case (matches Quiz
   * `'none'` semantics).
   */
  scoreVisibility?: VideoActivityScoreVisibility;
  /** Server-set timestamp for when scores were published. */
  scorePublishedAt?: number;
  /**
   * Set when this assignment is attached to a Google Classroom coursework item
   * via the add-on. Drives the "Push grades to Google Classroom" action in the
   * VA Results view. `maxPoints` is the activity's total point value (the grade
   * scale) so a pushed grade reads identically in Classroom. Mirrors the
   * matching `VideoActivityAssignment.classroomAttachment` and the Quiz pattern.
   */
  classroomAttachment?: ClassroomAttachmentLink;
  /** Item D part 2 — multi-course attachments (read via getClassroomAttachments). */
  classroomAttachments?: ClassroomAttachmentLink[];
  /**
   * True once a Schoology LTI student has launched this session carrying an
   * NRPS membership endpoint (set server-side). Signals the monitor/results to
   * resolve Schoology student names on-read via `ltiResolveNamesForAssignmentV1`
   * (`kind: 'va'`). Mirrors `QuizSession.ltiNrps`. No PII — a routing flag.
   */
  ltiNrps?: boolean;
  /**
   * Schoology LTI resource-link linkage, captured server-side on the first
   * student launch. Drives the "Push to Schoology" action in the VA Results
   * view. Mirrors `QuizSession.ltiAttachment`.
   */
  ltiAttachment?: LtiAttachmentLink;
}

/** Per-session sync linkage to `/synced_video_activities/{groupId}`. */
export interface VideoActivitySessionSyncLinkage {
  groupId: string;
  syncedVersion: number;
}

/** A single answer submitted by a student for a video activity question. */
export interface VideoActivityAnswer {
  questionId: string;
  answer: string;
  /** Whether the answer was correct. Not written by the student client; derived from
   *  authoritative question data (correctAnswer) when displaying teacher results. */
  isCorrect?: boolean;
  answeredAt: number;
}

/**
 * Per-student response document in Firestore.
 *
 * Document ID format mirrors the Quiz pattern:
 *   - SSO students:         {auth.uid}            (stable identity)
 *   - Anonymous PIN joiners: pin-{period}-{pin}    (deterministic, period-scoped)
 *
 * The deterministic anon key prevents two students with the same PIN in
 * different periods from colliding, and lets the response doc be addressed
 * server-side without prior knowledge of the auth UID.
 *
 * Stored at /video_activity_sessions/{sessionId}/responses/{responseKey}
 */
export interface VideoActivityResponse {
  /**
   * The Firestore doc key under /responses. Populated at read time by the
   * teacher hook from snapshot.doc.id; never persisted as a field. Callers
   * should use this (rather than `studentUid`) when targeting a specific
   * response doc, since the key may be pin-derived for anonymous joiners.
   * Mirrors `QuizResponse._responseKey`.
   */
  _responseKey?: string;
  /** Roster PIN — present for anonymous joiners, absent on SSO joiners. */
  pin?: string;
  /**
   * Self-typed name. Optional from PR1 onward — the student app no longer
   * collects a name. Pre-PR1 archived responses still carry one; the Results
   * UI prefers `useAssignmentPseudonyms` for display so legacy values remain
   * harmless.
   */
  name?: string;
  /** Firebase auth UID of the student who created this response. Used for Firestore ownership rules. */
  studentUid: string;
  joinedAt: number;
  answers: VideoActivityAnswer[];
  completedAt: number | null;
  score: number | null;
  /** Which class period the student selected when joining (multi-class support). */
  classPeriod?: string;
  /** Count of tab/focus losses while the activity is in progress. Append-only at the rules layer. */
  tabSwitchWarnings?: number;
  /**
   * Number of completed activity attempts. Used to enforce
   * `VideoActivitySessionOptions.attemptLimit`. Initialized to 0 at create
   * time and incremented on each completion. Append-only at the rules layer
   * (a student can only write a value `>=` the existing one). Mirrors
   * `QuizResponse.completedAttempts`.
   */
  completedAttempts?: number;
  /**
   * Per-attempt correctness flag, set by the teacher-side score-publish
   * flow. **Semantics for VA are intentionally left to the publisher in
   * PR1b** — the publish UI will choose between "all questions correct"
   * vs "score >= threshold" and write the resulting boolean here. Until
   * then this field is always absent on VA responses; UI consumers must
   * tolerate `undefined`. Mirrors `QuizResponse.isCorrect`.
   */
  isCorrect?: boolean;
  /**
   * Server-published score visibility for the response. Set when the teacher
   * publishes scores; mirrors `VideoActivityScoreVisibility`.
   */
  scoreVisibility?: VideoActivityScoreVisibility;
  /**
   * True when a teacher has manually unlocked an auto-submitted or
   * attempt-limit-locked response so the student can resume. The hook
   * preserves `answers` on rejoin and the student-side visibility handler
   * skips the warning modal — any further tab-switch finalizes immediately.
   */
  unlocked?: boolean;
  /** Client timestamp (ms) when the teacher unlocked the attempt. */
  unlockedAt?: number;
}

/**
 * Cross-launch attempt ledger for Video Activity. Mirrors
 * `QuizAttemptLedger` exactly — see that type's docs for the rationale.
 * Stored at `/video_activity_attempt_ledger/{ledgerId}` where
 * `ledgerId = ${assignmentId}__${studentUid}` (`assignmentId` = the session id):
 * scoped per ASSIGNMENT, not per activity template.
 */
export interface VideoActivityAttemptLedger {
  /**
   * The activity template id (`VideoActivitySession.activityId`). Metadata only
   * — required by the Firestore rules; NOT part of the ledger key.
   */
  activityId: string;
  /** Matches `auth.uid`. */
  studentUid: string;
  /** UID of the teacher who owns the activity. */
  teacherUid: string;
  /** Monotonic counter; reset to 0 by the teacher's removeStudent action. */
  completedAttempts: number;
  /** Server-time `Date.now()` of the most recent successful completion. */
  lastAttemptAt: number;
  /** Diagnostic breadcrumb — most recent session id; not used for enforcement. */
  lastSessionId?: string;
}

export interface TalkingToolConfig {
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
}

export interface NextUpQueueItem {
  id: string;
  name: string;
  status: 'waiting' | 'active' | 'done';
  joinedAt: number;
}

export interface NextUpConfig {
  activeDriveFileId: string | null;
  sessionName: string | null;
  isActive: boolean;
  createdAt: number; // Used for midnight auto-expiry
  lastUpdated: number;
  displayCount: number;
  autoStartTimer?: boolean; // Nexus connection
  externalTrigger?: number; // Nexus connection
  styling: {
    fontFamily: string;
    themeColor: string;
    animation: 'slide' | 'fade' | 'none';
  };
}

export interface NextUpGlobalConfig {
  buildingDefaults: Record<
    string,
    {
      displayCount: number;
      fontFamily: string;
      themeColor: string;
    }
  >;
}

export interface StarterPack {
  id: string;
  name: string;
  description?: string;
  icon: string; // Lucide icon key
  color: string; // Tailwind color class
  gradeLevels: string[]; // e.g., ["K", "1", "2"]
  isLocked: boolean; // Teachers cannot edit/delete
  widgets: Omit<WidgetData, 'id'>[]; // The snapshot of widget states
}

export type BuildingStarterPack = StarterPack;
export type UserStarterPack = StarterPack;

export interface StarterPackGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Required: Record<string, never> breaks WidgetConfig union spreads in DashboardContext
export interface StarterPackConfig {}

export interface CountdownConfig {
  title: string;
  startDate: string; // ISO date string
  eventDate: string; // ISO date string
  includeWeekends: boolean;
  countToday: boolean;
  viewMode: 'number' | 'grid';
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
  eventColor?: string;
}

export interface BuildingCountdownDefaults {
  buildingId: string;
  title?: string;
  startDate?: string;
  eventDate?: string;
  includeWeekends?: boolean;
  countToday?: boolean;
  viewMode?: 'number' | 'grid';
}

export interface CountdownGlobalConfig {
  buildingDefaults?: Record<string, BuildingCountdownDefaults>;
  dockDefaults?: Record<string, boolean>;
}

export interface OnboardingConfig {
  completedTasks: string[];
}

// --- SPECIALIST SCHEDULE TYPES ---

export interface SpecialistScheduleItem {
  id: string;
  startTime: string; // HH:mm
  endTime?: string; // HH:mm
  task: string;
  linkedWidgets?: WidgetType[];
}

export interface SpecialistScheduleRecurringItem extends SpecialistScheduleItem {
  type: 'daily' | 'weekly';
  dayOfWeek?: number; // 0-6 (Sunday-Saturday), only for 'weekly'
}

export interface SpecialistScheduleCycleDay {
  dayNumber: number; // 1 to cycleLength
  items: SpecialistScheduleItem[];
}

export interface NumberLineMarker {
  id: string;
  value: number;
  label?: string;
  color: string;
}

export interface NumberLineJump {
  id: string;
  startValue: number;
  endValue: number;
  label?: string; // e.g., "+5"
}

export interface NumberLineConfig {
  min: number;
  max: number;
  step: number; // e.g., 1, 0.5, 10
  displayMode: NumberLineMode;
  markers: NumberLineMarker[];
  jumps: NumberLineJump[];
  showArrows: boolean;
  cardColor?: string;
  cardOpacity?: number;
  fontFamily?: GlobalFontFamily;
  fontColor?: string;
}

export type BuildingNumberLineDefaults = Pick<
  NumberLineConfig,
  | 'min'
  | 'max'
  | 'step'
  | 'displayMode'
  | 'showArrows'
  | 'cardColor'
  | 'cardOpacity'
  | 'fontFamily'
  | 'fontColor'
>;

export interface NumberLineGlobalConfig {
  buildingDefaults?: Record<string, BuildingNumberLineDefaults>;
}

export interface SpecialistScheduleBuildingConfig {
  cycleLength: 6 | 10;
  startDate: string; // YYYY-MM-DD
  /** List of dates (YYYY-MM-DD) that are school days and should count in the rotation. */
  schoolDays: string[];
  /** Custom label for "Day" (e.g., "Day" for Schumann, "Block" for Intermediate) */
  dayLabel?: string;
  /** Custom names for each day in the cycle (e.g., { 1: "Day 1", 2: "Music Day" }) */
  customDayNames?: Record<number, string>;
  /** Explicit date blocks for 10-block rotation (Intermediate School) */
  blocks?: { dayNumber: number; startDate: string; endDate: string }[];
  /** Predefined specialist options for this building (e.g., ["🎵 Music", "👟 PE"]) */
  specialistOptions?: string[];
}

export interface SpecialistScheduleGlobalConfig {
  /** Building ID -> Config */
  buildingDefaults: Record<string, SpecialistScheduleBuildingConfig>;
  dockDefaults?: Record<string, boolean>;
}

export interface SpecialistScheduleConfig {
  /** The specific specialist class name for this teacher (e.g., "3A", "Mrs. Smith's Class") */
  specialistClass?: string;
  /** Mapping of Day Number (1-based) to its schedule items. */
  cycleDays: SpecialistScheduleCycleDay[];
  /** Items that repeat every day or on specific days of the week */
  recurringItems?: SpecialistScheduleRecurringItem[];
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  cardColor?: string;
  cardOpacity?: number;
}

export interface NextUpSession {
  id: string; // widgetId
  teacherUid: string;
  sessionName: string;
  activeDriveFileId: string;
  isActive: boolean;
  createdAt: number;
  lastUpdated: number;
  buildingId?: string; // For default settings
}

// Music widget types
export type MusicLayout = 'default' | 'minimal' | 'small';

export const MUSIC_GENRES = [
  'Lo-fi / Chill',
  'Classical / Instrumental',
  'Nature / Ambient',
  'Pop / Top 40',
  'Jazz',
  'Rock',
  'Focus / Study',
  'Holiday',
  'Other',
] as const;

export type MusicGenre = (typeof MUSIC_GENRES)[number];

export interface MusicStation {
  id: string;
  title: string;
  channel: string;
  url: string;
  thumbnail: string;
  color: string;
  isActive: boolean;
  order: number;
  /** Predefined genre tag for the station */
  genre?: MusicGenre;
  /**
   * Building IDs this station is visible to.
   * Empty array or undefined means visible to all buildings.
   */
  buildingIds?: string[];
}

/**
 * Music widget audio source.
 * - `curated` — pick from admin-managed stations (`global_music_stations`).
 * - `personal` — teacher's own Spotify account (requires OAuth connection;
 *   full playback requires Spotify Premium, free accounts fall back to embed).
 */
export type MusicSource = 'curated' | 'personal';

export interface MusicConfig {
  stationId: string;
  syncWithTimeTool?: boolean;
  bgColor?: string;
  textColor?: string;
  /** Widget display layout */
  layout?: MusicLayout;
  /** Audio source — defaults to 'curated' for backward compatibility. */
  source?: MusicSource;
  /**
   * Personal Spotify resource URL or URI to play when `source === 'personal'`.
   * Supports https://open.spotify.com/{track|album|playlist}/{id} or
   * spotify:{type}:{id}. Validated at play-time via `parseSpotifyResource`.
   */
  personalSpotifyUrl?: string;
  /** Human-readable label for the personal selection (track/album/playlist name). */
  personalSpotifyLabel?: string;
  /** Optional thumbnail for the personal selection. */
  personalSpotifyThumbnail?: string;
}

export interface OrganizerNode {
  id: string;
  text: string;
}

export type GraphicOrganizerLayoutType =
  | 'frayer'
  | 't-chart'
  | 'venn'
  | 'kwl'
  | 'cause-effect';

export interface GraphicOrganizerTemplate {
  id: string;
  name: string;
  layout: GraphicOrganizerLayoutType;
  defaultNodes: Record<string, string>; // Map of node keys to default text
  fontFamily?: GlobalFontFamily;
}

export interface GraphicOrganizerBuildingConfig {
  templates: GraphicOrganizerTemplate[];
}

export interface GraphicOrganizerGlobalConfig {
  buildings: Record<string, GraphicOrganizerBuildingConfig>;
  dockDefaults?: Record<string, boolean>;
}

export type GraphicOrganizerTemplateId = `template-${string}`;

export interface GraphicOrganizerConfig {
  templateType: GraphicOrganizerLayoutType | GraphicOrganizerTemplateId;
  nodes: Record<string, OrganizerNode>;
  fontFamily?: GlobalFontFamily;
  cardColor?: string;
  cardOpacity?: number;
  fontColor?: string;
}
export interface CarRiderProConfig {
  iframeUrl?: string;
  // NOTE: The Car Rider Pro widget is an iframe wrapper for an external
  // district portal; the iframe fills the entire widget surface, so
  // surface-color appearance controls (cardColor/cardOpacity) have no
  // visible effect. If header/frame appearance customization is ever
  // added, declare the supporting fields here at that time rather than
  // leaving dead config fields that imply unsupported customization.
}

export type BlendingBoardConfig = Record<string, never>;

export interface RevealCard {
  id: string;
  frontContent: string;
  backContent: string;
  isRevealed: boolean; // Synced to Firebase: Triggers the 3D flip on all screens
  bgColor?: string;
}

export interface MemoryCard {
  id: string;
  originalId: string;
  content: string;
  type: 'term' | 'definition';
  isRevealed: boolean;
  isMatched: boolean;
  bgColor?: string;
}

export interface RevealGridConfig {
  columns: 2 | 3 | 4 | 5;
  cards: RevealCard[];
  revealMode: 'flip' | 'fade';
  isMemoryMode?: boolean;
  memoryCards?: MemoryCard[];
  fontFamily?: GlobalFontFamily;
  defaultCardColor?: string;
  defaultCardBackColor?: string;
  activeDriveFileId?: string | null;
  setName?: string;
}

export interface ConceptNode {
  id: string;
  text: string;
  x: number; // X position as a percentage of container
  y: number; // Y position as a percentage of container
  width?: number; // Width as a percentage of container
  height?: number; // Height as a percentage of container
  bgColor?: string;
}

export interface ConceptEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string; // e.g., "causes", "eats"
  lineStyle: 'solid' | 'dashed';
}

export interface ConceptWebConfig {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  fontFamily?: GlobalFontFamily;
  defaultNodeWidth?: number; // Width as a percentage of container
  defaultNodeHeight?: number; // Height as a percentage of container
  cardColor?: string;
  cardOpacity?: number;
  fontColor?: string;
}

export interface BuildingConceptWebDefaults {
  buildingId: string;
  defaultNodeWidth?: number;
  defaultNodeHeight?: number;
  fontFamily?: GlobalFontFamily;
  cardColor?: string;
  cardOpacity?: number;
  // NOTE: `ConceptWebConfig.fontColor` exists (written by the shared
  // TypographySettings panel) but ConceptWeb's widget renders node text with
  // a hardcoded `text-slate-800` and never reads it — so there is no
  // per-building `fontColor` default here (it would be a dead control).
}

export interface ConceptWebGlobalConfig {
  buildingDefaults: Record<string, BuildingConceptWebDefaults>;
}

export interface SyntaxToken {
  id: string;
  value: string; // the word, punctuation, or math operator
  color?: string;
  isMasked: boolean; // Renders as a blank underscore if true
}

export interface SyntaxFramerConfig {
  mode: 'text' | 'math'; // Math mode adds an equation-style font
  tokens: SyntaxToken[];
  alignment: 'left' | 'center';
}

export interface BuildingSyntaxFramerDefaults {
  buildingId: string;
  mode?: 'text' | 'math';
  alignment?: 'left' | 'center';
}

export interface SyntaxFramerGlobalConfig {
  buildingDefaults: Record<string, BuildingSyntaxFramerDefaults>;
}

export interface ImageHotspot {
  id: string;
  xPct: number; // Use percentages so pins stay anchored if the widget scales
  yPct: number;
  title: string;
  detailText: string;
  icon: 'search' | 'info' | 'question' | 'star';
  isViewed: boolean; // Syncs state so teachers know which ones they've covered
}

export interface HotspotSavedItem {
  id: string;
  name: string;
  baseImageUrl: string;
  hotspots: ImageHotspot[];
  popoverTheme?: 'light' | 'dark' | 'glass';
  createdAt: number;
}

export interface BuildingHotspotImageDefaults {
  buildingId: string;
  popoverTheme?: 'light' | 'dark' | 'glass';
}

export interface HotspotImageGlobalConfig {
  buildingDefaults: Record<string, BuildingHotspotImageDefaults>;
}

export interface HotspotImageConfig {
  baseImageUrl: string;
  hotspots: ImageHotspot[];
  popoverTheme?: 'light' | 'dark' | 'glass';
  savedLibrary?: HotspotSavedItem[];
}

// --- GUIDED LEARNING WIDGET TYPES ---

export type GuidedLearningMode = 'structured' | 'guided' | 'explore';
export type GuidedLearningInteractionType =
  | 'text-popover'
  | 'tooltip'
  | 'audio'
  | 'video'
  | 'pan-zoom'
  | 'pan-zoom-spotlight'
  | 'spotlight'
  | 'question';
export type GuidedLearningOverlayType =
  | 'none'
  | 'popover'
  | 'tooltip'
  | 'banner';
export type GuidedLearningQuestionType =
  | 'multiple-choice'
  | 'matching'
  | 'sorting';

/**
 * Score-visibility levels for a Guided Learning assignment. Structurally
 * identical to {@link QuizScoreVisibility} and
 * {@link VideoActivityScoreVisibility} so the shared `PublishScoresModal`
 * picker works across all three widgets.
 */
export type GuidedLearningScoreVisibility =
  | 'none'
  | 'score-only'
  | 'score-and-responses'
  | 'score-responses-and-answers';

export interface GuidedLearningQuestion {
  type: GuidedLearningQuestionType;
  text: string;
  /** MC options (includes the correct answer) */
  choices?: string[];
  /** MC correct answer — never sent to students */
  correctAnswer?: string;
  /** Matching pairs — correct pairings */
  matchingPairs?: { left: string; right: string }[];
  /** Sorting items in the correct order */
  sortingItems?: string[];
}

export interface GuidedLearningStep {
  id: string;
  /** % position on image (0–100) */
  xPct: number;
  yPct: number;
  /** Which image in set.imageUrls this step belongs to */
  imageIndex: number;
  label?: string;
  interactionType: GuidedLearningInteractionType;
  /**
   * @deprecated Read-only legacy field kept for back-compat. New writes use
   * `hotspotAlwaysHidden`. Reads still honor this when the new field is
   * absent so existing sets keep working without migration.
   */
  hideStepNumber?: boolean;
  /**
   * When true, this hotspot's marker is never rendered in the player. The
   * underlying image region is still clickable in explore mode, so this is
   * for "find the click zone yourself" exercises where the visual marker
   * would give the answer away. Default false.
   */
  hotspotAlwaysHidden?: boolean;
  /** Overlay style for pan-zoom/spotlight interactions */
  showOverlay?: GuidedLearningOverlayType;
  /** Tooltip anchor relative to hotspot (default 'auto') */
  tooltipPosition?: 'above' | 'below' | 'left' | 'right' | 'auto';
  /** Distance in px from hotspot to tooltip edge (default 12) */
  tooltipOffset?: number;
  /** Content for text-popover and tooltip */
  text?: string;
  /** Firebase Storage URL for audio */
  audioUrl?: string;
  audioStoragePath?: string;
  /** YouTube/external URL or Firebase Storage URL for video */
  videoUrl?: string;
  videoStoragePath?: string;
  /** Zoom scale for pan-zoom interaction (default 2.5) */
  panZoomScale?: number;
  /** Spotlight radius as % of container cqmin (default 25) */
  spotlightRadius?: number;
  /** Banner color tone for banner overlay (default 'blue') */
  bannerTone?: 'blue' | 'red' | 'neutral';
  question?: GuidedLearningQuestion;
  /** Seconds before auto-advance in guided mode */
  autoAdvanceDuration?: number;
}

/**
 * Playback-range trim for a video slide, in seconds from the start of the
 * file. Invariant: `0 <= start < end <= duration` (enforced by the editor
 * trim UI; the player additionally clamps against the loaded metadata).
 */
export interface GuidedLearningVideoTrim {
  start: number;
  end: number;
}

/** Full set data stored in Google Drive as JSON */
export interface GuidedLearningSet {
  id: string;
  title: string;
  description?: string;
  /** Firebase Storage URLs for one or more activity images */
  imageUrls: string[];
  imagePaths?: string[];
  /**
   * Per-slide media kind aligned by index with `imageUrls`. `'video'` slides
   * (uploaded MP4/WebM or screen recordings) render in a muted looping
   * `<video>` element; `'image'` covers static images and animated GIFs.
   * Missing array or missing entries = `'image'`, so legacy sets need no
   * migration. Only persisted when at least one slide is a video.
   */
  imageKinds?: ('image' | 'video')[];
  /**
   * Per-slide playback-range trim aligned by index with `imageUrls`. Only
   * meaningful for `'video'` slides: the player seeks to `start` and loops
   * back when playback reaches `end` (seconds). Non-destructive — the full
   * file stays in Storage, so trims can be adjusted later without
   * re-recording. `null`/missing entries = play the whole video. Only
   * persisted when at least one slide has a trim.
   */
  videoTrims?: (GuidedLearningVideoTrim | null)[];
  steps: GuidedLearningStep[];
  mode: GuidedLearningMode;
  createdAt: number;
  updatedAt: number;
  /** Admin-created building-level sets stored in Firestore, not Drive */
  isBuilding?: boolean;
  authorUid?: string;
  /**
   * Hotspot pulse animation for the player. Default `'consistent'` (matches
   * pre-feature behavior — a continuous breathing pulse). `'reminder'` does
   * a brief wiggle every ~6s and stays still otherwise. `'off'` removes the
   * pulse entirely. All variants honor `prefers-reduced-motion`.
   */
  hotspotPulse?: 'consistent' | 'reminder' | 'off';
  /**
   * Image-to-image transition style when the player switches between
   * images. Default `'none'` (instant swap — pre-feature behavior).
   * `'slide'` moves the new image in from the right while the previous
   * image exits to the left. `'fade'` cross-dissolves the two. All
   * variants honor `prefers-reduced-motion`.
   */
  imageTransition?: 'none' | 'slide' | 'fade';
  /**
   * When true, the student start screen replaces the default mode/step
   * subtitle with a custom message and changes the Start button label
   * to "Get started". The message lives in `welcomeMessage`. Falsy =
   * default behavior (mode + step count subtitle).
   */
  welcomeEnabled?: boolean;
  /**
   * Custom welcome message displayed on the student start screen when
   * `welcomeEnabled` is true. Newlines are preserved. Empty/whitespace
   * strings fall back to the default subtitle even when the toggle is
   * on, so an enabled-but-empty welcome doesn't render an empty card.
   */
  welcomeMessage?: string;
}

/** Lightweight metadata stored in Firestore (avoids Drive API on every list) */
export interface GuidedLearningSetMetadata {
  id: string;
  title: string;
  description?: string;
  stepCount: number;
  mode: GuidedLearningMode;
  /** Firebase Storage URL used as thumbnail */
  imageUrl: string;
  driveFileId: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Optional manual sort order, written by the Library "Manual order" reorder
   * flow. Omitted for sets that have never been manually reordered.
   */
  order?: number;
  /**
   * Optional folder assignment (Wave 3). `null` or missing = root.
   * Refers to a folder id in `/users/{userId}/guided_learning_folders/{folderId}`.
   */
  folderId?: string | null;
}

/**
 * Student-safe step — no answer keys.
 * Choices/pairs/items are pre-shuffled before writing to session doc.
 */
export interface GuidedLearningPublicStep {
  id: string;
  xPct: number;
  yPct: number;
  imageIndex: number;
  label?: string;
  interactionType: GuidedLearningInteractionType;
  /** @deprecated Legacy back-compat read; new writes use `hotspotAlwaysHidden`. */
  hideStepNumber?: boolean;
  /** Mirrors `GuidedLearningStep.hotspotAlwaysHidden`. */
  hotspotAlwaysHidden?: boolean;
  showOverlay?: GuidedLearningOverlayType;
  tooltipPosition?: 'above' | 'below' | 'left' | 'right' | 'auto';
  tooltipOffset?: number;
  text?: string;
  audioUrl?: string;
  videoUrl?: string;
  panZoomScale?: number;
  spotlightRadius?: number;
  bannerTone?: 'blue' | 'red' | 'neutral';
  question?: {
    type: GuidedLearningQuestionType;
    text: string;
    /** MC: all choices pre-shuffled (correct identity not marked) */
    choices?: string[];
    /** Matching: left side (prompt), pre-shuffled */
    matchingLeft?: string[];
    /** Matching: right side (definitions), pre-shuffled */
    matchingRight?: string[];
    /** Sorting: items pre-shuffled */
    sortingItems?: string[];
  };
  autoAdvanceDuration?: number;
}

/** Firestore session document granting student access to an experience */
export interface GuidedLearningSession {
  id: string;
  title: string;
  mode: GuidedLearningMode;
  imageUrls: string[];
  /**
   * Mirrors `GuidedLearningSet.imageKinds` so the student player knows which
   * slides are videos. Missing = all slides are images (legacy sessions).
   */
  imageKinds?: ('image' | 'video')[];
  /**
   * Mirrors `GuidedLearningSet.videoTrims` so the student player honors
   * per-slide playback ranges. Missing = play full videos (legacy sessions).
   */
  videoTrims?: (GuidedLearningVideoTrim | null)[];
  /** Student-safe steps (no answer keys) */
  publicSteps: GuidedLearningPublicStep[];
  teacherUid: string;
  createdAt: number;
  expiresAt?: number;
  // ─── ClassLink target class (Phase 3C, Phase 5A multi-class) ───────────────
  /**
   * @deprecated Phase 5A — retained only for transitional compatibility.
   * Populated to `classIds[0]` when `classIds` is non-empty so older clients
   * and pre-migration Firestore rules keep working. Prefer `classIds`.
   */
  classId?: string;
  /**
   * Multi-class ClassLink target list. ClassLink-authenticated students whose
   * token `classIds` claim overlaps this list see the session on their
   * `/my-assignments` page; Firestore rules (`passesStudentClassGateList`)
   * enforce the class gate. An empty/missing list preserves the classic
   * join-link flow.
   */
  classIds?: string[];
  /**
   * Optional class-period names (typically local roster names) available for
   * students to choose from after entering their PIN. When present and > 1,
   * the student app shows a post-PIN picker and writes the chosen value to
   * the response's `classPeriod` field. Mirrors the QuizSession pattern.
   */
  periodNames?: string[];
  /**
   * Roster IDs backing this session (unified targeting). `classIds` above is
   * derived from these rosters' `classlinkClassId` metadata.
   */
  rosterIds?: string[];
  /**
   * Frozen at creation from the org-wide `assignment-modes` admin setting.
   * Determines whether students see a tracked Share link (`'view-only'`) or
   * the full assignment experience (`'submissions'`). Absent on pre-feature
   * sessions; consumers must default to `'submissions'`.
   *
   * NOTE: The GL session's own `mode` field is already in use (play-mode
   * — structured / guided / explore), so the assignment mode lives under
   * `assignmentMode` here. The other three widgets (Quiz, Video Activity,
   * Mini App) store it as `mode`.
   */
  assignmentMode?: AssignmentMode;
  /** Mirrors `GuidedLearningSet.hotspotPulse` so the student app sees it. */
  hotspotPulse?: 'consistent' | 'reminder' | 'off';
  /** Mirrors `GuidedLearningSet.imageTransition`. */
  imageTransition?: 'none' | 'slide' | 'fade';
  /** Mirrors `GuidedLearningSet.welcomeEnabled`. */
  welcomeEnabled?: boolean;
  /** Mirrors `GuidedLearningSet.welcomeMessage`. */
  welcomeMessage?: string;
  /**
   * Mirror of {@link GuidedLearningAssignment.scoreVisibility} for the
   * student-facing `/my-assignments` Completed review screen. Absent /
   * `'none'` ⇒ the student app shows the "Ask your teacher" placeholder
   * instead of the score/Trophy screen. Realtime via `onSnapshot`, so
   * teacher unpublish propagates instantly.
   */
  scoreVisibility?: GuidedLearningScoreVisibility;
  /**
   * Canonical correct answer per step, keyed by `stepId`. Populated only
   * when `scoreVisibility === 'score-responses-and-answers'`; cleared
   * (via `deleteField`) on unpublish so unpublished sessions never leak
   * answer keys to the client.
   */
  revealedAnswers?: Record<string, string>;
}

/** Per-student response in /guided_learning_sessions/{id}/responses/{studentUid} */
export interface GuidedLearningResponse {
  sessionId: string;
  studentAnonymousId: string;
  pin?: string;
  answers: {
    stepId: string;
    answer: string | string[];
    isCorrect: boolean | null; // null when correctness can't be computed client-side (student mode)
  }[];
  completedAt: number | null;
  startedAt: number;
  score: number | null;
  /** Which class period the student selected when joining (multi-class support). */
  classPeriod?: string;
}

export interface GuidedLearningGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

/** Widget config (teacher-side, stored in WidgetData.config) */
export interface GuidedLearningConfig {
  view: 'library' | 'editor' | 'player' | 'results';
  /** ID of the set currently loaded in player view */
  playerSetId?: string | null;
  /** Session ID when viewing results */
  resultsSessionId?: string | null;
  /** Persisted library grid/list toggle. */
  libraryViewMode?: 'grid' | 'list';
  /**
   * @deprecated Pre-Phase-5A single-class memory. Read-only fallback now.
   */
  lastClassIdBySetId?: Record<string, string>;
  /**
   * @deprecated Phase 5A ClassLink-sourcedId map. Read-only fallback for
   * pre-unification configs; new code writes `lastRosterIdsBySetId`.
   */
  lastClassIdsBySetId?: Record<string, string[]>;
  /**
   * Per-set memory of the last roster selection in the Assign dialog.
   * Pre-selects the picker on re-launch.
   */
  lastRosterIdsBySetId?: Record<string, string[]>;
}

export interface NeedDoPutThenTile {
  id: string;
  label: string;
  icon: string;
  color: string;
  checked?: boolean;
}

export interface NeedDoPutThenConfig {
  needItems?: NeedDoPutThenTile[];
  doItems?: string[];
  putItems?: NeedDoPutThenTile[];
  thenItems?: NeedDoPutThenTile[];
  fontFamily?: string;
  fontColor?: string;
  textSizePreset?: TextSizePreset;
  cardColor?: string;
  cardOpacity?: number;
  drawerSize?: {
    need?: number;
    then?: number;
    put?: number;
  };
}

// --- Need / Do / Put / Then Global Config ---
export interface BuildingNeedDoPutThenDefaults {
  buildingId: string;
  /**
   * Stored in the shared `TypographySettings` value space — a `FONTS` id such
   * as `'font-sans'` / `'font-mono'`. The `'global'` sentinel (inherit from the
   * dashboard) is represented by absence/`undefined`, never the literal string.
   * Seeds `NeedDoPutThenConfig.fontFamily`, decoded at render via
   * `getFontClass()` (same prefixed space the Stations widget uses).
   */
  fontFamily?: string;
  fontColor?: string;
  cardColor?: string;
  cardOpacity?: number;
  textSizePreset?: TextSizePreset;
}

export interface NeedDoPutThenGlobalConfig {
  buildingDefaults: Record<string, BuildingNeedDoPutThenDefaults>;
}

/**
 * One station in the Stations widget. Stations are defined by the teacher in the
 * settings panel; students drag their name chips into the corresponding StationCard
 * on the front face. `iconName` and `imageUrl` are mutually exclusive — `imageUrl`
 * wins when both are present so the renderer can show either via
 * `renderCatalystIcon`.
 */
export interface Station {
  id: string;
  title: string;
  description?: string;
  /** Maximum students permitted in this station; undefined = unlimited. */
  maxStudents?: number;
  /** Lucide icon name (e.g. 'BookOpen'). */
  iconName?: string;
  /** Drive/Storage URL for an uploaded or pasted image. Takes precedence over iconName. */
  imageUrl?: string;
  /** Hex string for the card accent color (e.g. '#10b981'). */
  color: string;
  /** Stable order index used by Rotate. Lowest first. */
  order: number;
}

/** A saved Stations preset (just the station definitions, never assignments). */
export interface SavedStationsPreset {
  id: string;
  name: string;
  stations: Station[];
  createdAt: number;
}

export interface StationsConfig {
  /** Teacher-defined stations. Sorted by `order` for rotation/display. */
  stations: Station[];
  /** Map: studentName -> stationId, or null/missing for unassigned. */
  assignments: Record<string, string | null>;
  rosterMode?: 'class' | 'custom';
  customRoster?: string[];
  /**
   * Bumped (e.g. to Date.now()) by a linked Timer when its countdown hits zero.
   * The widget watches this with a useRef and fires the rotate action when the
   * value increases. Mirrors the `externalTrigger` pattern used by Random/NextUp.
   */
  rotationTrigger?: number;
  /**
   * Saved-library snapshot — populated only when this config object is stored
   * in `savedWidgetConfigs.stations`, never on a live widget instance.
   */
  savedLibrary?: SavedStationsPreset[];
  /**
   * Appearance — consumed by both the front-face card grid and the unassigned
   * bucket. `fontFamily` matches the value space written by the shared
   * `TypographySettings` primitive: `'global'` (inherit from dashboard) or one
   * of the prefixed font keys (`'font-sans'`, `'font-mono'`, etc.). Decoded
   * via `getFontClass()` from `utils/styles.ts`.
   */
  fontFamily?: string;
  fontColor?: string;
  cardColor?: string;
  cardOpacity?: number;
}

// Union of all widget configs
export type WidgetConfig =
  | UrlWidgetConfig
  | ClockConfig
  | TrafficConfig
  | TextConfig
  | ChecklistConfig
  | RandomConfig
  | DiceConfig
  | SoundConfig
  | DrawingConfig
  | QRConfig
  | EmbedConfig
  | PollConfig
  | WebcamConfig
  | ScoreboardConfig
  | ExpectationsConfig
  | WeatherConfig
  | ScheduleConfig
  | CalendarConfig
  | LunchCountConfig
  | ClassesConfig
  | InstructionalRoutinesConfig
  | TimeToolConfig
  | MiniAppConfig
  | MaterialsConfig
  | StickerBookConfig
  | StickerConfig
  | SeatingChartConfig
  | CatalystConfig
  | CatalystInstructionConfig
  | CatalystVisualConfig
  | SmartNotebookConfig
  | RecessGearConfig
  | PdfConfig
  | QuizConfig
  | TalkingToolConfig
  | BreathingConfig
  | MathToolsConfig
  | MathToolConfig
  | NextUpConfig
  | OnboardingConfig
  | CountdownConfig
  | CarRiderProConfig
  | BlendingBoardConfig
  | MusicConfig
  | SpecialistScheduleConfig
  | GraphicOrganizerConfig
  | RevealGridConfig
  | NumberLineConfig
  | ConceptWebConfig
  | SyntaxFramerConfig
  | HotspotImageConfig
  | StarterPackConfig
  | VideoActivityConfig
  | GuidedLearningConfig
  | CustomWidgetConfig
  | SoundboardConfig
  | ActivityWallConfig
  | WorkSymbolsConfig
  | BloomsTaxonomyConfig
  | BloomsDetailConfig
  | NeedDoPutThenConfig
  | First5Config
  | StationsConfig;

// Helper type to get config type for a specific widget
export type ConfigForWidget<T extends WidgetType> = T extends 'url'
  ? UrlWidgetConfig
  : T extends 'soundboard'
    ? SoundboardConfig
    : T extends 'clock'
      ? ClockConfig
      : T extends 'traffic'
        ? TrafficConfig
        : T extends 'text'
          ? TextConfig
          : T extends 'checklist'
            ? ChecklistConfig
            : T extends 'random'
              ? RandomConfig
              : T extends 'dice'
                ? DiceConfig
                : T extends 'sound'
                  ? SoundConfig
                  : T extends 'drawing'
                    ? DrawingConfig
                    : T extends 'qr'
                      ? QRConfig
                      : T extends 'embed'
                        ? EmbedConfig
                        : T extends 'poll'
                          ? PollConfig
                          : T extends 'webcam'
                            ? WebcamConfig
                            : T extends 'scoreboard'
                              ? ScoreboardConfig
                              : T extends 'expectations'
                                ? ExpectationsConfig
                                : T extends 'weather'
                                  ? WeatherConfig
                                  : T extends 'schedule'
                                    ? ScheduleConfig
                                    : T extends 'calendar'
                                      ? CalendarConfig
                                      : T extends 'lunchCount'
                                        ? LunchCountConfig
                                        : T extends 'classes'
                                          ? ClassesConfig
                                          : T extends 'instructionalRoutines'
                                            ? InstructionalRoutinesConfig
                                            : T extends 'time-tool'
                                              ? TimeToolConfig
                                              : T extends 'miniApp'
                                                ? MiniAppConfig
                                                : T extends 'materials'
                                                  ? MaterialsConfig
                                                  : T extends 'stickers'
                                                    ? StickerBookConfig
                                                    : T extends 'sticker'
                                                      ? StickerConfig
                                                      : T extends 'seating-chart'
                                                        ? SeatingChartConfig
                                                        : T extends 'catalyst'
                                                          ? CatalystConfig
                                                          : T extends 'catalyst-instruction'
                                                            ? CatalystInstructionConfig
                                                            : T extends 'catalyst-visual'
                                                              ? CatalystVisualConfig
                                                              : T extends 'smartNotebook'
                                                                ? SmartNotebookConfig
                                                                : T extends 'recessGear'
                                                                  ? RecessGearConfig
                                                                  : T extends 'pdf'
                                                                    ? PdfConfig
                                                                    : T extends 'quiz'
                                                                      ? QuizConfig
                                                                      : T extends 'talking-tool'
                                                                        ? TalkingToolConfig
                                                                        : T extends 'breathing'
                                                                          ? BreathingConfig
                                                                          : T extends 'mathTools'
                                                                            ? MathToolsConfig
                                                                            : T extends 'mathTool'
                                                                              ? MathToolConfig
                                                                              : T extends 'nextUp'
                                                                                ? NextUpConfig
                                                                                : T extends 'onboarding'
                                                                                  ? OnboardingConfig
                                                                                  : T extends 'countdown'
                                                                                    ? CountdownConfig
                                                                                    : T extends 'car-rider-pro'
                                                                                      ? CarRiderProConfig
                                                                                      : T extends 'blending-board'
                                                                                        ? BlendingBoardConfig
                                                                                        : T extends 'music'
                                                                                          ? MusicConfig
                                                                                          : T extends 'specialist-schedule'
                                                                                            ? SpecialistScheduleConfig
                                                                                            : T extends 'graphic-organizer'
                                                                                              ? GraphicOrganizerConfig
                                                                                              : T extends 'concept-web'
                                                                                                ? ConceptWebConfig
                                                                                                : T extends 'reveal-grid'
                                                                                                  ? RevealGridConfig
                                                                                                  : T extends 'numberLine'
                                                                                                    ? NumberLineConfig
                                                                                                    : T extends 'syntax-framer'
                                                                                                      ? SyntaxFramerConfig
                                                                                                      : T extends 'hotspot-image'
                                                                                                        ? HotspotImageConfig
                                                                                                        : T extends 'starter-pack'
                                                                                                          ? StarterPackConfig
                                                                                                          : T extends 'video-activity'
                                                                                                            ? VideoActivityConfig
                                                                                                            : T extends 'guided-learning'
                                                                                                              ? GuidedLearningConfig
                                                                                                              : T extends 'custom-widget'
                                                                                                                ? CustomWidgetConfig
                                                                                                                : T extends 'activity-wall'
                                                                                                                  ? ActivityWallConfig
                                                                                                                  : T extends 'work-symbols'
                                                                                                                    ? WorkSymbolsConfig
                                                                                                                    : T extends 'blooms-taxonomy'
                                                                                                                      ? BloomsTaxonomyConfig
                                                                                                                      : T extends 'blooms-detail'
                                                                                                                        ? BloomsDetailConfig
                                                                                                                        : T extends 'need-do-put-then'
                                                                                                                          ? NeedDoPutThenConfig
                                                                                                                          : T extends 'first-5'
                                                                                                                            ? First5Config
                                                                                                                            : T extends 'stations'
                                                                                                                              ? StationsConfig
                                                                                                                              : never;

export interface WidgetComponentProps {
  widget: WidgetData;
  isStudentView?: boolean;
  scale?: number;
  studentPin?: string | null;
  isSpotlighted?: boolean;
  updateDashboardSettings?: (updates: Partial<DashboardSettings>) => void;
  /**
   * True when this widget's host Board is currently visible (active).
   * False when the Board is mounted-but-hidden via the LRU cache.
   * Resource-heavy widgets (Webcam, SoundWidget, SmartNotebook) gate their
   * MediaStream/AudioContext/onSnapshot acquisitions on this flag so hidden
   * Boards release their hardware/listeners. Most widgets ignore it.
   * Defaults to `true` so student-facing and non-LRU surfaces are unaffected.
   */
  isActive?: boolean;
}

export interface WidgetLayout {
  /** Optional header content (stays fixed at top) */
  header?: React.ReactNode;

  /** Main content (grows to fill available space) */
  content: React.ReactNode;

  /** Optional footer content (stays fixed at bottom) */
  footer?: React.ReactNode;

  /** Optional: Override default flex behavior */
  contentClassName?: string;

  /** Optional: Custom padding (default: 'p-2') */
  padding?: string;
}

// Widget components can return either:
// 1. WidgetLayout object (new standardized way)
// 2. React.ReactNode (backwards compatible)
export type WidgetOutput = WidgetLayout | React.ReactNode;

export interface WidgetData {
  id: string;
  type: WidgetType;
  /**
   * Pixel position/size in the current viewport. These are DERIVED on dashboard
   * load (and on viewport resize) from the canonical {@link xProp}, {@link yProp},
   * {@link wProp}, {@link hProp}, and {@link aspectRatio} fields. Widget components
   * can keep reading w/h as pixels for canvas sizing, layout math, etc.
   */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Canonical proportional bounds — fraction of the safe board (viewport minus
   * SNAP_LAYOUT_CONSTANTS.PADDING on each side). These are persisted to
   * Firestore; pixel x/y/w/h are recomputed from them per device. Optional
   * during the migration window; populated by `migrateWidgetToProportional`
   * the first time a legacy dashboard loads.
   */
  xProp?: number;
  yProp?: number;
  wProp?: number;
  hProp?: number;
  /**
   * Pixel-W / pixel-H at the time of the last resize. Used to lock visual
   * shape across viewports of different aspect ratios (e.g. a clock stays
   * square going from a 16:9 projector to a 4:3 tablet). Stretch-behavior
   * widgets (drawing, embed, hotspot-image, pdf, custom-widget) ignore this
   * and fill their proportional rect.
   */
  aspectRatio?: number;
  z: number;
  flipped: boolean;
  version?: number;
  minimized?: boolean;
  maximized?: boolean;
  customTitle?: string | null;
  isLive?: boolean;
  isLocked?: boolean; // When true: widget cannot be moved, resized, or deleted by end-users
  /**
   * User-pinned widget: drag, resize, maximize, and snap are disabled. This is
   * a widget-level interaction lock — distinct from `Dashboard.isPinned`, which
   * marks a Board for the modal/FAB Pinned quick-access section.
   */
  isPinned?: boolean;
  transparency?: number;
  annotation?: DrawingConfig;
  /** Override which building's admin defaults this widget uses (falls back to user's primary building) */
  buildingId?: string;
  /** Widgets sharing the same groupId form a group — they move and resize together */
  groupId?: string;
  config: WidgetConfig;

  // Universal style properties
  backgroundColor?:
    | 'bg-white'
    | 'bg-slate-50'
    | 'bg-blue-50'
    | 'bg-indigo-50'
    | 'bg-purple-50'
    | 'bg-rose-50'
    | 'bg-amber-50'
    | 'bg-emerald-50';
  fontFamily?: 'sans' | 'serif' | 'mono' | 'handwritten' | 'comic';
  baseTextSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
}

/**
 * Looser overrides type for addWidget: allows partial config objects so callers
 * don't need `as Partial<WidgetData>` assertions when supplying only a subset
 * of a widget's config fields (e.g. { config: { layout: 'elementary' } }).
 * Uses a distributive Partial so each config union member is made optional
 * independently, preserving per-widget type information.
 */
type DistributedPartial<T> = T extends unknown ? Partial<T> : never;
export type AddWidgetOverrides = Omit<Partial<WidgetData>, 'config'> & {
  config?: DistributedPartial<WidgetConfig>;
};

export interface DockFolder {
  id: string;
  name: string;
  items: (WidgetType | InternalToolType)[];
}

export type InternalToolType = 'record' | 'magic' | 'remote';

export type DockItem =
  | { type: 'tool'; toolType: WidgetType | InternalToolType }
  | { type: 'folder'; folder: DockFolder };

export interface DashboardSettings {
  quickAccessWidgets?: (WidgetType | InternalToolType)[];
  disableCloseConfirmation?: boolean;
  /** Remote control: widget to spotlight (dim all others). Cleared on dismiss. */
  spotlightWidgetId?: string | null;
  /** Whether remote control is enabled for this dashboard. Default is usually true or false depending on the user. */
  remoteControlEnabled?: boolean;
}

export interface UserRolesConfig {
  students: string[];
  teachers: string[];
  betaTeachers: string[];
  admins: string[];
  superAdmins: string[];
}

/**
 * Per-user profile data stored in Firestore at /users/{userId}/userProfile/profile.
 * This is separate from dashboard settings and persists across dashboards.
 *
 * OWNERSHIP CONTRACT — this single document is written by two contexts:
 *  - `AuthContext` owns the account-level/identity fields: `selectedBuildings`,
 *    `language`, `savedWidgetConfigs`, `setupCompleted`, `disableCloseConfirmation`,
 *    `remoteControlEnabled`, `dockPosition`, `quizMonitorColorsEnabled`,
 *    `quizMonitorScoreDisplay`, `favoriteBackgrounds`, `recentBackgrounds`.
 *  - `DashboardContext` owns the board/dock state fields: `dockItems`,
 *    `libraryOrder`, `dockInitialized`, `lastActiveCollectionId`,
 *    `lastBoardIdByCollection`.
 *
 * INVARIANT: because both contexts write the same doc, every write MUST use
 * `setDoc(ref, partial, { merge: true })` (or `updateDoc`) so it only touches
 * its own fields. A non-merge `setDoc` would silently clobber the fields owned
 * by the other context. Do not introduce a non-merge write to this path.
 */
export interface UserProfile {
  /** IDs of the buildings the user works in (matches Building.id in config/buildings.ts) */
  selectedBuildings: string[];
  /** Optional language preference */
  language?: string;
  /** Global saved widget configs for complex widgets */
  savedWidgetConfigs?: Partial<Record<WidgetType, Partial<WidgetConfig>>>;
  /** True after the user has completed the first-time setup wizard */
  setupCompleted?: boolean;
  /**
   * The Collection the teacher was most recently in. App-open restores
   * this. `null` means "root level (no collection)". Set by
   * `loadDashboard` in DashboardContext when a Board is opened.
   */
  lastActiveCollectionId?: string | null;
  /**
   * Per-Collection last-visited Board memory. Keys are Collection ids
   * (or {@link ROOT_COLLECTION_KEY} for root-level Boards).
   * Populated whenever a Board within a Collection is opened.
   */
  lastBoardIdByCollection?: Record<string, string>;
  /** Skip the confirmation dialog when closing widgets (account-level) */
  disableCloseConfirmation?: boolean;
  /** Whether remote control is enabled for all boards (account-level) */
  remoteControlEnabled?: boolean;
  /** Where the dock is anchored on screen (account-level) */
  dockPosition?: DockPosition;
  /**
   * Quiz live-monitor row tinting toggle. When `true` (default), rows are
   * tinted by score band for completed students; when `false`, rows render
   * white. Per-teacher account-level preference.
   */
  quizMonitorColorsEnabled?: boolean;
  /**
   * Quiz live-monitor right-column display. `percent` = score percentage
   * (default), `count` = "answered/total" progress, `hidden` = blank.
   * Per-teacher account-level preference.
   */
  quizMonitorScoreDisplay?: 'percent' | 'count' | 'hidden';
  /**
   * The user's dock layout (tools + folders, ordered). Synced across devices.
   * When absent, the dock is seeded from building-level admin defaults.
   */
  dockItems?: DockItem[];
  /**
   * Ordered list of all widget/tool types as the user arranged them in the
   * "More" library. Synced across devices.
   */
  libraryOrder?: (WidgetType | InternalToolType)[];
  /**
   * True once the dock has been seeded for this user (either via admin
   * defaults on first sign-in or via wizard completion). Prevents the dock
   * from being re-seeded on subsequent logins.
   */
  dockInitialized?: boolean;
  /**
   * IDs of backgrounds the user has starred as favorites. May be preset IDs
   * (Tailwind class strings like `'bg-gradient-to-br from-blue-400'`), HTTPS
   * URLs (Drive uploads or preset images), or `custom:` values (custom solid
   * colors or gradients entered via the color picker).
   */
  favoriteBackgrounds?: string[];
  /**
   * Recently applied background IDs, newest first, capped at 12. Same ID
   * shapes as {@link favoriteBackgrounds}: Tailwind class strings, HTTPS
   * URLs, or `custom:` values.
   */
  recentBackgrounds?: string[];
}

/**
 * Sentinel key used in {@link UserProfile.lastBoardIdByCollection} for
 * root-level Boards (those with no Collection). All read/write sites of the
 * `lastBoardIdByCollection` map must use this constant instead of a literal
 * string to prevent silent typo bugs.
 *
 * Must not both begin and end with `__` — Firestore rejects such field names
 * (the map is written via dotted field path `lastBoardIdByCollection.${key}`).
 */
export const ROOT_COLLECTION_KEY = '_root_' as const;

export interface SharedGroup {
  id: string;
  name: string;
  color?: string;
}

export interface SpartStickerDropPayload {
  icon: string;
  color: string;
  label?: string;
  url?: string;
}

/**
 * Role this user plays in a live-shared board link.
 * - `owner`: created the share. Mirrors local edits to /shared_boards/{shareId}.
 * - `collaborator`: joined a Synced share. Mirrors local edits + receives remote.
 * - `viewer`: joined a View-Only share. Read-only locally; receives remote.
 */
export type DashboardShareRole = 'owner' | 'collaborator' | 'viewer';

export interface Dashboard {
  id: string;
  name: string;
  driveFileId?: string;
  background: string;
  thumbnailUrl?: string;
  widgets: WidgetData[];
  globalStyle?: GlobalStyle;
  sharedGroups?: SharedGroup[];
  createdAt: number;
  isDefault?: boolean;
  order?: number;
  /**
   * Parent collection id, or `null` for root-level Boards (no collection).
   * Optional during the migration window; populated by
   * `collectionsMigration.ts` the first time a legacy dashboard loads.
   */
  collectionId?: string | null;
  /**
   * When true, this Board appears in the Pinned section of the Boards
   * modal and the FAB kebab popover. Independent of `collectionId` —
   * pinned Boards still belong to their Collection. Distinct from
   * `WidgetData.isPinned`, which is a widget-level interaction lock.
   */
  isPinned?: boolean;
  settings?: DashboardSettings;
  libraryOrder?: (WidgetType | InternalToolType)[];
  updatedAt?: number;
  /** Viewport width (px) when the dashboard was last saved. Used for proportional layout scaling on load. */
  viewportWidth?: number;
  /** Viewport height (px) when the dashboard was last saved. Used for proportional layout scaling on load. */
  viewportHeight?: number;
  /** ID of the /shared_boards/{shareId} doc this dashboard is linked to (live share). */
  linkedShareId?: string;
  /** This user's role in the linked share. */
  linkedShareRole?: DashboardShareRole;
  /** Cached host display name for the share banner. */
  linkedShareHostName?: string;
  /** True after the host has revoked the share — guests see a "share ended" indicator. */
  linkedShareEnded?: boolean;
  /**
   * Live annotation overlay (the pencil-icon draw-over). When the dashboard is
   * part of a live share, this rides through the mirror so host + collaborator
   * strokes propagate to all participants. Viewers receive but cannot write.
   */
  annotationOverlay?: {
    objects: DrawableObject[];
    updatedAt?: number;
  };
}

/**
 * Mode the host chose when creating a share link. Persisted on the
 * /shared_boards/{shareId} doc as `intendedMode` so the recipient flow can
 * honor the host's choice instead of letting the recipient pick.
 */
export type SharedBoardIntendedMode =
  | 'copy'
  | 'synced'
  | 'view-only'
  | 'substitute';

/**
 * Per-roster Drive permission record persisted on a substitute share when the
 * host opts to share their rosters with a sub. The expiration sweep cloud
 * function (Phase 5) iterates this list to revoke each grant by
 * `permissionId` once the share expires or is deleted.
 */
export interface SubstituteShareDriveGrant {
  email: string;
  fileId: string;
  permissionId: string;
}

/**
 * Substitute-mode-only fields persisted on `/shared_boards/{shareId}` when
 * `intendedMode === 'substitute'`. The widgets field on the doc carries the
 * same snapshot as `initialState`; the host never updates either after
 * creation, so the sub view is frozen for the lifetime of the share.
 */
export interface SubstituteShareFields {
  /** ms epoch — defaults to sharedAt + 48h, max 14 days. */
  expiresAt: number;
  /** Canonical building id (config/buildings.ts). Subs filter by this. */
  buildingId: string;
  /** Immutable widgets snapshot at creation time. */
  initialState: WidgetData[];
  /** Optional @orono.k12.mn.us emails granted Drive access. */
  subEmails?: string[];
  /** Phase 5: per-email/file Drive permission ids for revocation. */
  driveGrants?: SubstituteShareDriveGrant[];
}

/** Per-participant entry on a /shared_boards/{shareId} doc. */
export interface SharedBoardParticipant {
  role: 'collaborator' | 'viewer';
  joinedAt: number;
  displayName?: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'loading';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToolMetadata {
  type: WidgetType | InternalToolType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  /** For custom-widget type: the Firestore doc ID of the specific custom widget */
  customWidgetId?: string;
  /** For custom-widget type: the emoji icon of the custom widget */
  customWidgetIcon?: string;
}

export type AccessLevel = 'admin' | 'beta' | 'public';

/**
 * Distribution tier of the signed-in user (docs/wide-distro-plan.md Phase 3).
 * Ordering for `minTier` checks: free < org < internal.
 * - 'internal': email domain is in the internal-domains list (Orono staff).
 * - 'org': not internal, but a member of an organization
 *   (`/organizations/{orgId}/members/{email}` doc exists).
 * - 'free': everyone else.
 */
export type UserTier = 'internal' | 'org' | 'free';

export type GlobalFeature =
  | 'live-session'
  | 'gemini-functions'
  | 'dashboard-sharing'
  | 'dashboard-import'
  | 'magic-layout'
  | 'smart-paste'
  | 'smart-poll'
  | 'screen-recording'
  | 'remote-control'
  | 'embed-mini-app'
  | 'video-activity-audio-transcription'
  | 'ai-file-context'
  | 'org-admin-writes'
  | 'assignment-modes'
  | 'share-link-tracking'
  | 'personal-spotify'
  | 'google-classroom'
  | 'anonymous-join';

export interface GlobalFeaturePermission {
  featureId: GlobalFeature;
  accessLevel: AccessLevel;
  betaUsers: string[];
  enabled: boolean;
  /**
   * Building IDs allowed access. Empty array or `undefined` means
   * "no building restriction" — the feature applies org-wide.
   * Non-empty array means: user must have at least one of these
   * buildings in their `selectedBuildings` to pass the gate.
   */
  buildings?: string[];
  /**
   * Minimum user tier required to access the feature (free < org <
   * internal). `undefined` means available to all tiers — the back-compat
   * default for every doc written before the tier model existed.
   * Admins bypass this check (same as accessLevel).
   */
  minTier?: UserTier;
  config?: Record<string, unknown>;
}

/**
 * Assignment mode for student-facing widgets that can either collect submissions
 * or be shared as view-only experiences. Set org-wide by an admin via Global
 * Settings; frozen onto each assignment/session at creation time so flipping
 * the admin toggle never alters the behavior of in-flight assignments.
 */
export type AssignmentMode = 'submissions' | 'view-only';

/** Widgets whose assignment behavior is controlled by AssignmentModesConfig. */
export type AssignmentWidgetKey =
  | 'quiz'
  | 'videoActivity'
  | 'miniApp'
  | 'guidedLearning';

/**
 * Stored as the `config` of the `assignment-modes` GlobalFeaturePermission doc.
 * Missing keys default to `'submissions'` (preserves pre-feature behavior).
 */
export type AssignmentModesConfig = Partial<
  Record<AssignmentWidgetKey, AssignmentMode>
>;

export interface AppSettings {
  geminiDailyLimit: number;
  logoUrl?: string;
  /**
   * The protection settings the teacher last published with. Used as the
   * pre-fill for the next "Publish Results" dialog so teachers don't have to
   * re-pick on every publish. Initialised from `RESULTS_PROTECTION_DEFAULTS`
   * if unset.
   */
  lastResultsProtection?: ResultsProtection;
}

/**
 * Grade level categories for widget relevance filtering.
 * Used to help teachers discover age-appropriate widgets without restricting access.
 *
 * Granular ranges (internal values → UI labels):
 * - 'k-2'  → "K-2": Kindergarten through 2nd grade
 * - '3-5'  → "3-5": 3rd through 5th grade
 * - '6-8'  → "6-8": 6th through 8th grade (middle school)
 * - '9-12' → "9-12": 9th through 12th grade (high school)
 * - 'universal' → "Universal": Appropriate for all grades
 *
 * Together with the 'all' option in {@link GradeFilter}, this corresponds to the
 * UI/metadata filter options: "K-2, 3-5, 6-8, 9-12, Universal, All".
 */
export type GradeLevel = 'k-2' | '3-5' | '6-8' | '9-12';

/**
 * Where the widget dock renders on screen. Persisted per-user in the
 * `userProfile/profile` Firestore document and surfaced via `useAuth()`.
 */
export type DockPosition = 'bottom' | 'left' | 'right';

/**
 * Grade filter values including the 'all' ("All") option used in the UI.
 * Combined with {@link GradeLevel}, this yields: "K-2, 3-5, 6-8, 9-12, All".
 * Used for filtering widgets in the sidebar.
 */
export type GradeFilter = GradeLevel | 'all';

/**
 * Feature permission settings for controlling widget access across different user groups.
 *
 * @remarks
 * - If no permission record exists for a widget, it defaults to public access (all authenticated users)
 * - When `enabled` is false, the widget is completely disabled for all users including admins
 * - Access levels:
 *   - 'admin': Only administrators can access (alpha testing)
 *   - 'beta': Only users in the betaUsers email list can access (beta testing)
 *   - 'public': All authenticated users can access (general availability)
 */
export interface FeaturePermission {
  /** The type of widget this permission applies to */
  widgetType: WidgetType | InternalToolType;
  /** The access level determining who can use this widget */
  accessLevel: AccessLevel;
  /** Array of email addresses for beta testing access (only used when accessLevel is 'beta') */
  betaUsers: string[];
  /** When false, disables the widget for everyone including admins */
  enabled: boolean;
  /** Optional override for grade levels. If set, this takes precedence over the static configuration. */
  gradeLevels?: GradeLevel[];
  /** Optional override for the widget's display name. */
  displayName?: string;
  /**
   * Minimum user tier required to access the widget (free < org <
   * internal). `undefined` means available to all tiers — the back-compat
   * default for every doc written before the tier model existed.
   * Admins bypass this check (same as accessLevel).
   */
  minTier?: UserTier;
  /** Optional global configuration for the widget (e.g., API keys, target IDs). */
  config?: Record<string, unknown>;
}

export interface CarRiderProGlobalConfig {
  /** District portal login URL for the Car Rider Pro dismissal widget */
  url?: string;
}

export interface BlendingBoardGlobalConfig {
  /** Embedded research/blending board URL configured by district admin */
  url?: string;
}

export interface First5GlobalConfig {
  /** The day number as of the reference date */
  activeDayNumber?: number;
  /** ISO date string (YYYY-MM-DD) when activeDayNumber was last set */
  referenceDate?: string;
  /** Per-building dock visibility overrides */
  dockDefaults?: Record<string, boolean>;
}

/**
 * Per-instance config for the `first-5` widget. The widget reads all of its
 * runtime configuration from the admin-managed {@link First5GlobalConfig}
 * (fetched from Firestore via `useFirst5Url`), so an individual `first-5`
 * widget instance carries no per-instance settings — its `widget.config` is
 * an empty object. This interface exists so `first-5` is represented in the
 * `WidgetConfig` union and `ConfigForWidget<'first-5'>` (which would otherwise
 * resolve to `never`).
 *
 * It carries a single optional brand field rather than being a truly empty
 * interface: an empty `{}` interface trips `no-empty-object-type`, while
 * `Record<string, never>` adds an index signature that breaks the
 * `WidgetConfig` union spreads in DashboardContext. An optional brand keeps an
 * empty `{}` assignable (the runtime config is always empty) without either
 * problem — so no lint suppression is needed.
 */
export interface First5Config {
  /**
   * Discriminant only — never written at runtime. Present so the interface is
   * non-empty (and has no index signature); `first-5` has no per-instance
   * settings.
   */
  readonly __brand?: 'first-5';
}

export interface LunchCountGlobalConfig {
  /** Google Sheet ID for Schumann Elementary submissions */
  schumannSheetId?: string;
  /** Google Sheet ID for Intermediate School submissions */
  intermediateSheetId?: string;
  /** Apps Script web app URL used to POST submission data */
  submissionUrl?: string;
}

export interface BackgroundPreset {
  id: string;
  url: string;
  label: string;
  thumbnailUrl?: string;
  active: boolean; // Whether it shows up for users
  accessLevel: AccessLevel; // Who can see it
  betaUsers: string[]; // Specific users if beta
  createdAt: number;
  /** Admin-defined category label (e.g. "Nature", "Holidays") */
  category?: string;
  /** Admin-defined tags for filtering (e.g. ["calm", "holiday"]) */
  tags?: string[];
  /** Building IDs this background is assigned to; empty/undefined = all buildings */
  buildingIds?: string[];
  /** Whether this background is featured in the sidebar overview (max ~6 per category) */
  featured?: boolean;
}

// --- GLOBAL STYLING TYPES ---

export type GlobalFontFamily =
  | 'sans'
  | 'serif'
  | 'mono'
  | 'handwritten'
  | 'rounded'
  | 'fun'
  | 'comic'
  | 'slab'
  | 'retro'
  | 'marker'
  | 'cursive';

export interface GlobalStyle {
  fontFamily: GlobalFontFamily;
  windowTransparency: number; // 0 to 1
  windowBorderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  dockTransparency: number; // 0 to 1
  dockBorderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  dockTextColor: string; // hex color
  dockTextShadow: boolean;
  /** Custom brand colors — injected as CSS variables at the dashboard root */
  primaryColor?: string; // hex, defaults to brand-blue-primary (#2d3f89)
  accentColor?: string; // hex, defaults to brand-red-primary (#ad2122)
  windowTitleColor?: string; // hex, defaults to white (#ffffff)
}

/**
 * Configuration for the universal widget scaling system.
 * Defines how a widget should be scaled within its window.
 */
export interface ScalingConfig {
  /** The target internal width (in pixels) the widget is designed for. */
  baseWidth: number;
  /** The target internal height (in pixels) the widget is designed for. */
  baseHeight: number;
  /**
   * If true, the widget's internal layout can expand horizontally or vertically
   * beyond the base dimensions while maintaining the calculated scale.
   * Useful for widgets with flexible content like text or lists.
   */
  canSpread?: boolean;
  /**
   * If true, skips the automatic JS-based scaling.
   * Modern widgets should use CSS Container Queries instead.
   */
  skipScaling?: boolean;
  /**
   * Optional padding override (e.g. 0).
   * Used to eliminate excess space in modern layouts.
   */
  padding?: number;
}

// --- ANNOUNCEMENT SYSTEM TYPES ---

export type AnnouncementActivationType = 'manual' | 'scheduled';
export type AnnouncementDismissalType =
  | 'user'
  | 'scheduled'
  | 'duration'
  | 'admin';

/**
 * An admin-created announcement that is pushed to users' dashboards as an overlay widget.
 * Stored in Firestore under /announcements/{id}.
 * All authenticated users can read; only admins can write.
 */
export interface Announcement {
  id: string;
  /** Admin-facing label for this announcement */
  name: string;
  /** The widget type to display in the overlay */
  widgetType: WidgetType;
  /**
   * The widget's configuration. Stored as a flexible record so partial configs
   * from the admin form round-trip cleanly through Firestore.
   */
  widgetConfig: Record<string, unknown>;
  /** Pixel dimensions for the widget window */
  widgetSize: { w: number; h: number };
  /** When true, the announcement expands to fill the full viewport */
  maximized: boolean;
  /** Whether activation is triggered manually or at a scheduled time of day */
  activationType: AnnouncementActivationType;
  /** HH:MM in 24h format — used when activationType is 'scheduled' */
  scheduledActivationTime?: string;
  /** YYYY-MM-DD local date — used when activationType is 'scheduled' */
  scheduledActivationDate?: string;
  /** YYYY-MM-DD local date — optional auto-deactivate end date (paired with scheduledEndTime) */
  scheduledEndDate?: string;
  /** HH:MM in 24h format — optional auto-deactivate end time (paired with scheduledEndDate) */
  scheduledEndTime?: string;
  /** Whether the announcement is currently active (visible to targeted users) */
  isActive: boolean;
  /**
   * Timestamp (ms) when this announcement was most recently activated.
   * Used as a push epoch — if a user dismissed it before this timestamp, it shows again.
   */
  activatedAt: number | null;
  /** How the overlay can be dismissed by end users */
  dismissalType: AnnouncementDismissalType;
  /** HH:MM in 24h format — used when dismissalType is 'scheduled' */
  scheduledDismissalTime?: string;
  /** Seconds until auto-dismiss — used when dismissalType is 'duration' */
  dismissalDurationSeconds?: number;
  /**
   * Building IDs this announcement targets.
   * An empty array means no building-level targeting.
   * This is a broadcast to everyone only when targetUsers is also empty.
   */
  targetBuildings: string[];
  /**
   * Email addresses this announcement targets.
   * An empty array means no user-level targeting (falls back to building targeting).
   * When both targetBuildings and targetUsers are set, OR logic is used.
   * Older Firestore documents may omit this field; treat an omitted value the same as [].
   */
  targetUsers?: string[];
  createdAt: number;
  updatedAt: number;
  /** Email of the admin who created/last modified this announcement */
  createdBy: string;
  /**
   * The organization this announcement belongs to (multi-tenant isolation).
   * Stamped to the creating admin's `orgId` at create time (Orono = 'orono').
   * OMITTED for legacy docs created before org-isolation shipped — an absent
   * value is treated as operator-org/global and stays visible to all
   * authenticated users (the overlay's client filter and the Firestore read
   * rule both keep legacy docs readable, preserving existing behavior).
   * A backfill script (scripts/migrateAnnouncements.js) stamps 'orono' onto
   * every legacy doc before the External launch.
   */
  orgId?: string;
}

export const DEFAULT_GLOBAL_STYLE: GlobalStyle = {
  fontFamily: 'sans',
  windowTransparency: 0.8,
  windowBorderRadius: '2xl',
  dockTransparency: 0.4,
  dockBorderRadius: 'full',
  dockTextColor: '#334155', // Slate 700 (dark grey)
  dockTextShadow: false,
  // Brand color defaults — shared source of truth used by DashboardView (CSS vars) and StylePanel (pickers)
  primaryColor: '#2d3f89', // brand-blue-primary
  accentColor: '#ad2122', // brand-red-primary
  windowTitleColor: '#ffffff',
};

// --- DASHBOARD TEMPLATE TYPES ---

/**
 * A reusable dashboard template that admins can define and assign to users.
 * Stored in Firestore under /dashboard_templates/{id}.
 * All authenticated users can read; only admins can write.
 */
export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * Discriminates Board templates (this interface) from Collection
   * templates (see CollectionTemplate). Optional + literal 'board' so
   * legacy docs without the field deserialize as Board templates with
   * zero migration. Always pass 'board' when writing new docs.
   */
  type?: 'board';
  /** Snapshot of widgets to pre-populate the dashboard with */
  widgets: WidgetData[];
  /** Optional global style override applied when template is deployed */
  globalStyle?: Partial<GlobalStyle>;
  /** Optional background to apply (Tailwind class, hex, gradient, or URL) */
  background?: string;
  /** Tag labels for filtering in the template browser */
  tags: string[];
  /** Grade-level targeting — empty means applicable to all grades */
  targetGradeLevels: GradeLevel[];
  /** Building IDs this template is offered to; empty = all buildings */
  targetBuildings: string[];
  /** Whether this template is available to users (replaces isPublished) */
  enabled: boolean;
  /** Who can see/use this template */
  accessLevel: 'admin' | 'beta' | 'public';
  createdAt: number;
  updatedAt: number;
  createdBy: string; // admin email
}

/**
 * A single Board's snapshot when embedded inside a CollectionTemplate.
 * Mirrors the fields that `sanitizeBoardSnapshot` preserves — the rest
 * of a Dashboard's surface is host-specific and stripped at capture
 * time. `id` is the host's original Board id; the importer assigns a
 * fresh id during instantiation, so this id is for ordering / debugging
 * only.
 */
export interface BoardTemplateSnapshot {
  id: string;
  name: string;
  background: string;
  widgets: WidgetData[];
  globalStyle?: Partial<GlobalStyle>;
  settings?: DashboardSettings;
  libraryOrder?: (WidgetType | InternalToolType)[];
  viewportWidth?: number;
  viewportHeight?: number;
  createdAt: number;
}

/**
 * A Collection's metadata captured for the template browser. Mirrors the
 * subset of `Collection` that admins curate; the recipient's
 * createCollection action stamps fresh `id`, `order`, `createdAt` /
 * `updatedAt`, and `parentCollectionId: null` (templates always land at
 * root — admins or teachers move them after).
 */
export interface CollectionTemplateSnapshot {
  name: string;
  color?: string;
  icon?: string;
  /**
   * Optional default-board hint: the snapshot id of the Board that
   * should be marked as the Collection's default on first open. Stored
   * as the `BoardTemplateSnapshot.id`; resolved to the recipient's new
   * Board id at hydration time. Undefined means no default.
   */
  defaultBoardSnapshotId?: string;
}

/**
 * A Collection-level template. Same Firestore collection as
 * `DashboardTemplate` (`/dashboard_templates/`) — the `type` field
 * discriminates. Admin-curated, authed-read, same rule gate.
 */
export interface CollectionTemplate {
  id: string;
  type: 'collection';
  name: string;
  description: string;
  collectionSnapshot: CollectionTemplateSnapshot;
  /** Ordered list — defines the order child Boards appear in the new Collection. */
  boardSnapshots: BoardTemplateSnapshot[];
  tags: string[];
  targetGradeLevels: GradeLevel[];
  targetBuildings: string[];
  enabled: boolean;
  accessLevel: 'admin' | 'beta' | 'public';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

/**
 * Union of every doc shape stored in `/dashboard_templates/`. Read sites
 * MUST discriminate via `isCollectionTemplate` / `isBoardTemplate` before
 * accessing Board-only fields like `widgets`.
 */
export type AnyTemplate = DashboardTemplate | CollectionTemplate;

export const isCollectionTemplate = (t: AnyTemplate): t is CollectionTemplate =>
  t.type === 'collection';

export const isBoardTemplate = (t: AnyTemplate): t is DashboardTemplate =>
  t.type === 'board' || t.type === undefined;

// --- CUSTOM WIDGET TYPES (Phase 3: No-Code Widget Builder) ---

/** Block types available in the visual block builder */
export type CustomBlockType =
  // Display blocks
  | 'text'
  | 'heading'
  | 'image'
  | 'reveal'
  | 'flip-card'
  | 'conditional-label'
  | 'badge'
  | 'traffic-light'
  | 'divider'
  | 'spacer'
  // Input & Control blocks
  | 'cb-button'
  | 'counter'
  | 'toggle'
  | 'stars'
  | 'text-input'
  | 'poll'
  // Game & Assessment blocks
  | 'multiple-choice'
  | 'match-pair'
  | 'hotspot'
  | 'sort-bin'
  // Progress & Measurement blocks
  | 'progress'
  | 'timer'
  | 'score'
  | 'checklist';

/** Events that blocks can fire */
export type BlockEvent =
  | 'on-click'
  | `on-spot-clicked-${number}`
  | 'on-correct'
  | 'on-incorrect'
  | 'on-all-matched'
  | 'on-item-sorted'
  | 'on-all-sorted'
  | 'on-timer-end'
  | 'on-timer-start'
  | 'on-timer-stop'
  | `on-counter-reach-${number}`
  | `on-score-reach-${number}`
  | `on-value-reach-${number}`
  | 'on-toggle-on'
  | 'on-toggle-off'
  | `on-vote-option-${number}`
  | `on-star-rated-${number}`
  | 'on-item-checked'
  | 'on-all-checked'
  | 'on-input-submit';

/** Actions that blocks can receive */
export type BlockAction =
  | 'show'
  | 'hide'
  | 'reveal'
  | 'flip'
  | 'flip-back'
  | 'set-text'
  | 'set-image'
  | 'increment'
  | 'decrement'
  | 'set-value'
  | 'reset'
  | 'reset-all'
  | 'start-timer'
  | 'stop-timer'
  | 'set-traffic'
  | 'play-sound'
  | 'show-toast'
  | 'check-item'
  | 'add-score'
  | 'toggle-on'
  | 'toggle-off'
  | 'select-option'
  | 'complete-pair'
  | 'sort-item'
  | 'vote-option';

/** An IFTTT-style connection between two blocks */
export interface BlockConnection {
  id: string;
  sourceBlockId: string;
  event: string; // BlockEvent (string for flexibility)
  targetBlockId: string;
  action: BlockAction;
  /** Optional string payload (e.g. text for set-text, sound name for play-sound) */
  actionPayload?: string;
  /** Optional numeric payload (e.g. value for set-value, add-score) */
  actionValue?: number;
  /** Optional guard condition */
  condition?: {
    watchBlockId: string;
    operator: 'gte' | 'lte' | 'eq' | 'neq';
    value: number | boolean;
  };
}

/** Style overrides for an individual block cell */
export interface BlockStyle {
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
  padding?: string;
  fontSize?: string;
}

/** Per-block config types */
export interface TextBlockConfig {
  text: string;
}
export interface HeadingBlockConfig {
  text: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
export interface ImageBlockConfig {
  url: string;
  alt?: string;
  objectFit?: 'cover' | 'contain';
}
export interface RevealBlockConfig {
  contentType: 'text' | 'image';
  content: string;
  animation?: 'fade' | 'scale' | 'slide';
}
export interface FlipCardBlockConfig {
  frontType: 'text' | 'image';
  frontContent: string;
  backType: 'text' | 'image';
  backContent: string;
}
export interface ConditionalLabelBlockConfig {
  initialText: string;
}
export interface BadgeBlockConfig {
  icon: string; // lucide key (or legacy emoji)
  label?: string;
}
export interface TrafficLightBlockConfig {
  initialColor: 'red' | 'yellow' | 'green';
  label?: string;
}
export interface ButtonBlockConfig {
  label: string;
  icon?: string;
  style?: 'primary' | 'secondary' | 'danger';
  initialHidden?: boolean;
}
export interface CounterBlockConfig {
  label?: string;
  startValue: number;
  min?: number;
  max?: number;
  step?: number;
  eventThreshold?: number;
}
export interface ToggleBlockConfig {
  label?: string;
  initialOn?: boolean;
}
export interface StarsBlockConfig {
  maxStars?: number;
  initialValue?: number;
}
export interface TextInputBlockConfig {
  label?: string;
  placeholder?: string;
  submitLabel?: string;
}
export interface PollBlockConfig {
  question?: string;
  options: string[];
  showResults?: boolean;
}
export interface MultipleChoiceBlockConfig {
  question?: string;
  options: string[];
  correctIndex: number;
}
export interface MatchPairBlockConfig {
  leftItems: string[];
  rightItems: string[];
  correctPairs: number[]; // rightItems[i] matches leftItems[correctPairs[i]]
}
export interface HotspotBlockConfig {
  imageUrl: string;
  spots: Array<{ label: string; x: number; y: number }>;
}
export interface SortBinBlockConfig {
  bins: string[];
  items: Array<{ label: string; correctBin: number }>;
}
export interface ProgressBlockConfig {
  min?: number;
  max?: number;
  startValue?: number;
  label?: string;
}
export interface TimerBlockConfig {
  durationSeconds: number;
  autoStart?: boolean;
  showControls?: boolean;
}
export interface ScoreBlockConfig {
  label?: string;
  startValue?: number;
  eventThreshold?: number;
}
export interface ChecklistBlockConfig {
  items: string[];
}

export type BlockConfig =
  | TextBlockConfig
  | HeadingBlockConfig
  | ImageBlockConfig
  | RevealBlockConfig
  | FlipCardBlockConfig
  | ConditionalLabelBlockConfig
  | BadgeBlockConfig
  | TrafficLightBlockConfig
  | ButtonBlockConfig
  | CounterBlockConfig
  | ToggleBlockConfig
  | StarsBlockConfig
  | TextInputBlockConfig
  | PollBlockConfig
  | MultipleChoiceBlockConfig
  | MatchPairBlockConfig
  | HotspotBlockConfig
  | SortBinBlockConfig
  | ProgressBlockConfig
  | TimerBlockConfig
  | ScoreBlockConfig
  | ChecklistBlockConfig;

/** A single block placed in a grid cell */
export interface CustomBlockDefinition {
  id: string;
  type: CustomBlockType;
  config: BlockConfig;
  style: BlockStyle;
  /** Auto-generated human-readable name, e.g. "Button A1" */
  name?: string;
}

/** A cell in the custom widget grid */
export interface CustomGridCell {
  id: string;
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
  block: CustomBlockDefinition | null;
}

/** Grid layout for a block-mode custom widget */
export interface CustomGridDefinition {
  columns: number; // 1–4
  rows: number; // 1–8
  cells: CustomGridCell[];
  connections: BlockConnection[];
}

/** An admin-configurable setting exposed by a custom widget */
export interface CustomWidgetSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  defaultValue: string | number | boolean;
  options?: string[]; // for type 'select'
}

/** Firestore document for a published custom widget */
export interface CustomWidgetDoc {
  id: string;
  slug: string;
  title: string;
  description?: string;
  icon: string; // lucide key (or legacy emoji)
  color: string; // Tailwind bg-* class
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  mode: 'block' | 'code';
  published: boolean;
  buildings: string[];
  gridDefinition?: CustomGridDefinition;
  codeContent?: string;
  defaultWidth: number;
  defaultHeight: number;
  settings: CustomWidgetSettingDef[];
  accessLevel: 'admin' | 'beta' | 'public';
  betaUsers: string[];
  enabled: boolean;
}

/** Config stored in WidgetData for a custom-widget instance */
export interface CustomWidgetConfig {
  /** ID of the CustomWidgetDoc in Firestore */
  customWidgetId: string;
  /** Admin-configured settings values (keyed by CustomWidgetSettingDef.key) */
  adminSettings?: Record<string, string | number | boolean>;
}

/**
 * A user-saved widget shortcut. Created when a user taps "Save as widget" on
 * a configurable widget (currently Mini Apps) — the widget's config is frozen
 * into `config` and surfaced as a one-tap entry in the user's dock and
 * Widget Library. Per-user; lives at /users/{uid}/saved_widgets/{id}.
 */
/**
 * Narrow union of widget types eligible to be saved as user shortcuts.
 * Only `miniApp` produces saved widgets today; widening this requires
 * deciding what `config` shape each new type freezes (see SavedWidget.config).
 */
export type SavedWidgetType = 'miniApp';

export interface SavedWidget {
  id: string;
  /** The underlying widget type to instantiate */
  widgetType: SavedWidgetType;
  /** Display name shown in the dock and library */
  title: string;
  /** Icon key from CUSTOM_WIDGET_ICON_OPTIONS */
  icon: string;
  /** Tailwind bg-* class (e.g. 'bg-purple-500') */
  color: string;
  /** Frozen config snapshot used to instantiate the widget */
  config: Partial<MiniAppConfig>;
  /** Whether this saved widget is pinned to the dock toolbar */
  pinnedToDock: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RemoteGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

// === Video Activity assignments ===
// Assignment-lifecycle types for the Video Activity widget's Wave 2 library.
// Mirrors the shape of QuizAssignment* but scoped to Video Activity sessions.

export type VideoActivityAssignmentStatus = 'active' | 'paused' | 'inactive';

/** See `VideoActivityAssignment.sync`. Mirrors `QuizAssignmentSyncLinkage`. */
export interface VideoActivityAssignmentSyncLinkage {
  groupId: string;
  syncedVersion: number;
}

/** Persisted settings for a Video Activity assignment (session behavior flags). */
export interface VideoActivityAssignmentSettings {
  /** Free-text label shown in the archive (e.g. "Period 2"). */
  className?: string;
  /** Player-behavior toggles captured at assign time (autoPlay, etc.). */
  sessionSettings: VideoActivitySessionSettings;
  /**
   * Assignment-policy options (security, feedback, scoring). Mirrors
   * `QuizAssignmentSettings.sessionOptions`. Optional so legacy assignments
   * persist without these knobs; consumers default missing fields safely.
   */
  sessionOptions?: VideoActivitySessionOptions;
  /**
   * Score visibility level chosen by the teacher. Authoritative for what the
   * student sees on the post-completion screen.
   */
  scoreVisibility?: VideoActivityScoreVisibility;
  /** Server-set timestamp for when scores were published (publishScoresModal). */
  scorePublishedAt?: number;
  /**
   * Per-roster period name(s) the assignment targets. Mirrors
   * `QuizAssignment.periodNames` — populated at create time from the
   * roster picker so the student-app post-PIN picker has stable labels.
   */
  periodNames?: string[];
  /**
   * Single period name for legacy compatibility. Set to `periodNames[0]` at
   * write time so pre-multiclass clients can still read a single label.
   * Mirrors `QuizAssignment.periodName`.
   */
  periodName?: string;
  /**
   * Display name of the teacher who owns this assignment. Surfaces in the
   * exported PLC sheet's "Teacher" column. Mirrors `QuizAssignment.teacherName`.
   */
  teacherName?: string;
  /**
   * PLC linkage. Set when the teacher opts into PLC mode at assign time. The
   * `sheetUrl` on this sub-object is the canonical export target — when
   * absent, PR3 auto-creates the sheet on first export. Mirrors
   * `QuizAssignment.plc`.
   */
  plc?: PlcLinkage;
  /**
   * Sync-group linkage. Present iff this assignment was created from (or
   * imported as) a synced share. Drives the per-assignment "Sync" button
   * which detects divergence against `/synced_video_activities/{groupId}`
   * and offers to pull the canonical's latest content.
   */
  sync?: VideoActivityAssignmentSyncLinkage;
}

/**
 * A single instance of a Video Activity being assigned. Stored per-teacher at
 * `/users/{teacherUid}/video_activity_assignments/{assignmentId}`. The
 * assignment id is the same id as the matching `/video_activity_sessions/{sessionId}`
 * document (1:1 pairing, matches the Quiz pattern).
 */
export interface VideoActivityAssignment extends VideoActivityAssignmentSettings {
  /** Assignment UUID — also the sessionId. */
  id: string;
  activityId: string;
  activityTitle: string;
  /** Drive file id of the source activity so downstream views can rehydrate. */
  activityDriveFileId: string;
  teacherUid: string;
  status: VideoActivityAssignmentStatus;
  createdAt: number;
  updatedAt: number;
  /** Unified roster targeting. New (post-unification) assignments write this;
   *  legacy assignments read via `className` / session.classIds only. See
   *  `utils/resolveAssignmentTargets.ts`. */
  rosterIds?: string[];
  /** Frozen at creation from the org-wide `assignment-modes` admin setting.
   *  Mirrors VideoActivitySession.mode. Absent on pre-feature assignments. */
  mode?: AssignmentMode;
  /**
   * Set when this assignment is attached to a Google Classroom coursework item
   * via the add-on. Mirrors the matching `VideoActivitySession.classroomAttachment`
   * (written together at attach time). `maxPoints` is the activity's total point
   * value so pushed grades read identically in Classroom.
   */
  classroomAttachment?: ClassroomAttachmentLink;
  /** Item D part 2 — multi-course attachments (read via getClassroomAttachments). */
  classroomAttachments?: ClassroomAttachmentLink[];
}

// === MiniApp assignments ===
// Appended by Wave 2-MA. Keep in this delimited section so other Wave 2
// migrations appending to types.ts don't collide.

/**
 * A persistent archive row for a MiniApp that the teacher has assigned to
 * students. Lives in `/users/{teacherUid}/miniapp_assignments/{assignmentId}`.
 *
 * Unlike QuizAssignment, a MiniApp assignment is a thin archive record — the
 * actual live student link is the underlying MiniAppSession (see
 * `/mini_app_sessions/{sessionId}`). `sessionId` here is that session's doc id.
 *
 * `status` mirrors the session lifecycle:
 *   - `active`: session is live.
 *   - `inactive`: session has been ended.
 */
export interface MiniAppAssignment {
  id: string;
  sessionId: string;
  appId: string;
  appTitle: string;
  assignmentName: string;
  teacherUid: string;
  status: 'active' | 'inactive';
  createdAt: number;
  updatedAt: number;
  /** Unified roster targeting. Present on new (post-unification) assignments.
   *
   *  The student SSO gate lives on the session doc (`MiniAppSession.classIds`,
   *  derived at assign time from these rosters' `classlinkClassId`); the
   *  assignment doc intentionally does NOT mirror `classIds`, matching the
   *  Quiz / VideoActivity / GuidedLearning assignment shapes.
   *
   *  Legacy pre-unification assignments may have no targeting fields at all
   *  and read their targeting via the paired session doc. See
   *  `utils/resolveAssignmentTargets.ts`. */
  rosterIds?: string[];
  /** Mirrors `MiniAppSession.submissionsEnabled`. When true, the runner
   * reveals the Submit button and persists student submissions. */
  submissionsEnabled?: boolean;
  /** Mirrors `MiniAppSession.mode`. Frozen at creation from the admin
   *  `assignment-modes` setting. Absent on pre-feature assignments. */
  mode?: AssignmentMode;
}

// === /MiniApp assignments ===

// === Guided Learning assignments ===
// Appended by Wave 2-GL migration. Models the per-teacher archive of guided
// learning sessions so the unified Library shell can surface "In Progress"
// and "Archive" tabs. An assignment pairs a GuidedLearningSession document
// (under /guided_learning_sessions/{sessionId}) with a per-teacher archive
// entry (under /users/{userId}/guided_learning_assignments/{id}).
export type GuidedLearningAssignmentStatus = 'active' | 'archived';

export interface GuidedLearningAssignment {
  /** Document id — matches the session id. */
  id: string;
  /** ID of the set that was assigned. */
  setId: string;
  /** Snapshot of the set's title at assign time. */
  setTitle: string;
  /** Session id (== `id`). The student-facing URL uses this. */
  sessionId: string;
  /** Firebase UID of the teacher who created the assignment. */
  teacherUid: string;
  /** Whether the assignment is still accepting responses. */
  status: GuidedLearningAssignmentStatus;
  /** Epoch ms at create. */
  createdAt: number;
  /** Epoch ms at last status change. */
  updatedAt: number;
  /** Set to epoch ms when the teacher archives this assignment. */
  archivedAt?: number | null;
  /** Optional origin set: 'personal' (Drive) or 'building' (Firestore). */
  source?: 'personal' | 'building';
  /** Unified roster targeting (new post-unification assignments). */
  rosterIds?: string[];
  /** Frozen at creation from the org-wide `assignment-modes` admin setting.
   *  Stored under `assignmentMode` (not `mode`) to avoid colliding with the
   *  GL session's existing play-mode field. Absent on pre-feature assignments. */
  assignmentMode?: AssignmentMode;
  /**
   * Teacher-controlled gate on what students see on the `/my-assignments`
   * Completed review screen. Absent / `'none'` ⇒ unpublished (Quiz/VA
   * parity). Set by `publishAssignmentScores`. Mirrored onto
   * {@link GuidedLearningSession.scoreVisibility} so the realtime student
   * listener can react without subscribing to teacher-owned docs.
   */
  scoreVisibility?: GuidedLearningScoreVisibility;
  /** Epoch ms of the most recent `publishAssignmentScores` call. Cleared
   *  (via `deleteField`) on unpublish. */
  scorePublishedAt?: number;
}

// === Library folders (Wave 3) ===
//
// Folder organization for the four library-style widgets (Quiz, Video
// Activity, Guided Learning, MiniApp). Each widget has its OWN folders
// collection — folders are never shared across widgets.
//
// Storage shape: a flat per-widget collection at
//   /users/{userId}/{widget}_folders/{folderId}
// where `{widget}` is one of `quiz`, `video_activity`, `guided_learning`,
// `miniapp`. Nested folders are modeled via `parentId` (string id of
// the parent, or `null` for root) rather than nested subcollection paths.
//
// Why flat-collection-with-`parentId` instead of nested paths:
//   - Firestore cannot query across subcollection segments. A flat
//     collection lets us list all folders for a widget in one snapshot
//     and build the tree client-side, and lets us reorder / move between
//     folders with a single-field update.
//   - Library items (quizzes, activities, sets, miniapps) stay in their
//     existing metadata collections; each item gains an optional
//     `folderId` pointer. `null` / missing means root.
//
// Implementation lands in Wave 3-B. This schema PR only introduces the
// types, the Firestore security rules, and empty stubs for the consumer
// hook + UI components.

/** Which library the folders belong to. Folders never cross widgets. */
export type LibraryFolderWidget =
  | 'quiz'
  | 'video_activity'
  | 'guided_learning'
  | 'miniapp';

/**
 * A folder record stored at
 * `/users/{userId}/{widget}_folders/{folderId}`.
 *
 * Siblings within a given `parentId` are ordered by the `order` field
 * (ascending); ties break by `createdAt`. `parentId: null` = root-level
 * folder. Folder-name uniqueness is NOT enforced by the schema — the UI
 * layer may append " (2)" on collision, but two sibling folders are
 * allowed to share a name if the user really wants that.
 */
export interface LibraryFolder {
  id: string;
  name: string;
  /** Parent folder id, or `null` for root-level folders. */
  parentId: string | null;
  /** Sort order among siblings (ascending). */
  order: number;
  /** Epoch ms at create. */
  createdAt: number;
  /** Epoch ms at last rename / move / reorder. Optional on legacy records. */
  updatedAt?: number;
}

/**
 * A Board collection (folder) stored at
 * `/users/{userId}/collections/{collectionId}`.
 *
 * Collections are nestable: `parentCollectionId === null` means root-level.
 * Sibling collections within a given parent are ordered by `order` ascending.
 *
 * `defaultBoardId` is the Board that loads when a teacher first enters this
 * Collection (before any per-Collection history is recorded). Only one Board
 * per Collection may be the default; the constraint is enforced in
 * `useCollections.setCollectionDefaultBoard`.
 */
export interface Collection {
  id: string;
  name: string;
  /** Parent collection id, or `null` for root-level collections. */
  parentCollectionId: string | null;
  /** Sort order among siblings (ascending). */
  order: number;
  /** Optional accent color (any CSS color string, e.g. '#ad2122'). */
  color?: string;
  /** Optional lucide-react icon name (e.g., 'BookOpen'). */
  icon?: string;
  /** Board id to load on first entry to this collection. */
  defaultBoardId?: string;
  /** Epoch ms at create. */
  createdAt: number;
  /** Epoch ms at last rename / move / reorder / metadata change. */
  updatedAt?: number;
}

/**
 * Mode applied to a shared-Collection import. NOT including 'synced' —
 * live-mirroring N boards is unbounded cost. Substitute is a frozen,
 * time-boxed view-only flavor used by the /subs portal.
 */
export type SharedCollectionImportMode = 'copy' | 'substitute';

/**
 * Frozen snapshot stored at `/shared_collections/{shareId}`. Each Board
 * in the Collection is stored as a separate doc under
 * `/shared_collections/{shareId}/boards/{boardId}` to dodge Firestore's
 * 1MB-per-doc limit. The parent doc stores Collection metadata + an
 * ordered `boardIds` list for the recipient flow.
 */
export interface SharedCollection {
  shareId: string;
  hostUid: string;
  hostDisplayName: string | null;
  intendedMode: SharedCollectionImportMode;
  /** Frozen Collection metadata at share time (NOT the live Collection). */
  collection: {
    name: string;
    color?: string;
    icon?: string;
  };
  /** Ordered Board IDs — recipient reads from subcollection by these IDs. */
  boardIds: string[];
  /** ms epoch. */
  createdAt: number;
  /** Substitute-only: ms epoch when this share expires. */
  expiresAt?: number;
  /** Substitute-only: building id (config/buildings.ts) for /subs scoping. */
  buildingId?: string;
  /** Substitute-only: @orono.k12.mn.us emails granted Drive roster access. */
  subEmails?: string[];
  /**
   * Substitute-only: per-email/file Drive permission ids for revocation.
   * Mirrors `SubstituteShareFields.driveGrants` on single-board shares — the
   * grants are share-level (granted once per (roster file, sub email)), so
   * they live on the Collection parent doc rather than on each board sub-doc.
   * Swept by `useReconcileExpiredSubShares` / `expireSubShares` on expiry.
   */
  driveGrants?: SubstituteShareDriveGrant[];
}

/**
 * One Board snapshot inside a Collection share. Stored at
 * `/shared_collections/{shareId}/boards/{boardId}`. Mirrors the existing
 * `Dashboard` shape minus any `linkedShareId`/`linkedShareRole` fields
 * (a share-import is never itself a share host).
 */
export interface SharedCollectionBoardDoc {
  boardId: string;
  /** Frozen `Dashboard` at share time. */
  dashboard: Dashboard;
}

/**
 * Input to `shareSubstituteCollection()`. Mirrors `SubstituteShareInput`
 * for single Boards but operates on a whole Collection.
 */
export interface CollectionSubstituteShareInput {
  collectionId: string;
  expiresAt: number;
  buildingId: string;
  subEmails?: string[];
  rosterDriveFileIds?: string[];
}

/**
 * Admin-created short link, stored at `/short_links/{code}`. The doc id is
 * the public-facing code (e.g. `lesson-1`); the URL `${origin}/r/${code}`
 * resolves client-side via `ShortLinkRedirect` and bumps the `clicks`
 * counter atomically before redirecting the browser to `destination`.
 */
export interface ShortLink {
  /** Doc id and URL path segment. Lowercased, slug-safe, unique. */
  code: string;
  /** Absolute http(s) URL to redirect to. */
  destination: string;
  /** Creator uid (for table display + audit). */
  createdBy: string;
  /** Creator email at create time (snapshot — not kept in sync). */
  createdByEmail: string;
  /** Epoch ms at create. */
  createdAt: number;
  /** Epoch ms at last edit. */
  updatedAt: number;
  /** Total resolved clicks. Incremented atomically by the resolver. */
  clicks: number;
  /** Epoch ms of the most recent click, or null if never clicked. */
  lastClickedAt: number | null;
  /** Optional human-readable name shown in the admin table. */
  label?: string;
}
