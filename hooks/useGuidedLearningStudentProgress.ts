// Per-student progress for a Guided Learning session: the teacher-side read of progress/{uid} (docs/plans/STUDENT_LANDING_V2.md D24).
import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  GL_CONTENT_COLLECTION,
  GL_CONTENT_DOC,
} from '@/utils/guidedLearningSessionContent';
import {
  summarizeStudentProgress,
  type StudentProgressSummary,
} from '@/components/widgets/GuidedLearning/utils/progress';
import { logError } from '@/utils/logError';

type ProgressByUid = ReadonlyMap<string, StudentProgressSummary>;

/** Live progress docs keyed by student uid; null until the first snapshot or when it fails. */
export function useGuidedLearningStudentProgress(
  sessionId: string | null | undefined,
  enabled: boolean
): ProgressByUid | null {
  const key = enabled && sessionId ? sessionId : null;
  const [state, setState] = useState<{
    key: string;
    value: ProgressByUid;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      collection(db, 'guided_learning_sessions', key, 'progress'),
      (snap) =>
        setState({
          key,
          value: new Map(
            snap.docs.map((d) => [d.id, summarizeStudentProgress(d.data())])
          ),
        }),
      (err) =>
        logError('useGuidedLearningStudentProgress.subscribe', err, {
          sessionId: key,
        })
    );
  }, [key]);

  return key && state?.key === key ? state.value : null;
}

export interface GuidedLearningSessionShape {
  playerV2: boolean;
  stepCount: number | null;
}

/** One read of the session doc for the Assignments hub, which has no set loaded. */
export function useGuidedLearningSessionShape(
  sessionId: string | null | undefined,
  enabled: boolean
): GuidedLearningSessionShape | null {
  const key = enabled && sessionId ? sessionId : null;
  const [state, setState] = useState<{
    key: string;
    value: GuidedLearningSessionShape;
  } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      try {
        const ref = doc(db, 'guided_learning_sessions', key);
        const data = (await getDoc(ref)).data() as
          | {
              playerV2?: boolean;
              publicSteps?: unknown[];
              stepsInContent?: boolean;
            }
          | undefined;
        let steps = data?.publicSteps;
        if (data?.stepsInContent) {
          const content = await getDoc(
            doc(ref, GL_CONTENT_COLLECTION, GL_CONTENT_DOC)
          ).catch(() => null);
          steps = (content?.data() as { publicSteps?: unknown[] } | undefined)
            ?.publicSteps;
        }
        if (cancelled) return;
        setState({
          key,
          value: {
            playerV2: data?.playerV2 === true,
            stepCount: Array.isArray(steps) ? steps.length : null,
          },
        });
      } catch (err) {
        logError('useGuidedLearningSessionShape.read', err, { sessionId: key });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return key && state?.key === key ? state.value : null;
}
