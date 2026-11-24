import { deleteField, doc, FieldPath, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { HeldPass, PassHold } from '@/types';

/** The hold after one student's time changes; with no pass left its until is now, so the sweep ends the run. */
export function nextHold(
  hold: PassHold | null | undefined,
  uid: string,
  pass: HeldPass | null,
  nowMs: number
): PassHold {
  const students = { ...(hold?.students ?? {}) };
  if (pass) students[uid] = pass;
  else delete students[uid];
  const untils = Object.values(students).map((p) => p.until);
  return { until: untils.length > 0 ? Math.max(...untils) : nowMs, students };
}

/** Changes or removes one held student's scheduled time on the quiz session, and the hold on both docs. */
export async function setHeldStudentTime(
  teacherUid: string,
  assignmentId: string,
  hold: PassHold | null | undefined,
  uid: string,
  time: { from: number; until: number } | null
): Promise<void> {
  const session = doc(db, 'quiz_sessions', assignmentId);
  const assignment = doc(
    db,
    'users',
    teacherUid,
    'quiz_assignments',
    assignmentId
  );
  const next = nextHold(hold, uid, time, Date.now());
  const batch = writeBatch(db);
  batch.update(
    session,
    new FieldPath('studentAccess', uid),
    time ? time.until : deleteField(),
    new FieldPath('studentAccessFrom', uid),
    time ? time.from : deleteField(),
    new FieldPath('passHold'),
    next
  );
  batch.update(assignment, { passHold: next });
  await batch.commit();
}
