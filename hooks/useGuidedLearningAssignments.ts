/**
 * useGuidedLearningAssignments hook
 *
 * Per-teacher archive of guided learning assignments. An assignment is the
 * durable record of a GuidedLearningSession the teacher handed out to
 * students — it lives under /users/{teacherUid}/guided_learning_assignments/
 * and is paired 1:1 with a /guided_learning_sessions/{sessionId} doc.
 *
 * Guided Learning doesn't have the same join-code / lifecycle surface as
 * Quiz, so this hook is intentionally small: record new assignments when the
 * teacher "assigns" a set, archive them to remove from the In Progress tab,
 * and delete them (plus the session + responses) permanently.
 */

import { useCallback, useMemo } from 'react';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { readAllDocsPaged } from '@/utils/firestorePaging';
import { invalidateSessionViewCount } from './useSessionViewCount';
import {
  type SharedSource,
  useSharedSubscription,
} from './useSharedSubscription';
import { dedupeStepsById, isAnswerCorrect } from './useGuidedLearningSession';
import {
  GL_CONTENT_COLLECTION,
  GL_CONTENT_DOC,
} from '@/utils/guidedLearningSessionContent';
import type {
  AssignmentMode,
  GuidedLearningAssignment,
  GuidedLearningAssignmentStatus,
  GuidedLearningResponse,
  GuidedLearningScoreVisibility,
  GuidedLearningSet,
  GuidedLearningStep,
  StudentOverride,
  GuidedLearningSession,
} from '@/types';

const GL_ASSIGNMENTS_COLLECTION = 'guided_learning_assignments';
const GL_SESSIONS_COLLECTION = 'guided_learning_sessions';
const GL_SESSION_RESPONSES_SUBCOLLECTION = 'responses';

/**
 * Stringify a step's canonical correct answer for `session.revealedAnswers`.
 * `revealedAnswers` is `Record<stepId, string>` (mirrors Quiz/VA), so the
 * array-shaped answers for matching and sorting are flattened into a
 * human-readable string for the student review screen. Returns `null` for
 * steps that don't have a gradable question (info hotspots, etc.).
 *
 * Exhaustive over `GuidedLearningQuestionType`: a new type added to the
 * union surfaces as a TypeScript error on the `_exhaustiveCheck: never`
 * assignment, so callers can't silently drop coverage for a new question
 * shape.
 */
export function formatCanonicalAnswer(step: GuidedLearningStep): string | null {
  const q = step.question;
  if (!q) return null;
  switch (q.type) {
    case 'multiple-choice':
      return q.correctAnswer ?? null;
    case 'matching':
      if (!q.matchingPairs?.length) return null;
      return q.matchingPairs.map((p) => `${p.left} → ${p.right}`).join('\n');
    case 'sorting':
      if (!q.sortingItems?.length) return null;
      return q.sortingItems.join(' → ');
    default: {
      const _exhaustiveCheck: never = q.type;
      void _exhaustiveCheck;
      return null;
    }
  }
}

export interface CreateAssignmentInput {
  /** The session id (also becomes the assignment id). */
  sessionId: string;
  /** The set that was assigned. */
  setId: string;
  setTitle: string;
  /** Whether the set came from the personal (Drive) or building library. */
  source?: 'personal' | 'building';
  /** Unified roster targeting (rosters are the single source of truth for
   *  assignments; ClassLink-imported rosters carry `classlinkClassId` so the
   *  student SSO gate resolves via session derivation). */
  rosterIds?: string[];
  /** Frozen at creation from the org-wide `assignment-modes` admin setting.
   *  Stored under `assignmentMode` (not `mode`) to avoid colliding with the
   *  GL session's existing play-mode field. Defaults to `'submissions'`. */
  assignmentMode?: AssignmentMode;
  /** Individual-student targeting (spec §5 B3): `targetMode` and
   *  `targetStudents` are persisted server-side only, by
   *  `setAssignmentTargetsV1` — the client never writes them. */
  targetGroupIds?: string[];
  /** Keyed by `studentTargetRefKey` — see `utils/studentTargetRef.ts`. */
  overridesBySourcedId?: Record<string, StudentOverride>;
  openAt?: number;
  closeAt?: number;
  dueAt?: number;
  /** Per-period gate mirrored from the session for the hub. */
  periodGate?: Pick<GuidedLearningSession, 'accessMode' | 'periodAccess'>;
  answerKeys?: GuidedLearningAssignment['answerKeys'];
}

