// Roster rows behind monitor students, so a row can print that student's paper copy.
import type { ClassRoster, QuizResponse, QuizSession, Student } from '@/types';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';
import type { NotJoinedStudent } from './rosterNotJoined';

export interface PrintSeat {
  rosterId: string;
  studentId: string;
  /** Targeting key for the student's overrides; null for a PIN-only roster row. */
  refKey: string | null;
  studentUid: string | null;
  name: string;
}

const pinKey = (pin: string): string => pin.trim().replace(/^0+(?=\d)/, '');

const refKeyOf = (student: Student, roster: ClassRoster): string | null => {
  const ref = resolveStudentTargetRef(student, roster);
  return ref ? studentTargetRefKey(ref) : null;
};

/** Monitor row key -> the roster row its paper copy prints for; rows with no roster match are left out. */
export function buildPrintSeats(params: {
  session: Pick<QuizSession, 'rosterIds'>;
  rosters: readonly ClassRoster[];
  joined: readonly {
    key: string;
    name: string;
    response: Pick<QuizResponse, 'studentUid' | 'pin' | 'classPeriod'>;
  }[];
  notJoined: readonly NotJoinedStudent[];
  targetRefKeyByStudentUid: ReadonlyMap<string, string>;
}): Map<string, PrintSeat> {
  const { session, rosters, joined, notJoined, targetRefKeyByStudentUid } =
    params;
  // Only the assigning teacher's own rosters, as the Not joined list matches them.
  const owned = (session.rosterIds ?? [])
    .map((id) => rosters.find((r) => r.id === id))
    .filter((r): r is ClassRoster => !!r);
  const byRefKey = new Map<string, { roster: ClassRoster; student: Student }>();
  for (const roster of owned)
    for (const student of roster.students) {
      const key = refKeyOf(student, roster);
      if (key && !byRefKey.has(key)) byRefKey.set(key, { roster, student });
    }

  const out = new Map<string, PrintSeat>();
  for (const row of joined) {
    const r = row.response;
    const refKey = r.studentUid
      ? (targetRefKeyByStudentUid.get(r.studentUid) ?? null)
      : null;
    let hit = refKey ? byRefKey.get(refKey) : undefined;
    if (!hit && r.pin) {
      const pin = pinKey(r.pin);
      const period = r.classPeriod?.trim();
      const candidates = period
        ? owned.filter((ro) => ro.name.trim() === period)
        : owned;
      for (const roster of candidates) {
        const student = roster.students.find(
          (s) => !!s.pin && pinKey(s.pin) === pin
        );
        if (student) {
          hit = { roster, student };
          break;
        }
      }
    }
    if (!hit) continue;
    out.set(row.key, {
      rosterId: hit.roster.id,
      studentId: hit.student.id,
      refKey: refKey ?? refKeyOf(hit.student, hit.roster),
      studentUid: refKey ? r.studentUid : null,
      name: row.name,
    });
  }
  for (const s of notJoined) {
    if (!s.rosterId || !s.studentId || out.has(s.key)) continue;
    const roster = owned.find((r) => r.id === s.rosterId);
    const student = roster?.students.find((st) => st.id === s.studentId);
    if (!roster || !student) continue;
    out.set(s.key, {
      rosterId: roster.id,
      studentId: student.id,
      refKey: refKeyOf(student, roster),
      studentUid: s.studentUid,
      name: s.name,
    });
  }
  return out;
}
