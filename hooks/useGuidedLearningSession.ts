/**
 * useGuidedLearningSession hook
 *
 * Manages guided learning session creation, student response collection,
 * and data export for the assignment ("Assign" link) flow.
 *
 * Sessions are stored at:
 *   /guided_learning_sessions/{sessionId}       (teacher writes, world reads)
 *   /guided_learning_sessions/{sessionId}/responses/{studentUid}
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { audienceSessionFields } from '@/utils/staffAudience';
import {
  AssignmentAudience,
  AssignmentMode,
  GuidedLearningSet,
  GuidedLearningSession,
  GuidedLearningResponse,
  GuidedLearningPublicStep,
  GuidedLearningStep,
  GuidedLearningQuestionType,
} from '@/types';
import {
  GL_CONTENT_COLLECTION,
  GL_CONTENT_DOC,
  mergeGuidedLearningSessionContent,
  type GuidedLearningSessionContent,
} from '@/utils/guidedLearningSessionContent';
import {
  hasPeriodAccess,
  nextScheduledOpen,
  pickPeriodKey,
  studentPeriodKeys,
} from '@/utils/periodAccess';
import { getServerNow } from '@/utils/serverTime';
import { studentPreviewBlocksWrite } from '@/utils/viewAsTab';
import { assertGuidedLearningDocFits } from '@/utils/firestoreDocSize';
import type { WorkKind } from '@/utils/gradebook/gradebookCore';
import { useSandboxedGuidedLearningSession } from './useTourSandboxed';

const GL_SESSIONS_COLLECTION = 'guided_learning_sessions';

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Verify a stored answer against the teacher's answer key. */
export function isAnswerCorrect(
  step: GuidedLearningStep,
  answer: string | string[]
): boolean {
  const q = step.question;
  if (!q) return false;

  if (q.type === 'multiple-choice') {
    return typeof answer === 'string' && answer === q.correctAnswer;
  }

  if (q.type === 'matching') {
    if (!Array.isArray(answer) || !q.matchingPairs) return false;
    // Require the submitted set to be exactly the correct set: every correct
    // pair must be present AND no extra pairs may appear. Without the length
    // guard a student who submits all correct pairs plus one wrong pair would
    // be marked correct because `every` only checks the answer-key side.
    return (
      answer.length === q.matchingPairs.length &&
      q.matchingPairs.every((pair) =>
        answer.includes(`${pair.left}:${pair.right}`)
      )
    );
  }

  if (q.type === 'sorting') {
    if (!Array.isArray(answer) || !q.sortingItems) return false;
    return (
      answer.length === q.sortingItems.length &&
      answer.every((item, i) => item === q.sortingItems?.[i])
    );
  }

  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Convert a full step to a student-safe public step (strips answer keys, shuffles choices) */
export function toPublicStep(
  step: GuidedLearningStep
): GuidedLearningPublicStep {
  const base: GuidedLearningPublicStep = {
    id: step.id,
    xPct: step.xPct,
    yPct: step.yPct,
    imageIndex: step.imageIndex,
    label: step.label,
    interactionType: step.interactionType,
    hideStepNumber: step.hideStepNumber,
    hotspotAlwaysHidden: step.hotspotAlwaysHidden,
    showOverlay: step.showOverlay,
    tooltipPosition: step.tooltipPosition,
    tooltipOffset: step.tooltipOffset,
    text: step.text,
    audioUrl: step.audioUrl,
    videoUrl: step.videoUrl,
    panZoomScale: step.panZoomScale,
    spotlightRadius: step.spotlightRadius,
    bannerTone: step.bannerTone,
    autoAdvanceDuration: step.autoAdvanceDuration,
    region: step.region,
    calloutPin: step.calloutPin,
    calloutWidthPct: step.calloutWidthPct,
    calloutScale: step.calloutScale,
    calloutTone: step.calloutTone,
    calloutAlign: step.calloutAlign,
    calloutBox: step.calloutBox,
    cursor: step.cursor,
    // Playback fields only; `tour` is teacher-only and never mirrored.
    narration: step.narration
      ? {
          url: step.narration.url,
          durationMs: step.narration.durationMs,
          voice: step.narration.voice,
        }
      : undefined,
  };

  if (step.question) {
    const q = step.question;
    const type: GuidedLearningQuestionType = q.type;

    if (type === 'multiple-choice' && q.choices) {
      base.question = {
        type,
        text: q.text,
        choices: shuffleArray(q.choices),
      };
    } else if (type === 'matching' && q.matchingPairs) {
      const lefts = q.matchingPairs.map((p) => p.left);
      const rights = q.matchingPairs.map((p) => p.right);
      base.question = {
        type,
        text: q.text,
        matchingLeft: shuffleArray(lefts),
        matchingRight: shuffleArray(rights),
      };
    } else if (type === 'sorting' && q.sortingItems) {
      base.question = {
        type,
        text: q.text,
        sortingItems: shuffleArray(q.sortingItems),
      };
    }
  }

  return base;
}

/**
 * Drop duplicate step ids, keeping the first occurrence. Same Drive-sync/
 * arrayUnion race documented at the top of this file for `set.steps` — a
 * session-creation caller that derives both a step count and a step list
 * from the same raw array must dedupe once up front so the two can never
 * drift out of sync. Mirrors `dedupeQuestionsById` (`utils/quizMaxPoints.ts`,
 * `utils/videoActivityGrading.ts`).
 */
export function dedupeStepsById(
  steps: GuidedLearningStep[]
): GuidedLearningStep[] {
  const seen = new Set<string>();
  const out: GuidedLearningStep[] = [];
  for (const s of steps) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

// ─── Teacher-side hook ────────────────────────────────────────────────────────

export interface UseGuidedLearningSessionTeacherResult {
  responses: GuidedLearningResponse[];
  responsesLoading: boolean;
  /**
   * Create a new session and return its URL.
   *
   * Post-unification, `rosterIds` is the canonical input — callers derive
   * it from the shared `AssignClassPicker` selection. `classIds` and
   * `periodNames` are the denormalised outputs the caller computes via
   * `deriveSessionTargetsFromRosters(selectedRosters)`:
   *
   * - `classIds`: ClassLink `sourcedId`s drawn from the selected rosters'
   *   `classlinkClassId` metadata. Drives the student SSO gate
   *   (`passesStudentClassGate` in firestore.rules). `classIds[0]` is also
   *   mirrored onto the session's legacy `classId` field so pre-Phase-5A
   *   rules keep working.
   * - `periodNames`: roster names (de-duped) used for the student app's
   *   post-PIN period picker.
   * - `rosterIds`: written onto the session doc for reverse lookup and
   *   future migration to a single-source-of-truth roster-only model.
   *
   * All three are optional and independent for backwards compatibility
   * with callers that still target the legacy shapes directly.
   */
  createSession: (
    set: GuidedLearningSet,
    classIds?: string[],
    periodNames?: string[],
    rosterIds?: string[],
    /** Org-wide assignment mode frozen onto the session. Defaults to
     *  `'submissions'`. */
    assignmentMode?: AssignmentMode,
    /** Open/close/due window (epoch ms), spec §5 B3. Applies regardless of
     *  targeting mode — every field is optional and independently mirrored. */
    assignmentWindow?: { openAt?: number; closeAt?: number; dueAt?: number },
    options?: { workKind?: WorkKind; audience?: AssignmentAudience },
    /** Per-period gate; the steps and slides then move to `content/steps`. */
    periodGate?: Pick<GuidedLearningSession, 'accessMode' | 'periodAccess'>
  ) => Promise<string>;
  /** Load responses for a given session ID */
  subscribeToResponses: (sessionId: string) => () => void;
}

export const useGuidedLearningSessionTeacher = (
  teacherUid: string | undefined
): UseGuidedLearningSessionTeacherResult => {
  const [responses, setResponses] = useState<GuidedLearningResponse[]>([]);
  const [responsesLoading, setResponsesLoading] = useState(false);

  const createSession = useCallback(
    async (
      set: GuidedLearningSet,
      classIds: string[] = [],
      periodNames: string[] = [],
      rosterIds: string[] = [],
      assignmentMode: AssignmentMode = 'submissions',
      assignmentWindow?: { openAt?: number; closeAt?: number; dueAt?: number },
      options?: { workKind?: WorkKind; audience?: AssignmentAudience },
      periodGate?: Pick<GuidedLearningSession, 'accessMode' | 'periodAccess'>
    ): Promise<string> => {
      if (!teacherUid) throw new Error('Not authenticated');

      const sessionId = crypto.randomUUID();
      // Dedupe so a duplicated step id can't inflate the session's step count.
      const publicSteps = dedupeStepsById(set.steps).map(toPublicStep);
      // Mirror per-slide kinds and trims only when some slide needs them.
      const imageKinds = set.imageKinds?.some((k) => k === 'video')
        ? set.imageKinds.slice(0, set.imageUrls.length)
        : undefined;
      const videoTrims = set.videoTrims?.some(Boolean)
        ? set.videoTrims.slice(0, set.imageUrls.length)
        : undefined;
      const inContent = !!periodGate?.periodAccess;

      const session: GuidedLearningSession = {
        id: sessionId,
        title: set.title,
        mode: set.mode,
        imageUrls: inContent ? [] : set.imageUrls,
        // Mirror per-slide kinds so the student player renders video slides
        // in a <video> element. Omitted for image-only sets.
        ...(imageKinds && !inContent ? { imageKinds } : {}),
        // Mirror per-slide playback trims so video slides honor them in
        // the student player. Omitted when no slide is trimmed.
        ...(videoTrims && !inContent ? { videoTrims } : {}),
        publicSteps: inContent ? [] : publicSteps,
        ...(inContent
          ? {
              stepsInContent: true,
              accessMode: periodGate?.accessMode,
              periodAccess: periodGate?.periodAccess,
            }
          : {}),
        teacherUid,
        createdAt: Date.now(),
        // Phase 5A: multi-class ClassLink targeting + post-PIN period
        // picker support. `classIds` is authoritative; `classId` is
        // transitionally mirrored to `classIds[0]` so pre-Phase-5A
        // Firestore rules keep gating correctly.
        ...(classIds.length > 0 ? { classIds, classId: classIds[0] } : {}),
        ...(periodNames.length > 0 ? { periodNames } : {}),
        ...(rosterIds.length > 0 ? { rosterIds } : {}),
        // Frozen at creation. Stored under `assignmentMode` (not `mode`) so
        // it doesn't collide with the GL play-mode field above.
        assignmentMode,
        // Open/close/due window (spec §5 B3) — only mirrored when set so
        // legacy session docs stay free of new fields.
        ...(assignmentWindow?.openAt !== undefined
          ? { openAt: assignmentWindow.openAt }
          : {}),
        ...(assignmentWindow?.closeAt !== undefined
          ? { closeAt: assignmentWindow.closeAt }
          : {}),
        ...(assignmentWindow?.dueAt !== undefined
          ? { dueAt: assignmentWindow.dueAt }
          : {}),
        ...(options?.workKind ? { workKind: options.workKind } : {}),
        ...audienceSessionFields(options?.audience),
        // Schema version — mirrored so the student player applies matching
        // zoom/spotlight semantics. Absent on legacy sets/sessions.
        ...(set.schemaVersion ? { schemaVersion: set.schemaVersion } : {}),
        // Display settings — only mirror when set differs from default so
        // legacy session docs stay free of new fields.
        ...(set.hotspotPulse && set.hotspotPulse !== 'consistent'
          ? { hotspotPulse: set.hotspotPulse }
          : {}),
        ...(set.imageTransition && set.imageTransition !== 'none'
          ? { imageTransition: set.imageTransition }
          : {}),
        ...(set.welcomeEnabled &&
        (set.welcomeMessage?.trim() || set.welcomeImageUrl)
          ? {
              welcomeEnabled: true,
              ...(set.welcomeMessage?.trim()
                ? { welcomeMessage: set.welcomeMessage }
                : {}),
              ...(set.welcomeImageUrl
                ? {
                    welcomeImageUrl: set.welcomeImageUrl,
                    ...(set.welcomeImageAlt?.trim()
                      ? { welcomeImageAlt: set.welcomeImageAlt }
                      : {}),
                  }
                : {}),
            }
          : {}),
        ...(set.watchPace === 'calm' ? { watchPace: set.watchPace } : {}),
        playerV2: true,
      };

      const sessionRef = doc(db, GL_SESSIONS_COLLECTION, sessionId);
      const sessionPath = `${GL_SESSIONS_COLLECTION}/${sessionId}`;
      assertGuidedLearningDocFits(sessionPath, session);
      if (inContent) {
        const content: GuidedLearningSessionContent = {
          publicSteps,
          imageUrls: set.imageUrls,
          ...(imageKinds ? { imageKinds } : {}),
          ...(videoTrims ? { videoTrims } : {}),
        };
        assertGuidedLearningDocFits(
          `${sessionPath}/${GL_CONTENT_COLLECTION}/${GL_CONTENT_DOC}`,
          content
        );
        // One batch: the content rule checks the session's teacher via getAfter.
        await writeBatch(db)
          .set(sessionRef, session)
          .set(
            doc(
              db,
              GL_SESSIONS_COLLECTION,
              sessionId,
              GL_CONTENT_COLLECTION,
              GL_CONTENT_DOC
            ),
            content
          )
          .commit();
      } else {
        await setDoc(sessionRef, session);
      }

      return `${window.location.origin}/guided-learning/${sessionId}`;
    },
    [teacherUid]
  );

  const subscribeToResponses = useCallback(
    (sessionId: string): (() => void) => {
      setResponsesLoading(true);
      const q = query(
        collection(db, GL_SESSIONS_COLLECTION, sessionId, 'responses'),
        orderBy('startedAt', 'asc')
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => d.data() as GuidedLearningResponse);
          setResponses(list);
          setResponsesLoading(false);
        },
        (err) => {
          console.error('[useGuidedLearningSession] Responses error:', err);
          setResponsesLoading(false);
        }
      );
      return unsub;
    },
    []
  );

  return useSandboxedGuidedLearningSession({
    responses,
    responsesLoading,
    createSession,
    subscribeToResponses,
  });
};