export interface UseGuidedLearningAssignmentsResult {
  assignments: GuidedLearningAssignment[];
  loading: boolean;
  error: string | null;
  /** True when closed assignments older than the loaded pages may exist. */
  hasOlder: boolean;
  /** Loads the next page of closed assignments. */
  showOlder: () => void;
  /** Persist a new assignment entry (usually right after createSession). */
  createAssignment: (
    input: CreateAssignmentInput
  ) => Promise<GuidedLearningAssignment>;
  /** Move an assignment to the Archive tab (session stays queryable). */
  archiveAssignment: (assignmentId: string) => Promise<void>;
  /** Move an archived assignment back into In Progress. */
  unarchiveAssignment: (assignmentId: string) => Promise<void>;
  /** Delete assignment + session + all responses permanently. */
  deleteAssignment: (assignmentId: string) => Promise<void>;
  /**
   * Publish student-facing score visibility for an archived assignment.
   * Mirrors `useQuizAssignments.publishAssignmentScores`: recomputes
   * per-response `isCorrect` + `score`, mirrors the visibility flag onto
   * the session doc, and populates `session.revealedAnswers` iff the
   * teacher chose `'score-responses-and-answers'`. Pre-existing
   * per-response values are overwritten so the operation is idempotent
   * and self-correcting (responses submitted in student-mode are
   * written with `isCorrect: null`).
   *
   * The signature deliberately excludes `'none'` — use
   * {@link UseGuidedLearningAssignmentsResult.unpublishAssignmentScores}
   * for the rollback path, which is a cheap two-write batch that
   * doesn't require fabricating a placeholder `GuidedLearningSet`.
   */
  publishAssignmentScores: (
    assignmentId: string,
    glData: GuidedLearningSet,
    visibility: Exclude<GuidedLearningScoreVisibility, 'none'>
  ) => Promise<{ responsesUpdated: number }>;
  /**
   * Revoke published score visibility for an assignment. Clears
   * `scoreVisibility` + `scorePublishedAt` on the assignment doc (via
   * `deleteField()`) and wipes `revealedAnswers` on the mirrored
   * session doc. Per-response `score` / `isCorrect` are left intact —
   * student-side rendering gates on `session.scoreVisibility`.
   */
  unpublishAssignmentScores: (assignmentId: string) => Promise<void>;
}

/** Closed assignments listed before "Show older"; open ones are always listed in full. */
export const GL_ASSIGNMENTS_PAGE_SIZE = 50;

interface AssignmentsState {
  open: GuidedLearningAssignment[];
  recent: GuidedLearningAssignment[];
  recentLimit: number;
  openLoaded: boolean;
  recentLoaded: boolean;
  error: string | null;
}

// Per teacher: raises the recent listener's limit by one page.
const olderLoaders = new Map<string, () => void>();

const toAssignments = (snap: QuerySnapshot): GuidedLearningAssignment[] =>
  snap.docs.map((d) => ({ ...d.data(), id: d.id }) as GuidedLearningAssignment);

const assignmentsSource: SharedSource<AssignmentsState> = {
  id: 'gl-assignments',
  initial: {
    open: [],
    recent: [],
    recentLimit: GL_ASSIGNMENTS_PAGE_SIZE,
    openLoaded: false,
    recentLoaded: false,
    error: null,
  },
  start: (userId, update) => {
    const ref = collection(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION);
    const onError = (err: unknown) => {
      console.error('[useGuidedLearningAssignments] Firestore error:', err);
      update((prev) => ({
        ...prev,
        openLoaded: true,
        recentLoaded: true,
        error: 'Failed to load guided learning assignments',
      }));
    };
    // Equality-only, so no composite index; open assignments are never capped.
    const openUnsub = onSnapshot(
      query(ref, where('status', '==', 'active')),
      (snap) =>
        update((prev) => ({
          ...prev,
          open: toAssignments(snap),
          openLoaded: true,
        })),
      onError
    );
    let recentLimit = GL_ASSIGNMENTS_PAGE_SIZE;
    let recentUnsub = (): void => undefined;
    const listenRecent = () => {
      const pageLimit = recentLimit;
      recentUnsub();
      recentUnsub = onSnapshot(
        query(ref, orderBy('createdAt', 'desc'), limit(pageLimit)),
        (snap) =>
          update((prev) => ({
            ...prev,
            recent: toAssignments(snap),
            recentLimit: pageLimit,
            recentLoaded: true,
          })),
        onError
      );
    };
    listenRecent();
    olderLoaders.set(userId, () => {
      recentLimit += GL_ASSIGNMENTS_PAGE_SIZE;
      listenRecent();
    });
    return () => {
      olderLoaders.delete(userId);
      openUnsub();
      recentUnsub();
    };
  },
};

