import type {
  AccessMode,
  AssignmentMode,
  AudienceSessionFields,
  PeriodAccess,
  QuizAssignment,
  QuizAssignmentSettings,
  QuizAssignmentStatus,
  QuizAssignmentSyncLinkage,
  QuizOrderEntry,
  QuizQuestion,
  QuizSection,
  QuizSessionBankSlot,
  QuizStimulus,
  QuizTranslationIndexEntry,
  QuizWidgetKind,
  StudentOverride,
} from '@/types';
import type { WorkKind } from '@/utils/gradebook/gradebookCore';
import type { PeriodAccessWindowEdits } from '@/utils/assignAvailability';

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