// ─── Student-side hook ────────────────────────────────────────────────────────

export interface UseGuidedLearningSessionStudentResult {
  session: GuidedLearningSession | null;
  loading: boolean;
  error: string | null;
  /** Creates the response doc, or with `exists` updates only answers, pin and a set `completedAt`. */
  submitResponse: (
    response: GuidedLearningResponse,
    opts?: { exists?: boolean }
  ) => Promise<void>;
  /** The period the student's seat names on a per-period session (empty otherwise). */
  periodKeys: string[];
  /** True while a per-period session's steps are hidden or still loading. */
  contentPending: boolean;
  /** Seats the student in one of their periods; false when none is targeted. */
  takeSeat: (
    classPeriod: string | null,
    claimClassIds: readonly string[]
  ) => Promise<boolean>;
}

type RawStudentSession = GuidedLearningSession & { imageUrl?: string };

/** Legacy single-image fallback and step index clamping for the player. */
export function normalizeStudentSession(
  raw: RawStudentSession
): GuidedLearningSession {
  const imageUrls =
    raw.imageUrls && raw.imageUrls.length > 0
      ? raw.imageUrls
      : raw.imageUrl
        ? [raw.imageUrl]
        : [];
  return {
    ...raw,
    imageUrls,
    publicSteps: raw.publicSteps.map((step) => ({
      ...step,
      imageIndex:
        imageUrls.length === 0
          ? 0
          : Math.min(Math.max(step.imageIndex ?? 0, 0), imageUrls.length - 1),
      showOverlay: step.showOverlay ?? 'none',
    })),
  };
}

