/**
 * useQuizAssignments hook
 *
 * Manages the per-teacher archive of quiz assignments. An "assignment" is a
 * single instance of a quiz being assigned out to students — it pairs a
 * QuizAssignment document (under /users/{teacherUid}/quiz_assignments/) with
 * a QuizSession document (under /quiz_sessions/{sessionId}) 1:1.
 *
 * Multiple concurrent assignments per teacher are supported. The assignment
 * can be Active (URL live, accepting submissions), Paused (URL live, no
 * submissions) or Inactive (URL dead, responses preserved).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { invalidateSessionViewCount } from './useSessionViewCount';
import type {
  AssignmentMode,
  PlcLinkage,
  QuizAssignment,
  QuizAssignmentSettings,
  QuizAssignmentStatus,
  QuizAssignmentSyncLinkage,
  QuizData,
  QuizMetadataSyncLinkage,
  QuizQuestion,
  QuizSession,
  SharedQuizAssignment,
} from '../types';
import type { SessionTargets } from '../utils/resolveAssignmentTargets';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
  toPublicQuestion,
  type ResponseDocKey,
} from './useQuizSession';
import {
  callJoinSyncedQuizGroup,
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
  pullSyncedQuizContent,
} from './useSyncedQuizGroups';
import { logError } from '../utils/logError';
import { migrateQuizMetadataShape } from '../utils/quizSyncMigration';

/** Import-mode picker result for shared-assignment paste flows. */
export type SharedAssignmentImportMode = 'sync' | 'copy';

/**
 * Options for `createAssignment`. Replaces the previous 8-positional
 * argument list; named fields make the read-site at every call clearer
 * and let new options land without churning every existing caller.
 */
export interface CreateAssignmentOptions {
  /** Defaults to `'active'`. */
  initialStatus?: QuizAssignmentStatus;
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
}

const QUIZ_ASSIGNMENTS_COLLECTION = 'quiz_assignments';
const SHARED_ASSIGNMENTS_COLLECTION = 'shared_assignments';

/**
 * Minimal quiz data needed to stand up an assignment. The driveFileId lets the
 * monitor/results views hydrate the full answer key later.
 */
export interface AssignmentQuizRef {
  id: string;
  title: string;
  driveFileId: string;
  questions: QuizQuestion[];
}

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
  /** Permanently delete assignment + session + all responses. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
  /** Update editable settings (className, PLC fields, session toggles). */
  updateAssignmentSettings: (
    assignmentId: string,
    patch: Partial<QuizAssignmentSettings>
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
    targets: SessionTargets
  ) => Promise<void>;
  /**
   * Persist the Drive export URL onto the assignment doc so re-entering
   * Results after navigating away (which remounts QuizResults and wipes its
   * local state) shows the "Open Sheet" shortcut instead of reverting to
   * "Export".
   */
  setAssignmentExportUrl: (assignmentId: string, url: string) => Promise<void>;
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
    responseIds: ResponseDocKey[]
  ) => Promise<void>;
  /** Publish this assignment as a shareable link. Returns the /share/assignment/{id} URL. */
  shareAssignment: (
    assignmentId: string,
    quizData: QuizData
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
  syncAssignmentToLatest: (assignmentId: string) => Promise<{
    /** True iff the rebuild actually ran (false = already at latest). */
    updated: boolean;
    /** Canonical version after the sync. */
    version: number;
    /** How many existing responses were tagged with `preSyncVersion`. */
    taggedResponseCount: number;
  }>;
}

/**
 * Read-side compatibility mapper for the pre-PlcLinkage flat shape. Existing
 * Firestore docs were written with `plcMode`/`plcSheetUrl`/`plcId`/
 * `plcName`/`plcMemberEmails` as flat fields on the assignment (or
 * SharedQuizAssignment.assignmentSettings). The refactor consolidates those
 * into a single `plc: PlcLinkage` sub-object.
 *
 * Behaviour:
 * - If `plc` is already set, the doc is post-refactor — pass through.
 * - If the legacy fields form a complete linkage (`plcMode === true` AND
 *   `plcSheetUrl` AND `plcId` AND `plcName` are all populated), build a
 *   `plc` sub-object and strip the legacy fields so downstream code only
 *   sees one shape.
 * - Partial-legacy docs (e.g. `plcMode: true` but missing one of `plcId`/
 *   `plcName`/`plcSheetUrl`, possible for assignments created before
 *   PR #1442 added `plcId`/`plcName`) pass through WITHOUT a `plc` field
 *   and with the legacy fields stripped — degraded state, treated as
 *   non-PLC mode rather than crashing. This matches the non-PLC path and
 *   is safe.
 *
 * Generic over the doc shape so it can be applied to both QuizAssignment
 * (returns `Omit<T, legacyKeys> & { plc?: PlcLinkage }`) and the inner
 * `assignmentSettings` shape on SharedQuizAssignment.
 */
type LegacyPlcShape = {
  plcMode?: boolean;
  plcSheetUrl?: string;
  plcId?: string;
  plcName?: string;
  plcMemberEmails?: string[];
  plc?: PlcLinkage;
};
const LEGACY_PLC_KEYS = [
  'plcMode',
  'plcSheetUrl',
  'plcId',
  'plcName',
  'plcMemberEmails',
] as const;

/**
 * Pre-sub-object shape for the assignment's sync linkage. Folded into
 * `sync: { groupId, syncedVersion }` by `migrateSyncLinkageShape`.
 * Both legacy fields are required-when-present (we never wrote one
 * without the other), so an only-one-set doc is treated as degraded
 * and the linkage is dropped on read.
 */
type LegacySyncLinkageShape = {
  syncGroupId?: string;
  syncedVersion?: number;
  sync?: QuizAssignmentSyncLinkage;
};
const LEGACY_SYNC_KEYS = ['syncGroupId', 'syncedVersion'] as const;

/**
 * Read-side mapper for `QuizAssignment.sync`. Mirrors
 * `migrateLegacyAssignmentShape` for the sync linkage: pre-sub-object
 * docs carried two flat optional fields; this folds them into the
 * canonical sub-object so consumers only ever see one shape.
 */
