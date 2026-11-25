import type { PeriodRoster } from '@/utils/periodPlan';
import type {
  AccessMode,
  AssignmentMode,
  AudienceSessionFields,
  PeriodAccess,
  Plc,
  PlcLinkage,
  QuestionBankData,
  QuizAssignment,
  QuizAssignmentSettings,
  QuizAssignmentStatus,
  QuizAssignmentSyncLinkage,
  QuizData,
  QuizMetadataSyncLinkage,
  QuizOrderEntry,
  QuizQuestion,
  QuizScoreVisibility,
  QuizSection,
  QuizSessionBankSlot,
  QuizStimulus,
  QuizTranslationIndexEntry,
  QuizWidgetKind,
  ResultsProtection,
  StudentOverride,
  WrittenReturnMode,
} from '@/types';
import type { WorkKind } from '@/utils/gradebook/gradebookCore';
import type { PeriodAccessWindowEdits } from '@/utils/assignAvailability';
import type { LoadBankContentsForQuiz } from '@/utils/quizShareContent';
import type { SessionTargets } from '@/utils/resolveAssignmentTargets';
import type { ResponseDocKey } from '../useQuizSession';

/** Import-mode picker result for shared-assignment paste flows. */
export type SharedAssignmentImportMode = 'sync' | 'copy';

/**
 * Options for `createAssignment`. Replaces the previous 8-positional
 * argument list; named fields make the read-site at every call clearer
 * and let new options land without churning every existing caller.
 */
export interface CreateAssignmentOptions extends AudienceSessionFields {
  /** Defaults to `'active'`. */
  initialStatus?: QuizAssignmentStatus;
  /** Assigned on paper: marks the assignment and links the printed stack it imports from. */
  paperBatchId?: string;
  /** Device assignment whose written questions print on this written-answers-only stack. */
  paperWritten?: { batchId: string; questionIds: string[]; seats: number };
  /** Owning widget, mirrored onto assignment + session; omitted while the split flag is off. */
  widgetKind?: QuizWidgetKind;
  /** Review game length (plan D22); only written for `sessionMode: 'game'`. */
  gameDurationMs?: number;
  /**
   * ClassLink class `sourcedId`s this session targets. Empty/missing
   * keeps the session open to the legacy code/PIN-only flow. When
   * non-empty, both `classIds` (multi-class) and the legacy single-
   * class `classId` mirror are written to the session doc so the
   * student-side SSO gate on Firestore rules still resolves.
   */
  classIds?: string[];
  /** Roster ids (unified targeting); mirrored onto assignment + session. */
  rosterIds?: string[];
  /**
   * Map from each targeted classId to its corresponding roster name
   * (= period name). Written onto the session doc so SSO joiners can
   * snapshot `classPeriod` on their response without resolving the
   * teacher's roster doc. Derived alongside `classIds` / `rosterIds`
   * via `deriveSessionTargetsFromRosters`.
   */
  classPeriodByClassId?: Record<string, string>;
  /** Per-class due dates by class id, mirrored to the session for students. */
  dueAtByClassId?: Record<string, number>;
  /**
   * Synced-group linkage. When provided, both the assignment doc and
   * the session doc carry `sync: { groupId, syncedVersion }`, so the
   * per-assignment "Sync" button can detect divergence against the
   * canonical `/synced_quizzes/{groupId}` doc. Set by
   * `importSharedAssignment` when the importer chooses Sync mode.
   */
  syncedFrom?: QuizAssignmentSyncLinkage;
  /**
   * Org-wide assignment mode frozen onto the assignment + session.
   * Defaults to `'submissions'` (preserves pre-feature behavior).
   */
  mode?: AssignmentMode;
  /**
   * Phase 3 reverse-bubble-up suppression. Set by the PLC Library "Add
   * to my board" import flow so picking up an existing template doesn't
   * recursively create another template. Default `false` — every PLC-
   * mode personal assignment authored from scratch fires a template
   * write so teammates see it on their PLC Assignments tab without an
   * extra step.
   */
  skipPlcTemplateWrite?: boolean;
  /**
   * Optional override for the canonical synced-quiz group when bubbling
   * up a template. Default behavior is "use whatever group the source
   * quiz already participates in (via `quiz.sync` on the user's library
   * card)". When the source quiz isn't yet synced, callers MUST mint a
   * group up-front and pass its id here — this hook does NOT promote
   * Drive-only quizzes to synced groups (that lives in the QuizWidget
   * `handleShareWithPlc` path, which has Drive content already loaded).
   */
  plcTemplateSyncGroupId?: string;
  /**
   * Pooling key written to the session as `syncGroupId` when it should differ
   * from the template group: the PLC library group whose title matches, so a
   * teacher's own copy pools with the team instead of starting a new pool.
   */
  plcPoolSyncGroupId?: string;
  /**
   * M17 individual-assignment targeting (spec §5 B3). `targetMode: 'students'`
   * marks the assignment doc so the CF's `individualTargeting` session flag
   * makes sense downstream; `targetStudents` itself is NOT written here —
   * `setAssignmentTargetsV1` is the sole writer of that field (division of
   * labor, spec §2a). Caller invokes the CF separately after `createAssignment`
   * resolves, passing the same `assignmentId` (== the returned `id`, == the
   * session id) as `sessionId`.
   */
  targetMode?: 'class' | 'students';
  targetGroupIds?: string[];
  overridesBySourcedId?: Record<string, StudentOverride>;
  /** Open/close window (epoch ms), mirrored onto both assignment + session docs. */
  openAt?: number | null;
  closeAt?: number | null;
  /** Submissions Enabled or Study Resource; absent keeps the kind default. */
  workKind?: WorkKind;
  /** Frozen bank pools; the session's `totalQuestions` becomes fixed + Σ count. */
  bankSlots?: QuizSessionBankSlot[];
  /** `QuizMetadata.translations` — lets publish load sidecars with zero extra reads (§4.2). */
  translationIndex?: Record<string, QuizTranslationIndexEntry>;
  /** Grade translated fill-in-the-blank answers with typo leniency (Modification groups preview). */
  lenientTranslatedFib?: boolean;
  /** Per-period gate; its questions move to `content/questions` until each period opens. */
  accessMode?: AccessMode;
  periodAccess?: Record<string, PeriodAccess>;
  /** A Manual due date that allows late work, so no period locks at it. */
  manualLate?: boolean;
}

