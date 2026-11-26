import { useCallback, useState } from 'react';
import type { PeriodAccessSessionFields } from '@/types';
import { useServerNow } from '@/hooks/useServerNow';
import { hasPeriodAccess, studentCanEnter } from '@/utils/periodAccess';

interface PeriodGateOptions {
  session: PeriodAccessSessionFields | null | undefined;
  /** The student's seated class keys. */
  periodKeys: readonly string[];
  uid: string | null | undefined;
  /** False turns the gate off (an ended session, a view-only link). */
  active?: boolean;
  /** The app is ready to show its activity once the class is open (joined, content loaded). */
  readyToEnter?: boolean;
  /** The student's own Opens and Closes, when the app enforces them. */
  ownWindow?: { enforced: boolean; open: boolean };
}

export interface PeriodGate {
  /** The session gates by class, and the gate is on. */
  perPeriod: boolean;
  /** Gated by class or by the student's own window. */
  gated: boolean;
  /** Server time, ticking every 5 seconds while the gate is on. */
  now: number;
  canEnter: boolean;
  /** The class isn't open, or the server refused a write as frozen. */
  paused: boolean;
  /** The activity has shown once; a later close pauses it in place. */
  entered: boolean;
  /** Hold the activity: paused, or not shown yet. */
  hold: boolean;
  /** Holds the pause after a write the server refused, until the gate fields change. */
  freeze: () => void;
}

/** The one per-class gate every student app uses. */
export function usePeriodGate({
  session,
  periodKeys,
  uid,
  active = true,
  readyToEnter = true,
  ownWindow,
}: PeriodGateOptions): PeriodGate {
  const perPeriod = active && hasPeriodAccess(session);
  const windowGated = active && !!ownWindow?.enforced;
  const gated = perPeriod || windowGated;
  const now = useServerNow(perPeriod ? 5000 : null);
  const canEnter =
    studentCanEnter(session, periodKeys, uid, now) &&
    (!windowGated || !!ownWindow?.open);
  const gateKey = perPeriod
    ? JSON.stringify([
        periodKeys.map((k) => session?.periodAccess?.[k] ?? null),
        uid ? (session?.studentAccess?.[uid] ?? null) : null,
      ])
    : '';
  const [frozenGate, setFrozenGate] = useState<string | null>(null);
  if (frozenGate !== null && frozenGate !== gateKey) setFrozenGate(null);
  const paused = (perPeriod && frozenGate === gateKey) || (gated && !canEnter);
  const [entered, setEntered] = useState(false);
  if (!entered && gated && canEnter && readyToEnter) setEntered(true);
  const freeze = useCallback(() => setFrozenGate(gateKey), [gateKey]);
  return {
    perPeriod,
    gated,
    now,
    canEnter,
    paused,
    entered,
    hold: gated && (paused || !entered),
    freeze,
  };
}
