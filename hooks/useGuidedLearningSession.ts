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

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  AssignmentMode,
  GuidedLearningSet,
  GuidedLearningSession,
  GuidedLearningResponse,
  GuidedLearningPublicStep,
  GuidedLearningStep,
  GuidedLearningQuestionType,
} from '../types';

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
    return q.matchingPairs.every((pair) =>
      answer.includes(`${pair.left}:${pair.right}`)
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
    assignmentMode?: AssignmentMode
  ) => Promise<string>;
  /** Load responses for a given session ID */
  subscribeToResponses: (sessionId: string) => () => void;
  /** Export responses as a CSV blob string */
  exportResponsesAsCSV: (
    responses: GuidedLearningResponse[],
    set: GuidedLearningSet
  ) => string;
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
      assignmentMode: AssignmentMode = 'submissions'
    ): Promise<string> => {
      if (!teacherUid) throw new Error('Not authenticated');

      const sessionId = crypto.randomUUID();
      const publicSteps = set.steps.map(toPublicStep);

      const session: GuidedLearningSession = {
        id: sessionId,
        title: set.title,
        mode: set.mode,
        imageUrls: set.imageUrls,
        publicSteps,
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
      };

      await setDoc(doc(db, GL_SESSIONS_COLLECTION, sessionId), session);

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

  const exportResponsesAsCSV = useCallback(
    (
      responseList: GuidedLearningResponse[],
      set: GuidedLearningSet
    ): string => {
      const questionSteps = set.steps.filter(
        (s) => s.interactionType === 'question' && s.question
      );

      const headers = [
        'Student ID',
        'PIN',
        'Started At',
        'Completed At',
        'Score (%)',
        ...questionSteps.map((s, i) => `Q${i + 1}: ${s.question?.text ?? ''}`),
        ...questionSteps.map((s, i) => `Q${i + 1} Correct`),
      ];

      const rows = responseList.map((r) => {
        const questionAnswers = questionSteps.map((s) => {
          const ans = r.answers.find((a) => a.stepId === s.id);
          return ans ? String(ans.answer) : '';
        });
        const questionCorrect = questionSteps.map((s) => {
          const ans = r.answers.find((a) => a.stepId === s.id);
          if (!ans) return '';
          return isAnswerCorrect(s, ans.answer) ? 'Yes' : 'No';
        });

        return [
          r.studentAnonymousId,
          r.pin ?? '',
          r.startedAt ? new Date(r.startedAt).toISOString() : '',
          r.completedAt ? new Date(r.completedAt).toISOString() : '',
          r.score !== null ? String(r.score) : '',
          ...questionAnswers,
          ...questionCorrect,
        ];
      });

      const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

      return [headers, ...rows]
        .map((row) => row.map(escape).join(','))
        .join('\n');
    },
    []
  );

  return {
    responses,
    responsesLoading,
    createSession,
    subscribeToResponses,
    exportResponsesAsCSV,
  };
};

// ─── Student-side hook ────────────────────────────────────────────────────────

export interface UseGuidedLearningSessionStudentResult {
  session: GuidedLearningSession | null;
  loading: boolean;
  error: string | null;
  submitResponse: (response: GuidedLearningResponse) => Promise<void>;
}

export const useGuidedLearningSessionStudent = (
  sessionId: string
): UseGuidedLearningSessionStudentResult => {
  const [session, setSession] = useState<GuidedLearningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, GL_SESSIONS_COLLECTION, sessionId));
        if (!snap.exists()) {
          setError('This guided learning session was not found.');
        } else {
          const raw = snap.data() as GuidedLearningSession & {
            imageUrl?: string;
          };
          const imageUrls =
            raw.imageUrls && raw.imageUrls.length > 0
              ? raw.imageUrls
              : raw.imageUrl
                ? [raw.imageUrl]
                : [];
          setSession({
            ...raw,
            imageUrls,
            publicSteps: raw.publicSteps.map((step) => ({
              ...step,
              imageIndex:
                imageUrls.length === 0
                  ? 0
                  : Math.min(
                      Math.max(step.imageIndex ?? 0, 0),
                      imageUrls.length - 1
                    ),
              showOverlay: step.showOverlay ?? 'none',
            })),
          });
        }
      } catch (err) {
        console.error('[useGuidedLearningSession] Load error:', err);
        setError('Failed to load the session. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [sessionId]);

  const submitResponse = useCallback(
    async (response: GuidedLearningResponse): Promise<void> => {
      await setDoc(
        doc(
          db,
          GL_SESSIONS_COLLECTION,
          sessionId,
          'responses',
          response.studentAnonymousId
        ),
        response
      );
    },
    [sessionId]
  );

  return { session, loading, error, submitResponse };
};