/**
 * Minimal quiz data needed to stand up an assignment. The driveFileId lets the
 * monitor/results views hydrate the full answer key later.
 */
export interface AssignmentQuizRef {
  id: string;
  title: string;
  driveFileId: string;
  questions: QuizQuestion[];
  /** Stimuli referenced by `questions[].stimulusIds`; projected onto the session doc. */
  stimuli?: QuizStimulus[];
  /** Read-aloud language snapshotted onto the session doc. */
  language?: string;
  /** The quiz's `order` and section records, frozen onto the session as `sections`. */
  order?: QuizOrderEntry[];
  sections?: QuizSection[];
}

/** Editable settings plus the open/close window the edit modal changes. */
export type QuizAssignmentSettingsPatch = Partial<QuizAssignmentSettings> &
  Pick<QuizAssignment, 'openAt' | 'closeAt'> & {
    /** Window changes per `periodAccess` row key, written to both docs. */
    periodAccessEdits?: PeriodAccessWindowEdits;
    /** Whole per-period rows by key for a class change; null removes the row. */
    periodAccessRows?: Record<string, PeriodAccess | null>;
  };

export interface UseQuizAssignmentsResult {
  assignments: QuizAssignment[];
  loading: boolean;
  error: string | null;
  /**
   * Create a new assignment + its matching session doc in one batch.
   * Returns the new assignment's id (== sessionId) and the allocated join code.
   *
   * Options bag (vs the previous 8-positional signature) so call sites
   * can name the inputs they care about and skip the rest. The
   * defaults are: `initialStatus: 'active'`, `mode: 'submissions'`,
   * empty arrays/maps for the targeting fields, and no `syncedFrom`
   * linkage.
   *
   * Targeting: `classIds` is the list of ClassLink class `sourcedId`s
   * this session is targeted at (Phase 5A multi-class). When
   * non-empty, the session doc stores them on `classIds` (and
   * transitionally mirrors `classIds[0]` to `classId` so pre-Phase-5A
   * Firestore rules still gate correctly). Firestore rules
   * (`passesStudentClassGateList`) enforce that ClassLink-
   * authenticated students can only read sessions whose classIds
   * overlap their auth-token classIds claim. An empty/missing list
   * preserves the classic code/PIN-only flow.
   */
  createAssignment: (
    quiz: AssignmentQuizRef,
    settings: QuizAssignmentSettings,
    options?: CreateAssignmentOptions
  ) => Promise<{ id: string; code: string }>;
  /** Set both assignment.status and session.status to 'paused'. */
  pauseAssignment: (assignmentId: string) => Promise<void>;
  /** Set both assignment.status and session.status back to 'active'. */
  resumeAssignment: (assignmentId: string) => Promise<void>;
  /** Kills the student URL; preserves responses. assignment='inactive', session='ended'. */
  deactivateAssignment: (assignmentId: string) => Promise<void>;
  /**
   * Reopen a previously deactivated (inactive) assignment. Returns it to
   * 'paused' so the teacher can review state before resuming; they must
   * explicitly call `resumeAssignment` to start accepting submissions again.
   */
  reopenAssignment: (assignmentId: string) => Promise<void>;
  /** After `reopenAssignment`, opens the quiz for these students only: classes stay paused, `letInUids` get a pass until End. */
  reopenForStudents: (
    assignmentId: string,
    picks: {
      uids: string[];
      letInUids: string[];
      /** Labels and bells for the class rows a whole-quiz session moves to. */
      rosters?: readonly PeriodRoster[];
    }
  ) => Promise<void>;
  /** Permanently delete assignment + session + all responses. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
  /** Update editable settings (className, PLC fields, session toggles). */
  updateAssignmentSettings: (
    assignmentId: string,
    patch: QuizAssignmentSettingsPatch,
    /** Per-class due dates by class id, when `patch.dueAtByRosterId` is set. */
    dueAtByClassId?: Record<string, number>
  ) => Promise<void>;
  /**
   * Retarget an existing assignment at a new set of rosters. Mirrors
   * `rosterIds`/`periodNames` to the assignment doc and `classIds`/
   * `classId`/`rosterIds`/`periodNames` to the session doc so the
   * student SSO gate, the legacy single-class fallback, and the post-PIN
   * period picker all stay in sync. Used by the post-import "pick
   * classes" prompt — `updateAssignmentSettings` doesn't touch
   * `rosterIds`/`classIds`, so it can't fully retarget on its own.
   *
   * Callers derive `classIds`, `rosterIds`, and `periodNames` via
   * `deriveSessionTargetsFromRosters` (same helper used at create-time)
   * so the de-duplication rules stay identical between create and
   * retarget paths.
   */
  setAssignmentRosters: (
    assignmentId: string,
    targets: SessionTargets,
    /** Per-period rows for the class change, in the same batch; null removes a row. */
    periodAccessRows?: Record<string, PeriodAccess | null>,
    /** Names of the rosters this change takes off, so their PIN work is hidden. */
    removedRosterNames?: string[],
    /** Class ids and period keys of those rosters; other dropped classes are not recorded as removed. */
    removedClassIds?: string[]
  ) => Promise<void>;
  /**
   * Persist the Drive export URL onto the assignment doc so re-entering
   * Results after navigating away (which remounts QuizResults and wipes its
   * local state) shows the "Open Sheet" shortcut instead of reverting to
   * "Export".
   */
  setAssignmentExportUrl: (assignmentId: string, url: string) => Promise<void>;
  /**
   * M17 individual-assignment targeting (spec §5 B3) — persists the count of
   * student-target refs `setAssignmentTargetsV1` couldn't add (PII-free, a
   * plain number) so the "N skipped" row marker survives a reload; the toast
   * with names is ephemeral only.
   */
  setAssignmentTargetSkippedCount: (
    assignmentId: string,
    count: number
  ) => Promise<void>;
  /**
   * Persist the set of response keys that have been written to the linked
   * sheet. Powers the "Update Sheet" affordance in QuizResults — the next
   * incremental append filters out responses already in this list so we
   * don't duplicate already-exported rows.
   *
   * Accepts `ResponseDocKey[]` so the compiler enforces that callers pass
   * the branded keys returned by `getResponseDocKey` (not arbitrary
   * strings). The implementation casts to `string[]` at the Firestore
   * write boundary — the wire format hasn't changed.
   */
  setAssignmentExportedResponseIds: (
    assignmentId: string,
    responseIds: ResponseDocKey[],
    /** Finished attempts per key, saved with the ids when given. */
    attempts?: Record<string, number>
  ) => Promise<void>;
  /** Publish this assignment as a shareable link. Returns the /share/assignment/{id} URL. */
  shareAssignment: (
    assignmentId: string,
    quizData: QuizData,
    loadBankContents?: LoadBankContentsForQuiz,
    /** The quiz's `districtOrigin`; library content is refused. */
    districtOrigin?: readonly string[]
  ) => Promise<string>;
  /**
   * Peek at a `/shared_assignments/{shareId}` doc without importing. Used
   * by the import flow to decide whether to surface the Sync/Copy mode
   * picker (when `syncGroupId` is present) or fall straight through to a
   * legacy copy import. Read-only — does not mutate any state.
   *
   * `plc` is the PLC linkage carried on the share's `assignmentSettings`,
   * if any. The caller uses it to gate Sync mode behind PLC membership:
   * a PLC-shared synced assignment should only offer the Sync option to
   * members of the originating PLC; non-members get a copy import (with
   * the existing non-member toast) so they don't silently join a
   * synchronized group they have no relationship to.
   */
  peekSharedAssignment: (shareId: string) => Promise<{
    title: string;
    originalAuthor: string;
    syncGroupId?: string;
    plc?: PlcLinkage;
  }>;
  /**
   * Import a shared assignment. Delegates quiz copy to the injected saveQuiz
   * (from useQuiz.ts) and creates a new paused assignment under the importer's
   * collection. Returns the new assignmentId.
   *
   * `rollbackQuiz` is optional but strongly recommended — it's invoked
   * best-effort if assignment creation fails AFTER the quiz copy already
   * succeeded, preventing an orphan quiz in the importer's library.
   * Receives the just-saved quiz's `{id, driveFileId}` so the caller
   * can dispatch to its own `deleteQuiz` (which needs both). A failed
   * rollback is swallowed (logged only); the original error still
   * propagates so the caller can surface a useful message.
   */
  importSharedAssignment: (
    shareId: string,
    saveQuiz: (quiz: QuizData) => Promise<{ id: string; driveFileId: string }>,
    rollbackQuiz?: (saved: {
      id: string;
      driveFileId: string;
    }) => Promise<void>,
    /**
     * Optional PLC handling. Bundled into a single object so the contract
     * "PLC handling is opt-in as a unit" is visible in the type — both
     * `isMember` and `onNonMember` are required when the caller opts in.
     *
     * - `isMember(plcId)`: returns true iff the importer is a current member
     *   of the share's originating PLC. When the share doc carries a
     *   `plc.id` and this returns true, PLC linkage is preserved on the
     *   imported doc so the importer's exports route to the same shared
     *   sheet. Otherwise the linkage is stripped.
     * - `onNonMember`: invoked when the share carries a PLC linkage but the
     *   importer is not a member, so the caller can surface a "not in this
     *   PLC" nudge toast.
     */
    plcHandling?: {
      isMember: (plcId: string) => boolean;
      onNonMember: (info: { plcId: string; plcName: string }) => void;
      /** The importer's own view of the live PLC; the share's sheet, name and roster are never kept. */
      liveLinkage?: (plcId: string) => PlcLinkage | undefined;
    },
    /**
     * Import mode chosen by the user in the picker modal. Default `'copy'`
     * preserves legacy behavior for callers not yet wired through the new
     * picker. `'sync'` joins the importer to the synced group named on the
     * share doc; if the share doesn't carry a `syncGroupId`, the call
     * silently degrades to `'copy'` (the picker shouldn't have offered
     * sync in that case anyway).
     *
     * `attachSyncLinkage` is required for `'sync'` mode — it patches the
     * importer's freshly-saved local quiz metadata with the sync linkage
     * after `saveQuiz` writes the unsynced shape. Threaded as a callback
     * (rather than inlining the Firestore write here) so this hook stays
     * decoupled from `useQuiz`'s persistence layout.
     */
    options?: {
      mode?: SharedAssignmentImportMode;
      attachSyncLinkage?: (
        quizId: string,
        linkage: QuizMetadataSyncLinkage
      ) => Promise<void>;
      /** Stores the banks a shared bank-draw quiz carries in the importer's library. */
      saveBank?: (bank: QuestionBankData) => Promise<unknown>;
      /** Saves the frozen bank pool to Drive so grading sees every drawn question. */
      saveDriveSnapshot?: (quiz: QuizData) => Promise<string>;
    }
  ) => Promise<string>;
  /**
   * Rebuild a synced assignment's session questions from the latest
   * canonical content. Sets `assignment.syncedVersion` to match the
   * canonical doc's `version`, replaces `session.publicQuestions[]`, and
   * tags any pre-existing responses with `preSyncVersion` so the results
   * UI can flag rows as "answered before vN+1 update."
   *
   * No-op if the assignment isn't synced (no `syncGroupId`) or already
   * matches the canonical version.
   */
  /** Questions the latest version drops and how many responses already answered them, read before a sync. */
  previewSyncRemovals: (
    assignmentId: string,
    options: { linkedCopy: boolean }
  ) => Promise<{ removed: string[]; responseCount: number }>;
  syncAssignmentToLatest: (assignmentId: string) => Promise<{
    /** True iff the rebuild actually ran (false = already at latest). */
    updated: boolean;
    /** Canonical version after the sync. */
    version: number;
    /** How many existing responses were tagged with `preSyncVersion`. */
    taggedResponseCount: number;
  }>;
  /**
   * Publish (or unpublish) score visibility for an archived assignment.
   *
   * Publishes scores at the given visibility level:
   *   1. Computes each student's percentage score from the live response
   *      docs using `gradeAnswer` against the canonical `quizData`, and
   *      writes the resulting `score` onto every response doc under
   *      `/quiz_sessions/{id}/responses/`, with per-answer `isCorrect`
   *      flags only where that student may see their responses.
   *   2. Mirrors `scoreVisibility` onto both the assignment doc and the
   *      session doc so the `/my-assignments` student view can read it
   *      without a teacher-scoped fetch.
   *   3. When `'score-responses-and-answers'`, writes the answer key to each
   *      response's `revealedAnswers` (never the session doc, which any
   *      signed-in user can read) and clears the legacy session copy.
   *
   * Returns the number of responses whose score was (re)computed.
   *
   * The signature deliberately excludes `'none'` — callers wishing to
   * unpublish must use {@link UseQuizAssignmentsResult.unpublishAssignmentScores}
   * instead, which is a cheap two-write batch that doesn't require
   * fabricating a placeholder `QuizData` to satisfy the type.
   */
  publishAssignmentScores: (
    assignmentId: string,
    quizData: QuizData,
    visibility: Exclude<QuizScoreVisibility, 'none'>,
    protection?: ResultsProtection,
    /** Omit to leave the session's mode as it is (D37). */
    writtenReturnMode?: WrittenReturnMode
  ) => Promise<{
    responsesUpdated: number;
    /** Responses imported from paper sheets, so the caller can link them (Q34). */
    paperResponses: number;
  }>;
  /**
   * Revoke published score visibility for an assignment. Clears
   * `scoreVisibility` + `scorePublishedAt` on the assignment doc (via
   * `deleteField()`, so the unpublished and never-published states are
   * indistinguishable on disk) and wipes `revealedAnswers` on the
   * mirrored session doc and on every response. Already-written per-response `score` /
   * `isCorrect` fields are left intact — student-side rendering gates
   * on `session.scoreVisibility`, and re-publishing safely overwrites
   * them.
   */
  unpublishAssignmentScores: (assignmentId: string) => Promise<void>;
  /** Handwritten paper answers still awaiting a transcript (D39 publish warning). */
  countPendingPaperTranscripts: (assignmentId: string) => Promise<number>;
  /**
   * Show results to chosen students only, grading their responses the same
   * way a class publish does. Never pushes grades anywhere. Responses that
   * aren't completed are skipped.
   */
  publishResultsForStudents: (
    assignmentId: string,
    quizData: QuizData,
    responseKeys: string[],
    visibility: Exclude<QuizScoreVisibility, 'none'>,
    expiresAt: number | null,
    protection?: ResultsProtection
  ) => Promise<{ responsesUpdated: number; skipped: number }>;
  /** Hide results from chosen students, whatever the class setting is. */
  hideResultsForStudents: (
    assignmentId: string,
    responseKeys: string[]
  ) => Promise<void>;
  /** Return chosen students to the class setting; with the quiz, also restores what the class publish shows. */
  clearResultsOverride: (
    assignmentId: string,
    responseKeys: string[],
    quizData?: QuizData
  ) => Promise<void>;
  /**
   * Retroactively pool an existing assignment's results with a PLC (D12).
   * Stamps `plcId` / `syncGroupId` / `plcLinkedAt` on the session doc and
   * `plc` on the assignment doc in one batch; the server picks the change
   * up and creates or dirties the assessment keyed on `poolSyncGroupId`.
   */
  shareAssignmentWithPlc: (
    assignmentId: string,
    opts: { plc: Plc; poolSyncGroupId: string }
  ) => Promise<void>;
  /** Reverse of `shareAssignmentWithPlc`: clears the link on both docs. */
  stopSharingAssignmentWithPlc: (assignmentId: string) => Promise<void>;
}
