import type { QuizResponse, QuizSession } from '@/types';
import type { ReopenStudentOption } from '../ReopenStudentsDialog';
import type { NotJoinedStudent } from './rosterNotJoined';

export interface ReopenPick extends ReopenStudentOption {
  uid: string;
  /** A turned-in attempt to reopen; absent for students who never turned in. */
  responseKey?: string;
}

/** Everyone the quiz went to who can be reopened, by signed-in uid; PIN joiners and unlinked roster rows can't hold a pass. */
export function buildReopenOptions(
  names: readonly { key: string; name: string; response: QuizResponse }[],
  notJoined: readonly NotJoinedStudent[],
  session: Pick<QuizSession, 'classPeriodByClassId'>
): ReopenPick[] {
  const out: ReopenPick[] = [];
  const seen = new Set<string>();
  for (const { key, name, response: r } of names) {
    if (!r.studentUid || key !== r.studentUid || seen.has(r.studentUid))
      continue;
    seen.add(r.studentUid);
    const done = r.status === 'completed';
    out.push({
      key,
      uid: r.studentUid,
      name,
      className:
        r.classPeriod ??
        (r.classId ? (session.classPeriodByClassId?.[r.classId] ?? '') : ''),
      status: done
        ? 'turned-in'
        : r.status === 'in-progress'
          ? 'in-progress'
          : 'not-started',
      ...(done ? { responseKey: key } : {}),
    });
  }
  for (const s of notJoined) {
    if (!s.studentUid || seen.has(s.studentUid)) continue;
    seen.add(s.studentUid);
    out.push({
      key: `roster:${s.key}`,
      uid: s.studentUid,
      name: s.name,
      className: s.period,
      status: s.absent ? 'absent' : 'not-started',
    });
  }
  return out;
}
