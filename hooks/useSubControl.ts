/**
 * Pauses, resumes or ends a run a substitute started, by calling
 * `controlSubAssignmentV1` (plan §3.6).
 *
 * The substitute names only the run and what to do with it. Everything that
 * decides whether they may — the teacher on the run, the share it came from,
 * and whether their monitor window is still open — is read server-side off the
 * session the launch stamped.
 */

import { useCallback, useContext, useRef, useState } from 'react';
import { httpsCallable, type FunctionsError } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { logError } from '@/utils/logError';
import type { SubShareContentKind } from '@/types';

export type SubRunAction = 'pause' | 'resume' | 'end';
export type SubRunState = 'active' | 'paused' | 'ended';

export interface SubControlRequest {
  shareId: string;
  sessionId: string;
  kind: SubShareContentKind;
  action: SubRunAction;
}

export interface SubControlResult {
  state: SubRunState;
}

export interface SubControlState {
  /** What the run is now, as far as this panel knows. */
  state: SubRunState;
  /** True while a call is in flight, so the controls can say so. */
  busy: boolean;
  error: string | null;
  control: (action: SubRunAction) => Promise<void>;
}

function messageFor(err: unknown): string {
  const code = (err as FunctionsError | undefined)?.code;
  if (code === 'functions/permission-denied') {
    // The callable's own words tell an expired share apart from a run that is
    // not theirs; a generic line would lose the difference.
    return (
      (err as FunctionsError).message || 'You cannot change this run any more.'
    );
  }
  return 'Could not change the run. Try again in a moment.';
}

export function useSubControl(
  kind: SubShareContentKind,
  sessionId: string | null | undefined
): SubControlState {
  const share = useContext(SubShareContentContext);
  const shareId = share?.shareId ?? null;
  const [state, setState] = useState<SubRunState>('active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `busy` is a render behind a second press, and ending twice would finalize
  // a student's responses twice.
  const inFlight = useRef(false);

  const control = useCallback(
    async (action: SubRunAction) => {
      if (!shareId || !sessionId) return;
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const callable = httpsCallable<SubControlRequest, SubControlResult>(
          functions,
          'controlSubAssignmentV1'
        );
        const res = await callable({ shareId, sessionId, kind, action });
        setState(res.data.state);
      } catch (err: unknown) {
        if (
          (err as FunctionsError | undefined)?.code !==
          'functions/permission-denied'
        ) {
          logError('useSubControl.control', err, { shareId, kind, action });
        }
        setError(messageFor(err));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [shareId, sessionId, kind]
  );

  return { state, busy, error, control };
}