/** Open and recent listeners overlap; keep the fresher copy of each doc, newest first. */
export const mergeAssignments = (
  open: GuidedLearningAssignment[],
  recent: GuidedLearningAssignment[]
): GuidedLearningAssignment[] => {
  const byId = new Map<string, GuidedLearningAssignment>();
  for (const a of [...recent, ...open]) {
    const prev = byId.get(a.id);
    if (!prev || a.updatedAt >= prev.updatedAt) byId.set(a.id, a);
  }
  return [...byId.values()].sort((x, y) => y.createdAt - x.createdAt);
};

export const useGuidedLearningAssignments = (
  userId: string | undefined
): UseGuidedLearningAssignmentsResult => {
  const shared = useSharedSubscription(assignmentsSource, userId ?? null);
  const assignments = useMemo(
    () => mergeAssignments(shared.open, shared.recent),
    [shared.open, shared.recent]
  );
  const loading = userId ? !(shared.openLoaded && shared.recentLoaded) : false;
  const error = userId ? shared.error : null;
  const hasOlder = !!userId && shared.recent.length >= shared.recentLimit;
  const showOlder = useCallback(() => {
    if (userId) olderLoaders.get(userId)?.();
  }, [userId]);

  const createAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['createAssignment']
  >(
    async (input) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const rosterIds = (input.rosterIds ?? []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      );
      const assignment: GuidedLearningAssignment = {
        id: input.sessionId,
        sessionId: input.sessionId,
        setId: input.setId,
        setTitle: input.setTitle,
        teacherUid: userId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        source: input.source,
        ...(rosterIds.length > 0 ? { rosterIds } : {}),
        assignmentMode: input.assignmentMode ?? 'submissions',
        ...(input.targetGroupIds && input.targetGroupIds.length > 0
          ? { targetGroupIds: input.targetGroupIds }
          : {}),
        ...(input.overridesBySourcedId &&
        Object.keys(input.overridesBySourcedId).length > 0
          ? { overridesBySourcedId: input.overridesBySourcedId }
          : {}),
        ...(input.openAt !== undefined ? { openAt: input.openAt } : {}),
        ...(input.closeAt !== undefined ? { closeAt: input.closeAt } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.answerKeys && Object.keys(input.answerKeys).length > 0
          ? { answerKeys: input.answerKeys }
          : {}),
        ...(input.periodGate?.periodAccess
          ? {
              accessMode: input.periodGate.accessMode,
              periodAccess: input.periodGate.periodAccess,
            }
          : {}),
      };
      await setDoc(
        doc(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION, input.sessionId),
        assignment
      );
      return assignment;
    },
    [userId]
  );

  const setStatus = useCallback(
    async (
      assignmentId: string,
      status: GuidedLearningAssignmentStatus
    ): Promise<void> => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      await updateDoc(
        doc(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION, assignmentId),
        {
          status,
          updatedAt: now,
          archivedAt: status === 'archived' ? now : null,
        }
      );
    },
    [userId]
  );

  const archiveAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['archiveAssignment']
  >((assignmentId) => setStatus(assignmentId, 'archived'), [setStatus]);

  const unarchiveAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['unarchiveAssignment']
  >(
    async (assignmentId) => {
      await setStatus(assignmentId, 'active');
      // Drop any cached view count so the Shared row re-issues the
      // aggregation query on next mount; the cache is module-scoped and
      // would otherwise hold the pre-archive count forever.
      invalidateSessionViewCount('guided_learning_sessions', assignmentId);
    },
    [setStatus]
  );

  const deleteAssignment = useCallback<
    UseGuidedLearningAssignmentsResult['deleteAssignment']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');

      // Delete response documents in batches of 500 (Firestore batch limit).
      // Read in bounded pages so a session with thousands of responses can't
      // pull the whole subcollection into memory in a single unbounded read.
      const responseDocs = await readAllDocsPaged(
        collection(
          db,
          GL_SESSIONS_COLLECTION,
          assignmentId,
          GL_SESSION_RESPONSES_SUBCOLLECTION
        )
      );
      const BATCH_LIMIT = 500;
      for (let i = 0; i < responseDocs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        responseDocs
          .slice(i, i + BATCH_LIMIT)
          .forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Its own write, and it must land first: once the session goes, no rule can reach it.
      const sessionSnap = await getDoc(
        doc(db, GL_SESSIONS_COLLECTION, assignmentId)
      );
      if (sessionSnap.data()?.stepsInContent === true) {
        await deleteDoc(
          doc(
            db,
            GL_SESSIONS_COLLECTION,
            assignmentId,
            GL_CONTENT_COLLECTION,
            GL_CONTENT_DOC
          )
        );
      }

      // Delete session doc and the per-teacher assignment doc together.
      const finalBatch = writeBatch(db);
      finalBatch.delete(doc(db, GL_SESSIONS_COLLECTION, assignmentId));
      finalBatch.delete(
        doc(db, 'users', userId, GL_ASSIGNMENTS_COLLECTION, assignmentId)
      );
      await finalBatch.commit();
    },
    [userId]
  );

  const unpublishAssignmentScores = useCallback<
    UseGuidedLearningAssignmentsResult['unpublishAssignmentScores']
  >(
    async (assignmentId) => {
      if (!userId) throw new Error('Not authenticated');
      const now = Date.now();
      const assignmentRef = doc(
        db,
        'users',
        userId,
        GL_ASSIGNMENTS_COLLECTION,
        assignmentId
      );
      const sessionRef = doc(db, GL_SESSIONS_COLLECTION, assignmentId);
      // Wipe visibility flags via deleteField on both docs and clear
      // the revealed-answers map. Per-response `score` / `isCorrect`
      // are left intact: the student app gates on
      // `session.scoreVisibility`, so numbers behind a closed gate are
      // harmless and a re-publish at the same level avoids a multi-
      // batch recompute.
      const batch = writeBatch(db);
      batch.update(assignmentRef, {
        scoreVisibility: deleteField(),
        scorePublishedAt: deleteField(),
        updatedAt: now,
      });
      batch.update(sessionRef, {
        scoreVisibility: deleteField(),
        // Mirror `scorePublishedAt` removal on the session so the student's
        // `parsePublicationFields` (which requires BOTH fields) doesn't
        // see a stale timestamp lingering after unpublish.
        scorePublishedAt: deleteField(),
        revealedAnswers: deleteField(),
      });
      await batch.commit();
    },
    [userId]
  );

  const publishAssignmentScores = useCallback<
    UseGuidedLearningAssignmentsResult['publishAssignmentScores']
  >(
    async (assignmentId, glData, visibility) => {
      if (!userId) throw new Error('Not authenticated');
      // Belt-and-suspenders against a future caller bypassing the
      // type-level `Exclude<…, 'none'>` (matches Quiz/VA pattern).
      if ((visibility as string) === 'none') {
        throw new Error(
          'publishAssignmentScores: visibility "none" is not allowed — use unpublishAssignmentScores instead.'
        );
      }

      const now = Date.now();
      const assignmentRef = doc(
        db,
        'users',
        userId,
        GL_ASSIGNMENTS_COLLECTION,
        assignmentId
      );
      const sessionRef = doc(db, GL_SESSIONS_COLLECTION, assignmentId);

      // Index steps by id for O(1) grading lookups. `glData.steps` is the
      // canonical set loaded by the caller — `session.publicSteps` strips
      // answer keys for student safety, so we can't grade off the session.
      // Dedupe first-wins (matches createSession's `dedupeStepsById`) — a
      // Drive-sync/arrayUnion race can write the same step id twice with
      // differing content, and the student was served the FIRST occurrence,
      // so grading must resolve the same one. Mirrors the identical fix in
      // `useQuizAssignments.buildResponseGradingContext` (#3327).
      const dedupedSteps = dedupeStepsById(glData.steps);
      const stepsById = new Map<string, GuidedLearningStep>();
      for (const s of dedupedSteps) {
        stepsById.set(s.id, s);
      }
      const gradableStepIds = new Set<string>();
      for (const s of dedupedSteps) {
        if (s.question) gradableStepIds.add(s.id);
      }

      // Read responses in bounded pages (limit + documentId cursor) rather
      // than one unbounded `getDocs` so a PLC-shared assignment with
      // thousands of submissions can't pull the whole subcollection in a
      // single read. Grading still visits every response — the page loop
      // only changes how the reads are bounded, not the scoring math.
      const responseDocs = await readAllDocsPaged(
        collection(
          db,
          GL_SESSIONS_COLLECTION,
          assignmentId,
          GL_SESSION_RESPONSES_SUBCOLLECTION
        )
      );

      interface ResponseUpdate {
        ref: ReturnType<typeof doc>;
        patch: {
          score: number;
          answers: GuidedLearningResponse['answers'];
        };
      }
      const updates: ResponseUpdate[] = [];
      for (const d of responseDocs) {
        const data = d.data() as GuidedLearningResponse;
        // Answers saved mid-activity aren't a submission until completedAt is set.
        if (typeof data.completedAt !== 'number') continue;
        const answers = Array.isArray(data.answers) ? data.answers : [];
        let correctCount = 0;
        // Track which stepIds have already contributed to the score so a
        // duplicate answer (Drive-sync duplication / arrayUnion race writing
        // the same stepId twice into `answers`) can't inflate correctCount.
        // Each answer still receives an `isCorrect` annotation for the
        // student review screen, but only the first occurrence of a stepId
        // contributes to the numerator — matching the identical fix in
        // `useVideoActivityAssignments.publishAssignmentScores` and
        // `useQuizAssignments.publishAssignmentScores`.
        const scoredStepIds = new Set<string>();
        const gradedAnswers: GuidedLearningResponse['answers'] = answers.map(
          (a) => {
            const step = stepsById.get(a.stepId);
            if (!step || !step.question) {
              // Step deleted or no longer gradable — clear any stale
              // `isCorrect` so the response doesn't carry a value the
              // canonical set no longer supports.
              return { ...a, isCorrect: null };
            }
            const correct = isAnswerCorrect(step, a.answer);
            if (!scoredStepIds.has(a.stepId)) {
              scoredStepIds.add(a.stepId);
              if (correct) correctCount += 1;
            }
            return { ...a, isCorrect: correct };
          }
        );
        // Denominator: every gradable step in the canonical set. Counting
        // unanswered gradable steps toward the total means a blank
        // submission scores 0%, not undefined.
        const denom = gradableStepIds.size;
        const score =
          denom === 0 ? 0 : Math.round((correctCount / denom) * 100);
        updates.push({
          ref: d.ref,
          patch: { score, answers: gradedAnswers },
        });
      }

      // First batch carries the assignment + session writes so the
      // visibility flip lands atomically with at least the first chunk
      // of response updates. Subsequent chunks are independent; a
      // re-publish safely overwrites if any chunk fails.
      const MAX_BATCH_WRITES = 400;
      const firstBatch = writeBatch(db);
      firstBatch.update(assignmentRef, {
        scoreVisibility: visibility,
        scorePublishedAt: now,
        updatedAt: now,
      });
      const sessionPatch: Record<string, unknown> = {
        scoreVisibility: visibility,
        // Mirror `scorePublishedAt` onto the session so the student's
        // `/my-assignments` row can flip from "Not graded" to
        // "View results". `parsePublicationFields` requires BOTH fields,
        // and the student listener only subscribes to the session doc.
        scorePublishedAt: now,
      };
      if (visibility === 'score-responses-and-answers') {
        const revealedAnswers: Record<string, string> = {};
        // First-wins, matching the grading dedup above — the revealed answer
        // must match what the student was graded against.
        for (const s of dedupedSteps) {
          const formatted = formatCanonicalAnswer(s);
          if (formatted !== null) revealedAnswers[s.id] = formatted;
        }
        sessionPatch.revealedAnswers = revealedAnswers;
      } else {
        sessionPatch.revealedAnswers = deleteField();
      }
      firstBatch.update(sessionRef, sessionPatch);

      const firstChunkSize = Math.min(updates.length, MAX_BATCH_WRITES - 2);
      for (let i = 0; i < firstChunkSize; i++) {
        firstBatch.update(updates[i].ref, updates[i].patch);
      }
      await firstBatch.commit();
      let responsesCommitted = firstChunkSize;

      // Mirror Quiz/VA chunked-failure recovery: if a subsequent chunk
      // fails partway, the visibility flag is already flipped — some
      // students will see graded reviews while the remaining responses
      // still carry pre-publish state. Throw a structured error so the
      // caller can tell the teacher "X of Y graded, re-run Publish."
      try {
        for (
          let cursor = firstChunkSize;
          cursor < updates.length;
          cursor += MAX_BATCH_WRITES
        ) {
          const chunk = updates.slice(cursor, cursor + MAX_BATCH_WRITES);
          const chunkBatch = writeBatch(db);
          for (const u of chunk) {
            chunkBatch.update(u.ref, u.patch);
          }
          await chunkBatch.commit();
          responsesCommitted += chunk.length;
        }
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Partial publish: ${responsesCommitted} of ${updates.length} student responses graded. Re-run "Publish scores" to finish. (${cause})`
        );
      }

      return { responsesUpdated: updates.length };
    },
    [userId]
  );

  return {
    assignments,
    loading,
    error,
    hasOlder,
    showOlder,
    createAssignment,
    archiveAssignment,
    unarchiveAssignment,
    deleteAssignment,
    publishAssignmentScores,
    unpublishAssignmentScores,
  };
};
