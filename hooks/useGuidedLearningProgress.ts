// Writes a viewer's step analytics to guided_learning_sessions/{id}/progress/{uid} (GL Studio plan P2-5).
import { useCallback, useEffect, useRef } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StepEvent } from '@/components/widgets/GuidedLearning/types/stage';
import {
  applyStepEvent,
  emptyProgress,
  parseProgressDoc,
  type GuidedLearningProgress,
} from '@/components/widgets/GuidedLearning/utils/progress';
import { logError } from '@/utils/logError';

/** At most one write per this interval, plus a flush when the page hides. */
export const PROGRESS_WRITE_INTERVAL_MS = 10_000;

interface Options {
  sessionId: string | null | undefined;
  uid: string | null | undefined;
  /** Student app with a `playerV2` session only; teacher previews, Help and the Studio pass false. */
  enabled: boolean;
  /** Step ids in set order, for the furthest-step index. */
  stepIds: readonly string[];
  /** Holds writes (the rules would refuse them) while the student's period is shut. */
  paused?: boolean;
}

// Legacy mode fields stay on old docs but are never written.
function toPayload(p: GuidedLearningProgress) {
  const { mode: _mode, modeSwitches: _switches, ...rest } = p;
  return rest;
}

export function useGuidedLearningProgress({
  sessionId,
  uid,
  enabled,
  stepIds,
  paused = false,
}: Options): { onStepEvent: (e: StepEvent) => void } {
  const stepIdsRef = useRef(stepIds);
  // eslint-disable-next-line react-hooks/refs -- render-body ref sync so the load effect doesn't re-run on new step ids (CLAUDE.md pattern)
  stepIdsRef.current = stepIds;
  const pausedRef = useRef(paused);
  // eslint-disable-next-line react-hooks/refs -- render-body ref sync, as above
  pausedRef.current = paused;
  const stateRef = useRef<GuidedLearningProgress>(emptyProgress());
  const pendingRef = useRef<StepEvent[]>([]);
  const loadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const existsRef = useRef(false);
  const lastWriteRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRef = useRef<() => void>(() => undefined);
  const active = enabled && Boolean(sessionId) && Boolean(uid);

  const apply = useCallback((e: StepEvent) => {
    const ids = stepIdsRef.current;
    stateRef.current = applyStepEvent(
      stateRef.current,
      e,
      ids.indexOf(e.stepId),
      ids.length - 1
    );
    dirtyRef.current = true;
  }, []);

  useEffect(() => {
    if (!active || !sessionId || !uid) return;
    const ref = doc(db, 'guided_learning_sessions', sessionId, 'progress', uid);
    let cancelled = false;
    // Set when the load failed: the doc may exist, so writes omit startedAt until one is rejected.
    let assumedExists = false;
    stateRef.current = emptyProgress();
    pendingRef.current = [];
    loadedRef.current = false;
    dirtyRef.current = false;
    existsRef.current = false;
    lastWriteRef.current = 0;

    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!loadedRef.current || !dirtyRef.current || pausedRef.current) return;
      dirtyRef.current = false;
      lastWriteRef.current = Date.now();
      const creating = !existsRef.current;
      const guessed = assumedExists;
      existsRef.current = true;
      void setDoc(
        ref,
        {
          ...toPayload(stateRef.current),
          updatedAt: serverTimestamp(),
          ...(creating ? { startedAt: serverTimestamp() } : {}),
        },
        { merge: true }
      ).then(
        () => {
          if (guessed) assumedExists = false;
        },
        (err: unknown) => {
          if (creating || guessed) existsRef.current = false;
          assumedExists = false;
          logError('useGuidedLearningProgress.write', err, { sessionId });
        }
      );
    };
    const schedule = () => {
      if (
        timerRef.current ||
        !loadedRef.current ||
        !dirtyRef.current ||
        pausedRef.current
      )
        return;
      const wait = Math.max(
        0,
        lastWriteRef.current + PROGRESS_WRITE_INTERVAL_MS - Date.now()
      );
      timerRef.current = setTimeout(flush, wait);
    };
    scheduleRef.current = schedule;

    const onLoaded = (
      stored: GuidedLearningProgress | null,
      loadFailed = false
    ) => {
      if (cancelled) return;
      if (stored) {
        existsRef.current = true;
        stateRef.current = stored;
      } else if (loadFailed) {
        existsRef.current = true;
        assumedExists = true;
      }
      loadedRef.current = true;
      for (const e of pendingRef.current) apply(e);
      pendingRef.current = [];
      schedule();
    };
    getDoc(ref).then(
      (snap) => onLoaded(snap.exists() ? parseProgressDoc(snap.data()) : null),
      () => onLoaded(null, true)
    );

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
      cancelled = true;
      scheduleRef.current = () => undefined;
    };
  }, [active, sessionId, uid, apply]);

  // Held writes go out once the period reopens.
  useEffect(() => {
    if (!paused) scheduleRef.current();
  }, [paused]);

  const onStepEvent = useCallback(
    (e: StepEvent) => {
      if (!active) return;
      if (!loadedRef.current) {
        pendingRef.current.push(e);
        return;
      }
      apply(e);
      scheduleRef.current();
    },
    [active, apply]
  );

  return { onStepEvent };
}
