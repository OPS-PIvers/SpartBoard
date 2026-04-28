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
import type {
  QuizAssignment,
  QuizAssignmentSettings,
  QuizAssignmentStatus,
  QuizData,
  QuizQuestion,
  QuizSession,
  SharedQuizAssignment,
} from '../types';
import {
  QUIZ_SESSIONS_COLLECTION,
  RESPONSES_COLLECTION,
  toPublicQuestion,
} from './useQuizSession';

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
   * `classIds` is the list of ClassLink class `sourcedId`s this session is
   * targeted at (Phase 5A multi-class). When non-empty, the session doc
   * stores them on `classIds` (and transitionally mirrors `classIds[0]` to
   * `classId` so pre-Phase-5A Firestore rules still gate correctly).
   * Firestore rules (`passesStudentClassGateList`) enforce that ClassLink-
   * authenticated students can only read sessions whose classIds overlap
   * their auth-token classIds claim. An empty/missing list preserves the
   * classic code/PIN-only flow.
   */
  createAssignment: (
    quiz: AssignmentQuizRef,
    settings: QuizAssignmentSettings,
    initialStatus?: QuizAssignmentStatus,
    classIds?: string[],
    rosterIds?: string[]
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
    targets: { rosterIds: string[]; classIds: string[]; periodNames: string[] }
  ) => Promise<void>;
  /**
   * Persist the Drive export URL onto the assignment doc so re-entering
   * Results after navigating away (which remounts QuizResults and wipes its
   * local state) shows the "Open Sheet" shortcut instead of reverting to
   * "Export".
   */
  setAssignmentExportUrl: (assignmentId: string, url: string) => Promise<void>;
  /** Publish this assignment as a shareable link. Returns the /share/assignment/{id} URL. */
  shareAssignment: (
    assignmentId: string,
    quizData: QuizData
  ) => Promise<string>;
  /**
   * Import a shared assignment. Delegates quiz copy to the injected saveQuiz
   * (from useQuiz.ts) and creates a new paused assignment under the importer's
   * collection. Returns the new assignmentId.
   */
  importSharedAssignment: (
    shareId: string,
    saveQuiz: (quiz: QuizData) => Promise<{ id: string; driveFileId: string }>
  ) => Promise<string>;
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
          snap.docs.map((d) => ({ ...d.data(), id: d.id }) as QuizAssignment)
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
    async (quiz, settings, initialStatus = 'active', classIds, rosterIds) => {
      if (!userId) throw new Error('Not authenticated');
      const targetClassIds = classIds ?? [];
      const targetRosterIds = (rosterIds ?? []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0
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
        plcMode: settings.plcMode,
        plcSheetUrl: settings.plcSheetUrl,
        teacherName: settings.teacherName,
        periodName: settings.periodName,
        periodNames: settings.periodNames,
        plcMemberEmails: settings.plcMemberEmails,
        attemptLimit: settings.attemptLimit ?? null,
        ...(targetRosterIds.length > 0 ? { rosterIds: targetRosterIds } : {}),
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
        attemptLimit: settings.attemptLimit ?? null,
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
      const batch = writeBatch(db);
      batch.update(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),
        { ...patch, updatedAt: now } as Record<string, unknown>
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
      // to classId for the legacy single-class gate (see createAssignment
      // at line ~278 for the same dual-write rationale).
      const sessionPatch: Record<string, unknown> = {
        rosterIds: cleanedRosterIds,
        classIds: cleanedClassIds,
        classId: cleanedClassIds[0] ?? '',
        periodNames: cleanedPeriodNames,
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

  const shareAssignment = useCallback<
    UseQuizAssignmentsResult['shareAssignment']
  >(
    async (assignmentId, quizData) => {
      if (!userId) throw new Error('Not authenticated');
      const snap = await getDoc(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId)
      );
      if (!snap.exists()) throw new Error('Assignment not found');
      const assignment = snap.data() as QuizAssignment;

      const payload: Omit<SharedQuizAssignment, 'id'> = {
        title: quizData.title,
        questions: quizData.questions,
        createdAt: quizData.createdAt,
        updatedAt: quizData.updatedAt,
        assignmentSettings: {
          className: assignment.className,
          sessionMode: assignment.sessionMode,
          sessionOptions: assignment.sessionOptions,
          plcMode: assignment.plcMode,
          plcSheetUrl: assignment.plcSheetUrl,
          teacherName: assignment.teacherName,
          periodName: assignment.periodName,
          periodNames: assignment.periodNames,
          plcMemberEmails: assignment.plcMemberEmails,
        },
        originalAuthor: userId,
        sharedAt: Date.now(),
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
    async (shareId, saveQuiz) => {
      if (!userId) throw new Error('Not authenticated');

      const snap = await getDoc(
        doc(db, SHARED_ASSIGNMENTS_COLLECTION, shareId)
      );
      if (!snap.exists()) throw new Error('Shared assignment not found');
      const shared = snap.data() as SharedQuizAssignment;

      // 1. Copy the quiz into the importer's library.
      const now = Date.now();
      const newQuiz: QuizData = {
        id: crypto.randomUUID(),
        title: shared.title,
        questions: shared.questions,
        createdAt: now,
        updatedAt: now,
      };
      const savedMeta = await saveQuiz(newQuiz);

      // 2. Create a Paused assignment with the shared settings.
      // Clear all originator-scoped fields so the importer starts fresh
      // with their own targeting, identity, and PLC wiring:
      //   - teacherName / periodName / periodNames: originator's free text
      //     and class periods.
      //   - plcSheetUrl: points at the ORIGINATOR's PLC Google Sheet. If
      //     left in place, Widget.tsx's start-flow feeds it (along with
      //     plcMemberEmails) into reconcilePlcSheetPermissions(), which
      //     issues Drive calls against a sheet the importer doesn't own
      //     and does Firestore reads on plcs/{originatorPlcId} where the
      //     importer is not in memberUids — surfacing as silent
      //     "Missing or insufficient permissions" console errors.
      //   - plcMemberEmails: originator's PLC roster, irrelevant to the
      //     importer's PLC (if any).
      //   - plcMode: cleared so the importer explicitly opts in to PLC
      //     mode for their own assignment via the settings modal — both
      //     consistent with how their other settings behave and the only
      //     way to guarantee plcMemberEmails / plcSheetUrl are repopulated
      //     against the importer's own PLC instead of the originator's.
      const importedSettings = {
        ...shared.assignmentSettings,
        teacherName: undefined,
        periodName: undefined,
        periodNames: undefined,
        plcMode: undefined,
        plcSheetUrl: undefined,
        plcMemberEmails: undefined,
      };
      // Intentionally omit classIds/rosterIds: the shared doc's targeting
      // refers to rosters in the ORIGINATOR's account and would be dangling
      // refs here. The importer retargets on first launch via AssignClassPicker,
      // which pre-seeds empty because lastRosterIdsByQuizId is only written at
      // assign-confirm time (QuizWidget/Widget.tsx) — never during import.
      const created = await createAssignment(
        {
          id: savedMeta.id,
          title: newQuiz.title,
          driveFileId: savedMeta.driveFileId,
          questions: newQuiz.questions,
        },
        importedSettings,
        'paused'
      );
      return created.id;
    },
    [userId, createAssignment]
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
    shareAssignment,
    importSharedAssignment,
  };
};
