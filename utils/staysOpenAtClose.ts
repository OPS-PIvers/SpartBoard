// Who a class Close or a run End leaves open; mirrored by functions/src/staysOpenAtClose.ts and checked against staysOpenAtClose.cases.json.
import type { PeriodAccessSessionFields } from '@/types';
import { isLetIn, studentSetTime } from '@/utils/periodAccess';

export interface StaysOpenResponse {
  studentUid?: string | null;
  unlocked?: boolean | null;
}

/** Let in, reopened for, unlocked, scheduled for later, or nothing to turn in: left open by a class Close. */
export function staysOpenAtClose(
  session: Pick<
    PeriodAccessSessionFields,
    'studentAccess' | 'studentAccessFrom' | 'reopenedFor'
  >,
  response: StaysOpenResponse,
  now: number,
  opts: { blank: boolean }
): boolean {
  if (opts.blank || response.unlocked === true) return true;
  const uid = response.studentUid ?? '';
  if (!uid) return false;
  if ((session.reopenedFor ?? []).includes(uid)) return true;
  if (isLetIn(session, uid, now)) return true;
  // A student scheduled for later keeps their attempt for that time.
  return (studentSetTime(session, uid)?.until ?? 0) > now;
}
