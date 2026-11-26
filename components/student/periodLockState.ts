import type { PeriodAccessSessionFields } from '@/types';
import { effectivePeriodState, nextScheduledOpen } from '@/utils/periodAccess';
import {
  laterOpen,
  type AssignmentWindowState,
  type WindowFields,
} from '@/utils/assignmentWindow';

export interface PeriodLockState {
  /** Epoch ms of the next scheduled open, when one is set. */
  opensAt: number | null;
  paused: boolean;
  /** The student's own Opens time holds them, not the class. */
  ownOpen?: boolean;
  /** The student's own Closes time passed, so nothing reopens. */
  closed?: boolean;
}

/** Why the student can't enter: a scheduled open, a pause, a closed class or their own window. */
export function periodLockState(
  session: PeriodAccessSessionFields,
  periodKeys: readonly string[],
  now: number,
  uid?: string | null,
  ownWindow?: { window: WindowFields; state: AssignmentWindowState } | null
): PeriodLockState {
  const ownOpensAt = ownWindow?.window.openAt;
  const opensAt = laterOpen(
    nextScheduledOpen(session, periodKeys, now, uid),
    ownOpensAt !== undefined && ownOpensAt > now ? ownOpensAt : null
  );
  const paused =
    opensAt == null &&
    periodKeys.some((k) => {
      const access = session.periodAccess?.[k];
      return !!access && effectivePeriodState(access, now) === 'paused';
    });
  return {
    opensAt,
    paused,
    ownOpen: ownWindow?.state === 'upcoming',
    closed: ownWindow?.state === 'closed',
  };
}