function migrateSyncLinkageShape<T extends LegacySyncLinkageShape>(
  data: T
): Omit<T, (typeof LEGACY_SYNC_KEYS)[number]> & {
  sync?: QuizAssignmentSyncLinkage;
} {
  const cleaned = { ...data };
  for (const key of LEGACY_SYNC_KEYS) delete cleaned[key];
  if (data.sync) {
    if (
      typeof data.sync.groupId === 'string' &&
      data.sync.groupId.length > 0 &&
      typeof data.sync.syncedVersion === 'number'
    ) {
      return cleaned;
    }
    // Malformed sub-object: drop and treat as unsynced.
    delete (cleaned as { sync?: QuizAssignmentSyncLinkage }).sync;
    return cleaned;
  }
  const { syncGroupId, syncedVersion } = data;
  if (
    typeof syncGroupId === 'string' &&
    syncGroupId.length > 0 &&
    typeof syncedVersion === 'number'
  ) {
    return { ...cleaned, sync: { groupId: syncGroupId, syncedVersion } };
  }
  return cleaned;
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Sanitize the `classPeriodByClassId` map at the hook boundary: drop
 * empty/non-string keys or values, and (when an allowlist is provided)
 * drop entries whose key isn't in the session's `classIds` so the
 * session doc can't carry stale/mismatched targeting. Mirrors the
 * defensive filtering already applied to `rosterIds` / `classIds` /
 * `periodNames`.
 */
function sanitizeClassPeriodByClassId(
  input: Record<string, string> | undefined,
  allowedClassIds?: readonly string[]
): Record<string, string> {
  if (!input) return {};
  const allow = allowedClassIds ? new Set(allowedClassIds) : null;
  return Object.fromEntries(
    Object.entries(input).filter(
      ([classId, classPeriod]) =>
        isNonEmptyString(classId) &&
        isNonEmptyString(classPeriod) &&
        (allow === null || allow.has(classId))
    )
  );
}

// Validate an inbound `plc` sub-object before trusting it. A partial or
// malformed shape would otherwise propagate downstream where consumers
// assume "present-and-complete." Returns a fresh object (no aliasing) or
// `undefined` to drop the linkage.
function getValidPlcLinkage(
  plc: PlcLinkage | undefined
): PlcLinkage | undefined {
  if (!plc) return undefined;
  const { id, name, sheetUrl, memberEmails, autoGenerated } = plc;
  const ok =
    isNonEmptyString(id) &&
    isNonEmptyString(name) &&
    isNonEmptyString(sheetUrl) &&
    Array.isArray(memberEmails) &&
    memberEmails.every((e) => isNonEmptyString(e));
  if (!ok) return undefined;
  return {
    id,
    name,
    sheetUrl,
    memberEmails: [...memberEmails],
    ...(autoGenerated === true ? { autoGenerated: true } : {}),
  };
}

function migrateLegacyAssignmentShape<T extends LegacyPlcShape>(
  data: T
): Omit<T, (typeof LEGACY_PLC_KEYS)[number]> & { plc?: PlcLinkage } {
  const cleaned = { ...data };
  for (const key of LEGACY_PLC_KEYS) delete cleaned[key];

  // Already migrated (or partially-bad nested shape): trust the nested
  // object only if it passes structural validation; otherwise drop it
  // (downgrades to non-PLC mode rather than silently propagating a
  // broken state).
  if (data.plc) {
    const valid = getValidPlcLinkage(data.plc);
    return valid ? { ...cleaned, plc: valid } : cleaned;
  }

  const { plcMode, plcSheetUrl, plcId, plcName, plcMemberEmails } = data;
  if (plcMode === true && !!plcSheetUrl && !!plcId && !!plcName) {
    return {
      ...cleaned,
      plc: {
        id: plcId,
        name: plcName,
        sheetUrl: plcSheetUrl,
        memberEmails: plcMemberEmails ?? [],
      },
    };
  }
  // Degraded-state or non-PLC doc: pass through without `plc`.
  return cleaned;
}

/** Unique 6-char join code generator with collision check against live sessions. */
async function allocateJoinCode(): Promise<string> {
  const joinableStatuses = new Set(['waiting', 'active', 'paused']);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()
      .padEnd(6, '0');
    const snap = await getDocs(
      query(
        collection(db, QUIZ_SESSIONS_COLLECTION),
        where('code', '==', candidate)
      )
    );
    const collision = snap.docs.some((d) =>
      joinableStatuses.has((d.data() as QuizSession).status)
    );
    if (!collision) return candidate;
  }
  // Last-resort fallback: we accept a theoretical collision rather than
  // blocking the teacher from starting a quiz.
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()
    .padEnd(6, '0');
}