export const useGuidedLearningSessionStudent = (
  sessionId: string,
  uid?: string | null
): UseGuidedLearningSessionStudentResult => {
  const [rawSession, setRawSession] = useState<RawStudentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodKeys, setPeriodKeys] = useState<string[]>([]);

  useEffect(() => {
    // Realtime listener so a teacher publish/unpublish flips the
    // student-visible `scoreVisibility` + `revealedAnswers` in place
    // without the student needing to refresh. The session doc is
    // already small and world-readable, so a per-student listener is
    // cheap.
    const unsub = onSnapshot(
      doc(db, GL_SESSIONS_COLLECTION, sessionId),
      (snap) => {
        if (!snap.exists()) {
          setRawSession(null);
          setError('This guided learning session was not found.');
        } else {
          setRawSession(snap.data() as RawStudentSession);
          setError(null);
        }
        setLoading(false);
      },
      (err) => {
        // Firestore's onSnapshot retries internally on recoverable
        // failures, so a transient blip (WiFi drop, brief unavailable)
        // doesn't justify ejecting the student onto a permanent
        // ErrorScreen — especially if we already have data on hand.
        // Only surface a hard error before the first successful
        // snapshot; after that, swallow and let the listener self-heal.
        console.error('[useGuidedLearningSession] Snapshot error:', err);
        setRawSession((prev) => {
          if (prev === null) {
            setError('Failed to load the session. Please try again.');
          }
          return prev;
        });
        setLoading(false);
      }
    );
    return unsub;
  }, [sessionId]);

  // Per-period sessions keep their steps in content/steps, readable once the
  // student's period is open. A denied read retries whenever the gate fields
  // change, the student is seated, or a scheduled open arrives.
  const [content, setContent] = useState<GuidedLearningSessionContent | null>(
    null
  );
  const [contentRetry, setContentRetry] = useState(0);
  const inContent = rawSession?.stepsInContent === true;
  const gateSignature = inContent
    ? JSON.stringify([
        rawSession?.periodAccess ?? null,
        uid ? (rawSession?.studentAccess?.[uid] ?? null) : null,
      ])
    : '';
  useEffect(() => {
    if (!rawSession || !hasPeriodAccess(rawSession)) return;
    const nextOpen = nextScheduledOpen(rawSession, periodKeys, getServerNow());
    if (nextOpen == null) return;
    const id = setTimeout(
      () => setContentRetry((n) => n + 1),
      Math.max(0, nextOpen - getServerNow()) + 1000
    );
    return () => clearTimeout(id);
  }, [rawSession, periodKeys]);
  useEffect(() => {
    if (!inContent || !sessionId) return;
    return onSnapshot(
      doc(
        db,
        GL_SESSIONS_COLLECTION,
        sessionId,
        GL_CONTENT_COLLECTION,
        GL_CONTENT_DOC
      ),
      (snap) => {
        if (snap.exists())
          setContent(snap.data() as GuidedLearningSessionContent);
      },
      (err) => {
        if ((err as { code?: string }).code !== 'permission-denied') {
          console.error('[useGuidedLearningSession] Content error:', err);
        }
      }
    );
    // gateSignature and contentRetry re-run a denied read.
  }, [inContent, sessionId, gateSignature, contentRetry]);

  const session = useMemo(
    () =>
      rawSession
        ? normalizeStudentSession(
            mergeGuidedLearningSessionContent(rawSession, content)
          )
        : null,
    [rawSession, content]
  );

  const takeSeat = useCallback(
    async (
      classPeriod: string | null,
      claimClassIds: readonly string[]
    ): Promise<boolean> => {
      if (!rawSession || !hasPeriodAccess(rawSession) || !uid) return true;
      if (studentPreviewBlocksWrite()) return true;
      const keys = studentPeriodKeys(rawSession, claimClassIds, classPeriod);
      const key = pickPeriodKey(rawSession, keys, getServerNow());
      if (!key) return false;
      await setDoc(doc(db, GL_SESSIONS_COLLECTION, sessionId, 'seats', uid), {
        classId: key,
      });
      // The rules gate on the seat's one period, so the client does too.
      setPeriodKeys([key]);
      setContentRetry((n) => n + 1);
      return true;
    },
    [rawSession, sessionId, uid]
  );

  const submitResponse = useCallback(
    async (
      response: GuidedLearningResponse,
      opts?: { exists?: boolean }
    ): Promise<void> => {
      if (studentPreviewBlocksWrite()) return;
      const ref = doc(
        db,
        GL_SESSIONS_COLLECTION,
        sessionId,
        'responses',
        response.studentAnonymousId
      );
      if (!opts?.exists) {
        // The create rule requires completedAt null; a turn-in follows as an update.
        await setDoc(ref, { ...response, completedAt: null });
        if (response.completedAt === null) return;
      }
      // The student update rule allows only answers, completedAt and pin to change.
      await setDoc(
        ref,
        {
          answers: response.answers,
          ...(response.pin ? { pin: response.pin } : {}),
          ...(response.completedAt !== null
            ? { completedAt: response.completedAt }
            : {}),
        },
        { merge: true }
      );
    },
    [sessionId]
  );

  return {
    session,
    loading,
    error,
    submitResponse,
    periodKeys,
    contentPending: inContent && !content,
    takeSeat,
  };
};
