import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import type { QuizLiveState } from '@/types';
import { isTrustedEvent } from '@/utils/eventTrust';
import { getServerNow } from '@/utils/serverTime';

/** While watched, activity reaches the teacher at most this often. */
export const LIVE_ACTIVITY_REPORT_MS = 5_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'wheel'] as const;

export interface UseLiveViewReportArgs {
  /** Server-clock ms the teacher's Live view stamp runs to; 0 when nobody watches. */
  until: number;
  questionId: string | undefined;
  /** The red tab warning is on screen. */
  warning: boolean;
  report: ((state: QuizLiveState) => Promise<void>) | undefined;
}

/** Reports the question on screen, the last real input and the tab warning while the teacher's Live view is open (QUIZ_LIVE_VIEW.md D12). */
export function useLiveViewReport({
  until,
  questionId,
  warning,
  report,
}: UseLiveViewReportArgs): void {
  const arrivalRef = useRef<{ id: string; at: number } | null>(null);
  const activeAtRef = useRef<number | null>(null);
  const lastSentRef = useRef(Number.NEGATIVE_INFINITY);
  const trailingRef = useRef<number | null>(null);

  // Arrival time stays fixed across renewals so "time on this question" doesn't reset.
  useLayoutEffect(() => {
    if (questionId && arrivalRef.current?.id !== questionId)
      arrivalRef.current = { id: questionId, at: getServerNow() };
  }, [questionId]);

  const send = useEffectEvent(() => {
    if (trailingRef.current != null) {
      window.clearTimeout(trailingRef.current);
      trailingRef.current = null;
    }
    if (!report || !questionId || until <= getServerNow()) return;
    lastSentRef.current = performance.now();
    const activeAt = activeAtRef.current;
    report({
      questionId,
      at: arrivalRef.current?.at ?? getServerNow(),
      warning,
      ...(activeAt != null ? { activeAt } : {}),
    }).catch((err: unknown) =>
      console.error('[ActiveQuiz] live position report failed:', err)
    );
  });

  // Each renewal re-reports, so a reopened panel never starts from a stale place.
  useEffect(() => {
    if (until > 0 && questionId) send();
  }, [until, questionId, warning]);

  const onActivity = useEffectEvent(() => {
    activeAtRef.current = getServerNow();
    if (!report || until <= activeAtRef.current) return;
    const wait =
      lastSentRef.current + LIVE_ACTIVITY_REPORT_MS - performance.now();
    if (wait <= 0) send();
    else trailingRef.current ??= window.setTimeout(send, wait);
  });

  const listening = !!report;
  useEffect(() => {
    if (!listening) return;
    const onEvent = (e: Event) => {
      if (isTrustedEvent(e)) onActivity();
    };
    const opts = { capture: true, passive: true } as const;
    for (const type of ACTIVITY_EVENTS)
      document.addEventListener(type, onEvent, opts);
    return () => {
      for (const type of ACTIVITY_EVENTS)
        document.removeEventListener(type, onEvent, opts);
      if (trailingRef.current != null) {
        window.clearTimeout(trailingRef.current);
        trailingRef.current = null;
      }
    };
  }, [listening]);
}
