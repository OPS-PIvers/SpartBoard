import { FieldPath, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizResponse, QuizSession } from '@/types';
import {
  isWaitingAtStop,
  openedPartFor,
  periodOfResponse,
  totalParts,
} from '@/utils/quizParts';

/** Who a part opens for: the whole session, one class period, or one student. */
export type OpenPartScope =
  | { kind: 'all' }
  | { kind: 'period'; name: string }
  | { kind: 'student'; responseKey: string };

/** Opens `part` past a Stop; the student's Stop screen then offers to start it. */
export async function openQuizPart(
  sessionId: string,
  scope: OpenPartScope,
  part: number
): Promise<void> {
  const ref = doc(db, 'quiz_sessions', sessionId);
  const path =
    scope.kind === 'all'
      ? new FieldPath('partsOpen', 'all')
      : scope.kind === 'period'
        ? new FieldPath('partsOpen', 'periods', scope.name)
        : new FieldPath('partsOpen', 'students', scope.responseKey);
  await updateDoc(ref, path, part);
}

const responseKeyOf = (r: QuizResponse): string =>
  r._responseKey ?? r.studentUid;

/** True while this response waits at a Stop the teacher hasn't opened past. */
export function isResponseWaiting(
  session: QuizSession,
  r: QuizResponse
): boolean {
  return isWaitingAtStop(
    r,
    openedPartFor(
      session.partsOpen,
      periodOfResponse(session, r),
      responseKeyOf(r)
    ),
    totalParts(session.sections)
  );
}