export const useQuizAssignments = (
  userId: string | undefined
): UseQuizAssignmentsResult => {
  const [assignments, setAssignments] = useState<QuizAssignment[]>([]);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [error, setError] = useState<string | null>(null);

  // Adjust state during render when userId transitions away — avoids the
  // "set-state-in-effect" anti-pattern while still clearing stale data when
  // the user signs out.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) {
      setAssignments([]);
      setLoading(false);
      setError(null);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAssignments(
          snap.docs.map((d) => {
            const raw = { ...d.data(), id: d.id } as QuizAssignment &
              LegacyPlcShape &
              LegacySyncLinkageShape;
            // Pipe through the PLC mapper AND the sync-linkage mapper so
            // consumers only ever see the canonical sub-object shapes.
            return migrateSyncLinkageShape(
              migrateLegacyAssignmentShape(raw)
            ) as QuizAssignment;
          })
        );
        setLoading(false);
      },
      (err) => {
        console.error('[useQuizAssignments] Firestore error:', err);
        setError('Failed to load assignments');
        setLoading(false);
      }
    );
    return unsub;
  }, [userId]);

  const createAssignment = useCallback<
    UseQuizAssignmentsResult['createAssignment']
  >(
    async (quiz, settings, options) => {
      const {
        initialStatus = 'active',
        classIds,
        rosterIds,
        classPeriodByClassId,
        syncedFrom,
        mode: assignmentMode = 'submissions',
      } = options ?? {};
      if (!userId) throw new Error('Not authenticated');
      // Defensive sanitization at the hook boundary: drop empty/non-string
      // entries so this stays robust against future call sites that may
      // not pre-sanitize via `deriveSessionTargetsFromRosters`. Mirrors
      // the same filter already applied in `setAssignmentRosters`.
      const targetClassIds = (classIds ?? []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
      const targetRosterIds = (rosterIds ?? []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
      const targetClassPeriodByClassId = sanitizeClassPeriodByClassId(
        classPeriodByClassId,
        targetClassIds
      );

      const assignmentId = crypto.randomUUID();
      const code = await allocateJoinCode();
      const now = Date.now();

      const assignment: QuizAssignment = {
        id: assignmentId,
        quizId: quiz.id,
        quizTitle: quiz.title,
        quizDriveFileId: quiz.driveFileId,
        teacherUid: userId,
        code,
        status: initialStatus,
        createdAt: now,
        updatedAt: now,
        className: settings.className,
        sessionMode: settings.sessionMode,
        sessionOptions: settings.sessionOptions,
        // PLC linkage: present iff the caller opted into PLC mode at create
        // time. Stored as the new sub-object shape (PR #1442 follow-up).
        ...(settings.plc ? { plc: settings.plc } : {}),
        teacherName: settings.teacherName,
        periodName: settings.periodName,
        periodNames: settings.periodNames,
        attemptLimit: settings.attemptLimit ?? null,
        ...(targetRosterIds.length > 0 ? { rosterIds: targetRosterIds } : {}),
        // Synced linkage: present iff the assignment was created from a
        // synced library quiz (set by importSharedAssignment in sync mode,
        // or by createAssignment when the source quiz already participates
        // in a group). The session doc carries the same fields so the
        // monitor + results views can detect divergence without reading
        // back the assignment doc.
        ...(syncedFrom ? { sync: syncedFrom } : {}),
        mode: assignmentMode,
      };

      const mode = settings.sessionMode;
      const opts = settings.sessionOptions;
      const sessionStatus: QuizSession['status'] =
        initialStatus === 'paused'
          ? 'paused'
          : initialStatus === 'inactive'
            ? 'ended'
            : mode === 'student'
              ? 'active'
              : 'waiting';

      const session: QuizSession = {
        id: assignmentId,
        assignmentId,
        quizId: quiz.id,
        quizTitle: quiz.title,
        teacherUid: userId,
        status: sessionStatus,
        sessionMode: mode,
        currentQuestionIndex: mode === 'student' ? 0 : -1,
        startedAt: mode === 'student' ? now : null,
        endedAt: null,
        code,
        totalQuestions: quiz.questions.length,
        publicQuestions: quiz.questions.map(toPublicQuestion),
        // Phase 1 toggles
        tabWarningsEnabled: opts.tabWarningsEnabled ?? true,
        showResultToStudent: opts.showResultToStudent ?? false,
        showCorrectAnswerToStudent: opts.showCorrectAnswerToStudent ?? false,
        showCorrectOnBoard: opts.showCorrectOnBoard ?? false,
        revealedAnswers: {},
        // Phase 2 gamification
        speedBonusEnabled: opts.speedBonusEnabled ?? false,
        streakBonusEnabled: opts.streakBonusEnabled ?? false,
        showPodiumBetweenQuestions: opts.showPodiumBetweenQuestions ?? true,
        soundEffectsEnabled: opts.soundEffectsEnabled ?? false,
        questionPhase: 'answering',
        periodNames: settings.periodNames,
        // Phase 5A: multi-class ClassLink targeting. Write `classIds` when
        // non-empty; also mirror `classIds[0]` to the legacy `classId` field
        // so both multi-class targeting and the legacy single-class fallback
        // continue to gate access correctly until the fallback is removed.
        ...(targetClassIds.length > 0
          ? { classIds: targetClassIds, classId: targetClassIds[0] }
          : {}),
        ...(targetRosterIds.length > 0 ? { rosterIds: targetRosterIds } : {}),
        // SSO classPeriod snapshot: lets students write `classPeriod`
        // directly on their response at join time without a roster lookup.
        // Omit when empty so the session doc stays as small as possible.
        ...(Object.keys(targetClassPeriodByClassId).length > 0
          ? { classPeriodByClassId: targetClassPeriodByClassId }
          : {}),
        attemptLimit: settings.attemptLimit ?? null,
        mode: assignmentMode,
      };

      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        assignment
      );
      batch.set(doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId), session);
      await batch.commit();

      return { id: assignmentId, code };
    },
    [userId]
  );

  const setStatus = useCallback(
    async (
      assignmentId: string,
      assignmentStatus: QuizAssignmentStatus,
      sessionStatus: QuizSession['status']
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        { status: assignmentStatus, updatedAt: now }
      );
      // When pausing or ending, null out autoProgressAt so any in-flight
      // auto-advance timer (from useQuizSession) no longer fires and the
      // session can't silently advance past the intended stopping point.
      const sessionPatch: Record<string, unknown> = { status: sessionStatus };
      if (sessionStatus === 'paused' || sessionStatus === 'ended') {
        sessionPatch.autoProgressAt = null;
      }
      if (sessionStatus === 'ended') {
        sessionPatch.endedAt = now;
      } else {
        // Clear `endedAt` on any transition away from 'ended' so a reopened
        // session doesn't carry stale end-timestamp state that downstream
        // consumers would misread as "session is over".
        sessionPatch.endedAt = null;
      }
      batch.update(
        doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId),
        sessionPatch
      );
      await batch.commit();
    },
    [userId]
  );

  const pauseAssignment = useCallback<
    UseQuizAssignmentsResult['pauseAssignment']
  >(
    async (assignmentId) => {
      await setStatus(assignmentId, 'paused', 'paused');
    },
    [setStatus]
  );

  const resumeAssignment = useCallback<
    UseQuizAssignmentsResult['resumeAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      // Resume to the correct session status depending on whether gameplay
      // has begun. For teacher-mode sessions that were imported as paused
      // (or paused before the teacher advanced to question 1), startedAt is
      // still null and currentQuestionIndex is -1 — in that case the
      // students should see the waiting room again, not the active-quiz UI
      // with no question loaded.
      const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId);
      const snap = await getDoc(sessionRef);
      const session = snap.data() as QuizSession | undefined;
      const neverStarted =
        !!session &&
        (session.startedAt == null || session.currentQuestionIndex < 0);
      await setStatus(
        assignmentId,
        'active',
        neverStarted ? 'waiting' : 'active'
      );
    },
    [userId, setStatus]
  );

  const deactivateAssignment = useCallback<
    UseQuizAssignmentsResult['deactivateAssignment']
  >(
    async (assignmentId) => {
      await setStatus(assignmentId, 'inactive', 'ended');
    },
    [setStatus]
  );

  const reopenAssignment = useCallback<
    UseQuizAssignmentsResult['reopenAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      // A "natural" auto-end (useQuizSession.advanceQuestion end-of-quiz
      // branch) leaves `currentQuestionIndex == totalQuestions`, which is
      // out-of-bounds for `publicQuestions`. If we just flipped status back
      // to 'paused', the next resume would jump to 'active' and every
      // student would look up `publicQuestions[totalQuestions]` — undefined
      // — and stall on the loading UI. Reset the index to a sensible resume
      // point: -1 for teacher-paced sessions (teacher re-advances from the
      // lobby) and 0 for student-paced sessions (students pick up from the
      // start). A "manual stop" (deactivateAssignment) doesn't touch
      // currentQuestionIndex, so we only reset when the index is actually
      // out-of-bounds.
      const sessionRef = doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId);
      const snap = await getDoc(sessionRef);
      const session = snap.data() as QuizSession | undefined;
      const now = Date.now();
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        { status: 'paused', updatedAt: now }
      );
      const sessionPatch: Record<string, unknown> = {
        status: 'paused',
        autoProgressAt: null,
        endedAt: null,
      };
      if (
        session &&
        typeof session.totalQuestions === 'number' &&
        session.totalQuestions > 0 &&
        session.currentQuestionIndex >= session.totalQuestions
      ) {
        sessionPatch.currentQuestionIndex =
          session.sessionMode === 'student' ? 0 : -1;
        sessionPatch.questionPhase = 'answering';
      }
      batch.update(sessionRef, sessionPatch);
      await batch.commit();
      // Drop any cached view count so the Shared row re-issues the
      // aggregation query on next mount; submissions-mode reopens get the
      // call too (no-op against a missing key).
      invalidateSessionViewCount('quiz_sessions', assignmentId);
    },
    [userId]
  );

  const deleteAssignment = useCallback<
    UseQuizAssignmentsResult['deleteAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');

      // Delete all response documents first (batched)
      const responsesSnap = await getDocs(
        collection(
          db,
          QUIZ_SESSIONS_COLLECTION,
          assignmentId,
          RESPONSES_COLLECTION
        )
      );
      const BATCH_LIMIT = 500;
      for (let i = 0; i < responsesSnap.docs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        responsesSnap.docs
          .slice(i, i + BATCH_LIMIT)
          .forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Delete the session doc and the assignment doc in one batch
      const batch = writeBatch(db);
      batch.delete(doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId));
      batch.delete(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId)
      );
      await batch.commit();
    },
    [userId]
  );

  const updateAssignmentSettings = useCallback<
    UseQuizAssignmentsResult['updateAssignmentSettings']
  >(
    async (assignmentId, patch) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      // Firestore is initialized with `ignoreUndefinedProperties: true`
      // (config/firebase.ts), which silently drops keys whose value is
      // `undefined`. That breaks the toggle-OFF use case for `plc` —
      // the modal sends `{ plc: undefined }` to mean "clear it" but the
      // existing field stays on the doc. Translate explicit-undefined on
      // the `plc` key to `deleteField()` so the doc actually loses PLC
      // mode. (Final-review finding on PR #1442.)
      const assignmentPatch: Record<string, unknown> = {
        ...patch,
        updatedAt: now,
      };
      if (
        Object.prototype.hasOwnProperty.call(patch, 'plc') &&
        patch.plc === undefined
      ) {
        assignmentPatch.plc = deleteField();
      }
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        assignmentPatch
      );
      // Mirror period and session-option changes to the session doc so
      // students can read available periods and updated toggles.
      const sessionPatch: Record<string, unknown> = {};
      if ('periodNames' in patch) sessionPatch.periodNames = patch.periodNames;
      if ('periodName' in patch) sessionPatch.periodName = patch.periodName;
      if ('attemptLimit' in patch)
        sessionPatch.attemptLimit = patch.attemptLimit ?? null;
      if (patch.sessionOptions) {
        const o = patch.sessionOptions;
        if (o.tabWarningsEnabled !== undefined)
          sessionPatch.tabWarningsEnabled = o.tabWarningsEnabled;
        if (o.showResultToStudent !== undefined)
          sessionPatch.showResultToStudent = o.showResultToStudent;
        if (o.showCorrectAnswerToStudent !== undefined)
          sessionPatch.showCorrectAnswerToStudent =
            o.showCorrectAnswerToStudent;
        if (o.showCorrectOnBoard !== undefined)
          sessionPatch.showCorrectOnBoard = o.showCorrectOnBoard;
        if (o.speedBonusEnabled !== undefined)
          sessionPatch.speedBonusEnabled = o.speedBonusEnabled;
        if (o.streakBonusEnabled !== undefined)
          sessionPatch.streakBonusEnabled = o.streakBonusEnabled;
        if (o.showPodiumBetweenQuestions !== undefined)
          sessionPatch.showPodiumBetweenQuestions =
            o.showPodiumBetweenQuestions;
        if (o.soundEffectsEnabled !== undefined)
          sessionPatch.soundEffectsEnabled = o.soundEffectsEnabled;
      }
      if (Object.keys(sessionPatch).length > 0) {
        batch.update(
          doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId),
          sessionPatch
        );
      }
      await batch.commit();
    },
    [userId]
  );

  const setAssignmentRosters = useCallback<
    UseQuizAssignmentsResult['setAssignmentRosters']
  >(
    async (assignmentId, targets) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const cleanedRosterIds = targets.rosterIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
      const cleanedClassIds = targets.classIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
      const cleanedPeriodNames = targets.periodNames.filter(
        (n): n is string => typeof n === 'string' && n.length > 0
      );

      const assignmentPatch: Record<string, unknown> = {
        updatedAt: now,
        // Always overwrite — deleteField semantics aren't needed here
        // because empty arrays are equivalent to "no targeting" for the
        // resolver in resolveAssignmentTargets.
        rosterIds: cleanedRosterIds,
        periodNames: cleanedPeriodNames,
        // Mirror periodName legacy field to the first selected period so
        // pre-Phase-5A consumers (if any remain) still see a value.
        periodName: cleanedPeriodNames[0] ?? '',
      };

      // Session doc carries the same targeting. classIds[0] is mirrored
      // to classId for the legacy single-class gate — same dual-write
      // the "Phase 5A: multi-class ClassLink targeting" branch in
      // createAssignment uses at create time.
      // Always overwrite `classPeriodByClassId` (even with `{}`) so a
      // retarget that drops every SSO-eligible roster clears the stale
      // prior map rather than leaving it lingering. Sanitization keeps
      // the keyset in lock-step with `cleanedClassIds` even if the
      // caller's map drifted.
      const cleanedClassPeriodByClassId = sanitizeClassPeriodByClassId(
        targets.classPeriodByClassId,
        cleanedClassIds
      );
      const sessionPatch: Record<string, unknown> = {
        rosterIds: cleanedRosterIds,
        classIds: cleanedClassIds,
        classId: cleanedClassIds[0] ?? '',
        periodNames: cleanedPeriodNames,
        classPeriodByClassId: cleanedClassPeriodByClassId,
      };

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        assignmentPatch
      );
      batch.update(
        doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId),
        sessionPatch
      );
      await batch.commit();
    },
    [userId]
  );

  const setAssignmentExportUrl = useCallback<
    UseQuizAssignmentsResult['setAssignmentExportUrl']
  >(
    async (assignmentId, url) => {
      if (!userId) throw new Error('Not authenticated');
      await updateDoc(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        { exportUrl: url, updatedAt: Date.now() }
      );
    },
    [userId]
  );

  const setAssignmentExportedResponseIds = useCallback<
    UseQuizAssignmentsResult['setAssignmentExportedResponseIds']
  >(
    async (assignmentId, responseIds) => {
      if (!userId) throw new Error('Not authenticated');
      await updateDoc(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        {
          // Cast to plain string[] at the Firestore boundary — the brand
          // is application-level only, the wire format is `string[]`.
          exportedResponseIds: responseIds as string[],
          updatedAt: Date.now(),
        }
      );
    },
    [userId]
  );

  const peekSharedAssignment = useCallback<
    UseQuizAssignmentsResult['peekSharedAssignment']
  >(async (shareId) => {
    const snap = await getDoc(doc(db, SHARED_ASSIGNMENTS_COLLECTION, shareId));
    if (!snap.exists()) {
      throw new Error('Shared assignment not found.');
    }
    const data = snap.data() as SharedQuizAssignment;
    // Run the legacy-PLC-shape mapper so callers see the canonical `plc`
    // sub-object regardless of whether the share was written before or
    // after the PLC refactor (see migrateLegacyAssignmentShape for the
    // migration rules).
    const settings = migrateLegacyAssignmentShape(
      data.assignmentSettings as QuizAssignmentSettings & LegacyPlcShape
    ) as QuizAssignmentSettings;
    return {
      title: data.title,
      originalAuthor: data.originalAuthor,
      ...(data.syncGroupId ? { syncGroupId: data.syncGroupId } : {}),
      ...(settings.plc ? { plc: settings.plc } : {}),
    };
  }, []);

  const shareAssignment = useCallback<
    UseQuizAssignmentsResult['shareAssignment']
  >(
    async (assignmentId, quizData) => {
      if (!userId) throw new Error('Not authenticated');
      const snap = await getDoc(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId)
      );
      if (!snap.exists()) throw new Error('Assignment not found');
      // Pipe through BOTH migrators to match every other assignment-read
      // site in this file. shareAssignment doesn't currently read the
      // `sync` sub-object, but consistency keeps the invariant
      // ("every read goes through both migrators") intact so a future
      // change can rely on it.
      const assignment = migrateSyncLinkageShape(
        migrateLegacyAssignmentShape(
          snap.data() as QuizAssignment &
            LegacyPlcShape &
            LegacySyncLinkageShape
        )
      ) as QuizAssignment;

      // Sync-mode plumbing: every share now carries a `syncGroupId` so the
      // importer's mode picker can offer "Synced" as an option. If the
      // source quiz is already part of a group (because the sharer
      // imported it as Synced themselves, or shared it once before), reuse
      // that group id — keeps the canonical participants list intact and
      // avoids fragmenting peer groups across re-shares of the same quiz.
      // Otherwise we promote the source quiz to a synced quiz: create a
      // brand-new group with the sharer as the sole participant, then
      // patch the local quiz_metadata so the editor's saveQuiz can
      // publish future edits to peers.
      const quizMetaRef = doc(
        db,
        'users',
        userId,
        // String literal duplicated rather than imported because
        // useQuiz.ts keeps its `QUIZZES_COLLECTION` constant
        // module-private. If you find yourself needing this in a third
        // place, lift it into a shared constants module.
        'quizzes',
        assignment.quizId
      );
      const quizMetaSnap = await getDoc(quizMetaRef);
      if (!quizMetaSnap.exists()) {
        // Defensive fail-fast: shareAssignment expects the source quiz
        // to live in the local library. Without the metadata doc we'd
        // either have to skip the sync-linkage patch (leaving the local
        // user's library unsynced even though canonical exists — exactly
        // the divergence the picker is supposed to prevent) or invent a
        // synthetic metadata write. Erroring is the only sound outcome.
        throw new Error(
          'Source quiz is missing from your library — cannot share.'
        );
      }
      // Read the metadata through the legacy mapper so we see the
      // canonical `sync` sub-object regardless of when the doc was
      // written.
      const existingQuizMeta = migrateQuizMetadataShape(quizMetaSnap.data());
      let syncGroupId = existingQuizMeta.sync?.groupId;
      if (!syncGroupId) {
        syncGroupId = crypto.randomUUID();
        await createSyncedQuizGroup({
          groupId: syncGroupId,
          uid: userId,
          title: quizData.title,
          questions: quizData.questions,
          // Plumb the PLC id through so downstream notification routing
          // can scope stale-content alerts to the right inbox. Not
          // consumed today; the field is reserved for future use.
          ...(assignment.plc?.id ? { plcId: assignment.plc.id } : {}),
        });
        // Patch the local quiz metadata in place. We cannot use the
        // canonical saveQuiz path here because it would re-publish the
        // questions (and the canonical was just seeded with the same
        // content — that would be a wasted version bump and a fresh
        // listener fan-out). Direct merge keeps the linkage tight to the
        // create-and-attach gesture.
        await updateDoc(quizMetaRef, {
          sync: { groupId: syncGroupId, lastSyncedVersion: 1 },
        });
      }

      const payload: Omit<SharedQuizAssignment, 'id'> = {
        title: quizData.title,
        questions: quizData.questions,
        createdAt: quizData.createdAt,
        updatedAt: quizData.updatedAt,
        assignmentSettings: {
          className: assignment.className,
          sessionMode: assignment.sessionMode,
          sessionOptions: assignment.sessionOptions,
          ...(assignment.plc ? { plc: assignment.plc } : {}),
          teacherName: assignment.teacherName,
          periodName: assignment.periodName,
          periodNames: assignment.periodNames,
        },
        originalAuthor: userId,
        sharedAt: Date.now(),
        syncGroupId,
      };
      const ref = await addDoc(
        collection(db, SHARED_ASSIGNMENTS_COLLECTION),
        payload
      );
      return `${window.location.origin}/share/assignment/${ref.id}`;
    },
    [userId]
  );

  const importSharedAssignment = useCallback<
    UseQuizAssignmentsResult['importSharedAssignment']
  >(
    async (shareId, saveQuiz, rollbackQuiz, plcHandling, options) => {
      if (!userId) throw new Error('Not authenticated');

      const snap = await getDoc(
        doc(db, SHARED_ASSIGNMENTS_COLLECTION, shareId)
      );
      if (!snap.exists()) throw new Error('Shared assignment not found');
      // Apply legacy-shape migration so older share docs (written before
      // the PlcLinkage refactor with flat `plcMode`/`plcSheetUrl`/etc.
      // fields on `assignmentSettings`) read as the canonical `plc`
      // sub-object shape — every downstream branch below sees one shape.
      const sharedRaw = snap.data() as SharedQuizAssignment;
      const shared: SharedQuizAssignment = {
        ...sharedRaw,
        assignmentSettings: migrateLegacyAssignmentShape(
          sharedRaw.assignmentSettings as QuizAssignmentSettings &
            LegacyPlcShape
        ) as QuizAssignmentSettings,
      };

      // 1. Copy the quiz into the importer's library.
      //
      // Synced-mode resolution: if the importer chose 'sync' AND the share
      // doc carries a `syncGroupId`, we'll join the canonical group below
      // and use ITS content as the seed for the local Drive copy (rather
      // than the inlined `shared.questions`, which may be stale relative
      // to the canonical doc when a peer published while the URL was
      // sitting in someone's clipboard). The mode silently degrades to
      // 'copy' when the share has no `syncGroupId` — defensive handling
      // for clients that pass mode='sync' against a legacy share doc.
      const requestedMode: SharedAssignmentImportMode = options?.mode ?? 'copy';
      const effectiveMode: SharedAssignmentImportMode =
        requestedMode === 'sync' && shared.syncGroupId ? 'sync' : 'copy';

      let initialQuestions = shared.questions;
      let initialTitle = shared.title;
      let canonicalVersion: number | undefined = undefined;
      if (effectiveMode === 'sync' && shared.syncGroupId) {
        // Fail the sync import outright if the canonical doc is
        // unreachable. Falling back to the inlined `shared.questions`
        // would leave the importer with a sync-linked assignment whose
        // local content was seeded from a (possibly stale) snapshot
        // while `syncedVersion` claimed the canonical's current
        // version — the assignment would render "Sync available"
        // immediately after creation, confusing the importer. Better to
        // surface the failure so they can retry or fall back to
        // "Make a copy" in the picker.
        const canonical = await pullSyncedQuizContent(shared.syncGroupId);
        initialTitle = canonical.title;
        initialQuestions = canonical.questions;
        canonicalVersion = canonical.version;
      }

      const now = Date.now();
      const newQuiz: QuizData = {
        id: crypto.randomUUID(),
        title: initialTitle,
        questions: initialQuestions,
        createdAt: now,
        updatedAt: now,
      };
      const savedMeta = await saveQuiz(newQuiz);

      // 1a. If syncing, join the canonical group + patch local metadata
      // BEFORE creating the assignment so the assignment's `sync`
      // sub-object lands in its canonical first-write state.
      //
      // Rollback shape: we track whether the join actually completed so
      // a failure in `attachSyncLinkage` (or any later step in this
      // block) can undo it. Without the leave call the importer would
      // be left as a phantom participant of the canonical group while
      // their local quiz copy got rolled back — defeating the rollback.
      let assignmentSyncedFrom: QuizAssignmentSyncLinkage | undefined =
        undefined;
      let joinedGroupId: string | null = null;
      if (effectiveMode === 'sync' && shared.syncGroupId) {
        try {
          const joinResult = await callJoinSyncedQuizGroup(shareId);
          joinedGroupId = joinResult.groupId;
          // Prefer the higher of canonicalVersion (read at step 1) and
          // joinResult.version (read inside the join transaction). If a peer
          // published between those two reads, joinResult.version is fresher
          // — using only canonicalVersion would tag the new local copy as
          // already-stale and surface a false "Sync available" prompt right
          // after import. Math.max picks the most recent observed version.
          const liveVersion = Math.max(
            canonicalVersion ?? 0,
            joinResult.version
          );
          if (options?.attachSyncLinkage) {
            await options.attachSyncLinkage(savedMeta.id, {
              groupId: joinResult.groupId,
              lastSyncedVersion: liveVersion,
            });
          }
          assignmentSyncedFrom = {
            groupId: joinResult.groupId,
            syncedVersion: liveVersion,
          };
        } catch (err) {
          if (joinedGroupId) {
            try {
              await callLeaveSyncedQuizGroup(joinedGroupId);
            } catch (leaveErr) {
              logError(
                'useQuizAssignments.importSharedAssignment.rollbackLeave',
                leaveErr,
                { phase: 'sync-join', groupId: joinedGroupId, shareId }
              );
            }
          }
          if (rollbackQuiz) {
            try {
              await rollbackQuiz(savedMeta);
            } catch (rollbackErr) {
              logError(
                'useQuizAssignments.importSharedAssignment.rollbackQuiz',
                rollbackErr,
                {
                  phase: 'sync-join',
                  quizId: savedMeta.id,
                  driveFileId: savedMeta.driveFileId,
                }
              );
            }
          }
          throw err;
        }
      }

      // 2. Create a Paused assignment with the shared settings.
      // Clear all originator-scoped fields so the importer starts fresh
      // with their own targeting, identity, and PLC wiring:
      //   - teacherName / periodName / periodNames: originator's free text
      //     and class periods.
      //   - className: originator's class label (e.g. "Mrs. Smith's
      //     3rd Period"). Cosmetic-only but confusing UX if left in
      //     place — Teacher B sees Teacher A's label as the subtitle
      //     on her own assignment card.
      //   - plc.sheetUrl: points at the ORIGINATOR's PLC Google Sheet.
      //     If left in place, the importer's first results export takes
      //     this URL (see QuizResults.tsx → exportResultsToSheet) and
      //     calls Drive against a sheet the importer isn't shared on —
      //     a 403. Clearing the whole `plc` linkage lets the auto-create
      //     path on first PLC assignment populate the importer's own
      //     sheet instead.
      //   - plc.memberEmails: originator's PLC roster. Not consumed by
      //     the importer's start-flow today (Widget.tsx derives sharing
      //     from the live `plc` doc via getPlcTeammateEmails), but
      //     cleared for hygiene — leaving someone else's email roster
      //     on the doc is a future-foot-gun.
      //   - plc itself: cleared so the importer explicitly opts back in
      //     to PLC mode for their own assignment via the settings modal,
      //     keeping repopulation tied to the importer's own PLC selection
      //     rather than the originator's.
      //
      // EXCEPTION: members of the share's PLC keep `plc` wiring so their
      // exports route to the same shared sheet that the originator and
      // every other peer use (already shared with all members at sheet
      // creation time in Widget.tsx → createPlcSheetAndShare).
      const sharedPlc = shared.assignmentSettings.plc;
      const importerIsPlcMember =
        !!sharedPlc && !!plcHandling && plcHandling.isMember(sharedPlc.id);

      const importedSettings: QuizAssignmentSettings = {
        ...shared.assignmentSettings,
        className: undefined,
        teacherName: undefined,
        periodName: undefined,
        periodNames: undefined,
        plc: importerIsPlcMember ? shared.assignmentSettings.plc : undefined,
      };

      if (sharedPlc && !importerIsPlcMember && plcHandling) {
        try {
          plcHandling.onNonMember({
            plcId: sharedPlc.id,
            plcName: sharedPlc.name,
          });
        } catch (cbErr) {
          logError(
            'useQuizAssignments.importSharedAssignment.onNonMember',
            cbErr,
            { plcId: sharedPlc.id }
          );
        }
      }
      // Intentionally omit classIds/rosterIds: the shared doc's targeting
      // refers to rosters in the ORIGINATOR's account and would be dangling
      // refs here. The importer retargets on first launch via AssignClassPicker,
      // which pre-seeds empty because lastRosterIdsByQuizId is only written at
      // assign-confirm time (QuizWidget/Widget.tsx) — never during import.
      // 3. Stand up the assignment + its session doc. If this fails
      // AFTER the quiz copy already succeeded, the importer is left
      // with an orphan quiz in their library and a generic "Failed to
      // import" toast. Roll back best-effort, and re-throw with the
      // orphaned quiz id surfaced so the caller can be specific.
      let created: { id: string; code: string };
      try {
        created = await createAssignment(
          {
            id: savedMeta.id,
            title: newQuiz.title,
            driveFileId: savedMeta.driveFileId,
            questions: newQuiz.questions,
          },
          importedSettings,
          {
            initialStatus: 'paused',
            ...(assignmentSyncedFrom
              ? { syncedFrom: assignmentSyncedFrom }
              : {}),
          }
        );
      } catch (err) {
        // Same rollback shape as the sync-join catch above: if we
        // joined a synced group earlier, leave it before tearing down
        // the local quiz copy. Without the leave call, a failed
        // assignment-create would strand the importer as a phantom
        // participant — exactly what the rollback is supposed to
        // prevent.
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError(
              'useQuizAssignments.importSharedAssignment.rollbackLeave',
              leaveErr,
              {
                phase: 'assignment-create',
                groupId: joinedGroupId,
                shareId,
              }
            );
          }
        }
        if (rollbackQuiz) {
          try {
            await rollbackQuiz(savedMeta);
          } catch (rollbackErr) {
            // Don't mask the original error — orphan quiz is the
            // lesser problem; the caller still needs to know what
            // really failed.
            logError(
              'useQuizAssignments.importSharedAssignment.rollbackQuiz',
              rollbackErr,
              {
                phase: 'assignment-create',
                quizId: savedMeta.id,
                driveFileId: savedMeta.driveFileId,
              }
            );
          }
        }
        throw err;
      }
      return created.id;
    },
    [userId, createAssignment]
  );

  const syncAssignmentToLatest = useCallback<
    UseQuizAssignmentsResult['syncAssignmentToLatest']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      const assignmentRef = doc(
        db,
        'users',
        userId,
        QUIZ_ASSIGNMENTS_COLLECTION,
        assignmentId
      );
      const assignmentSnap = await getDoc(assignmentRef);
      if (!assignmentSnap.exists()) {
        throw new Error('Assignment not found.');
      }
      const assignment = migrateSyncLinkageShape(
        migrateLegacyAssignmentShape(
          assignmentSnap.data() as QuizAssignment &
            LegacyPlcShape &
            LegacySyncLinkageShape
        )
      ) as QuizAssignment;
      if (!assignment.sync) {
        // Not a synced assignment — nothing to do. Returning a no-op result
        // (rather than throwing) lets callers wire the action without
        // having to gate on `assignment.sync` ahead of every call.
        return { updated: false, version: 0, taggedResponseCount: 0 };
      }

      const canonical = await pullSyncedQuizContent(assignment.sync.groupId);
      const previousSyncedVersion = assignment.sync.syncedVersion;
      if (canonical.version <= previousSyncedVersion) {
        return {
          updated: false,
          version: canonical.version,
          taggedResponseCount: 0,
        };
      }
      // Floor the tag value at 1 so a response is never tagged with `0`.
      // Canonical versions start at 1, so a synced assignment should
      // always carry `syncedVersion >= 1` — but a future canonical-init
      // change or a corrupt doc that lands with `syncedVersion: 0` would
      // otherwise tag responses with `0`, the same value
      // `where('preSyncVersion', '==', 0)` queries for. That would loop:
      // every subsequent sync would re-fetch and re-tag the same rows
      // forever. The floor turns a hypothetical bug into a no-op tag.
      const tagValue = Math.max(previousSyncedVersion, 1);

      // Build the student-safe publicQuestions array from the canonical
      // content. This MUST match the shuffle/strip logic used at session
      // create time (toPublicQuestion) so the student-side rendering path
      // doesn't have to special-case post-sync state.
      const publicQuestions = canonical.questions.map(toPublicQuestion);

      // Tag any pre-existing responses with the OLD `syncedVersion` so
      // the results UI can render "Answered before v{N+1} update" chips.
      //
      // The first batch ALWAYS contains the assignment + session writes
      // so a crash before any responses are tagged still leaves the
      // session at the new version (the worst-case is some responses
      // missing their pre-sync chip — recoverable by re-running). We
      // chunk additional response tags into separate batches because
      // Firestore caps a single batch at 500 writes; a PLC-shared
      // assignment with hundreds of submissions across all peer
      // teachers could otherwise blow the limit and reject the entire
      // sync.
      //
      // Server-side filter: every response is initialized with
      // `preSyncVersion: 0` at create time (see `useQuizSession.ts`)
      // and the firestore rule pins creates to 0, so a `== 0` query
      // returns exactly the rows that still need tagging. Equality
      // (rather than `<`) ensures already-tagged responses keep the
      // version at which they first fell behind — the chip on the
      // results card needs that original snapshot, not the latest
      // pre-sync version. It also avoids re-fetching/re-writing every
      // previously-tagged response on every subsequent sync (write
      // amplification).
      const responsesSnap = await getDocs(
        query(
          collection(
            db,
            QUIZ_SESSIONS_COLLECTION,
            assignmentId,
            RESPONSES_COLLECTION
          ),
          where('preSyncVersion', '==', 0)
        )
      );
      const now = Date.now();
      const responsesToTag = responsesSnap.docs;

      // Batch budget: leave headroom under the 500-write cap so an
      // off-by-one (or a future field added to the assignment/session
      // writes) doesn't push the first batch over the edge.
      const MAX_BATCH_WRITES = 400;

      // First batch: assignment + session writes plus as many response
      // tags as fit. Committing this first means partial progress is
      // safe: even if the second/third batch fails, the session is on
      // the new version and a subsequent call will pick up the rest of
      // the responses (the filter above skips already-tagged ones).
      //
      // We deliberately do NOT overwrite `quizTitle` on the assignment
      // (or the session). The teacher-local quiz title is independent
      // of the canonical synced title — an importer can rename their
      // local copy, and rewriting that on every sync would be a
      // surprise. Sync only touches the question content + version
      // bookkeeping.
      const firstBatch = writeBatch(db);
      firstBatch.update(assignmentRef, {
        sync: {
          groupId: assignment.sync.groupId,
          syncedVersion: canonical.version,
        },
        updatedAt: now,
      });
      firstBatch.update(doc(db, QUIZ_SESSIONS_COLLECTION, assignmentId), {
        publicQuestions,
        totalQuestions: canonical.questions.length,
      });
      // 2 writes already used (assignment + session); fill the rest.
      const firstChunkSize = Math.min(
        responsesToTag.length,
        MAX_BATCH_WRITES - 2
      );
      for (let i = 0; i < firstChunkSize; i++) {
        firstBatch.update(responsesToTag[i].ref, {
          preSyncVersion: tagValue,
        });
      }
      await firstBatch.commit();

      // Subsequent chunks for any remaining responses.
      for (
        let cursor = firstChunkSize;
        cursor < responsesToTag.length;
        cursor += MAX_BATCH_WRITES
      ) {
        const chunk = responsesToTag.slice(cursor, cursor + MAX_BATCH_WRITES);
        const chunkBatch = writeBatch(db);
        for (const d of chunk) {
          chunkBatch.update(d.ref, {
            preSyncVersion: tagValue,
          });
        }
        await chunkBatch.commit();
      }

      return {
        updated: true,
        version: canonical.version,
        taggedResponseCount: responsesToTag.length,
      };
    },
    [userId]
  );

  return {
    assignments,
    loading,
    error,
    createAssignment,
    pauseAssignment,
    resumeAssignment,
    deactivateAssignment,
    reopenAssignment,
    deleteAssignment,
    updateAssignmentSettings,
    setAssignmentRosters,
    setAssignmentExportUrl,
    setAssignmentExportedResponseIds,
    shareAssignment,
    peekSharedAssignment,
    importSharedAssignment,
    syncAssignmentToLatest,
  };
};
