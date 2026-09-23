/**
 * Starts an activity in the teacher's account on a substitute's behalf, by
 * calling `launchSubAssignmentV1` (plan §3.6, D7).
 *
 * The substitute sends which shared item, on which shared board, for which of
 * the share's rosters, plus how the run should behave. Everything students
 * see, the class ids and the join code are built server-side from the bundled
 * answer key and the teacher's own records, so nothing a caller gets wrong
 * here can reach a student.
 */

import { useCallback, useContext, useRef, useState } from 'react';
import { httpsCallable, type FunctionsError } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { logError } from '@/utils/logError';
import { subLaunchRunSettings } from '@/utils/subLaunchRunSettings';
import type { SubShareContentKind } from '@/types';

export interface SubLaunchRequest {
  shareId: string;
  boardId: string;
  widgetId: string;
  kind: SubShareContentKind;
  itemId: string;
  rosterIds: string[];
  /** How the run behaves; the callable refuses anything outside its allowlist. */
  session: Record<string, unknown>;
  assignment: Record<string, unknown>;
}

export interface SubLaunchResult {
  sessionId: string;
  code: string;
}

export type SubLaunchStatus = 'idle' | 'launching' | 'launched' | 'error';

export interface SubLaunchState {
  status: SubLaunchStatus;
  /** Present once `status` is `'launched'`; the join code to read to the class. */
  result: SubLaunchResult | null;
  /** A sentence to show the substitute; never a code or an id. */
  error: string | null;
  launch: (rosterIds: string[]) => Promise<void>;
  reset: () => void;
}

/** What a substitute is told when the callable refuses, by refusal reason. */
function messageFor(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  if (code === 'functions/permission-denied') {
    // The callable's own message is written for this reader — it distinguishes
    // an expired share from one that does not name them from a switched-off
    // feature, and a generic line would lose all three.
    const message = (err as FunctionsError).message;
    return message || 'You cannot start this activity.';
  }
  if (code === 'functions/invalid-argument') {
    return 'Something about this activity stopped it from starting. Your teacher can start it themselves.';
  }
  return 'Could not start the activity. Try again in a moment.';
}

export function useSubLaunch(
  kind: SubShareContentKind,
  widgetId: string,
  itemId: string | null | undefined
): SubLaunchState {
  const share = useContext(SubShareContentContext);
  const [status, setStatus] = useState<SubLaunchStatus>('idle');
  const [result, setResult] = useState<SubLaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `status` is a render behind a second press, and two calls would mint two
  // live sessions with two codes in the teacher's account.
  const inFlight = useRef(false);

  const boardId = share?.boardId ?? null;
  const shareId = share?.shareId ?? null;
  const rosters = share?.rosters;

  const launch = useCallback(
    async (rosterIds: string[]) => {
      if (!shareId || !boardId || !itemId || rosterIds.length === 0) return;
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus('launching');
      setError(null);
      try {
        // The teacher's own label for the class, so their Results name it the
        // way the rest of their assignments do.
        const className = rosterIds
          .map((id) => rosters?.find((r) => r.id === id)?.name)
          .filter((name): name is string => !!name)
          .join(', ');
        const { session, assignment } = subLaunchRunSettings(
          className,
          Date.now()
        );
        const callable = httpsCallable<SubLaunchRequest, SubLaunchResult>(
          functions,
          'launchSubAssignmentV1'
        );
        const res = await callable({
          shareId,
          boardId,
          widgetId,
          kind,
          itemId,
          rosterIds,
          session,
          assignment,
        });
        setResult(res.data);
        setStatus('launched');
      } catch (err: unknown) {
        // A refusal is an expected outcome, not a fault to report as one: an
        // expired share and a flipped kill switch both land here.
        if (
          (err as FunctionsError | undefined)?.code !==
          'functions/permission-denied'
        ) {
          logError('useSubLaunch.launch', err, { shareId, boardId, kind });
        }
        setError(messageFor(err));
        setStatus('error');
      } finally {
        inFlight.current = false;
      }
    },
    [shareId, boardId, widgetId, kind, itemId, rosters]
  );

  const reset = useCallback(() => {
    inFlight.current = false;
    setStatus('idle');
    setResult(null);
    setError(null);
  }, []);

  return { status, result, error, launch, reset };
}
