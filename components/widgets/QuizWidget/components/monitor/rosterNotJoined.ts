import type {
  ClassRoster,
  QuizResponse,
  QuizSession,
  StudentTargetRef,
} from '@/types';
import {
  formatStudentName,
  type StudentName,
} from '@/hooks/useAssignmentPseudonyms';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';
import { periodKeyForRoster } from '@/utils/periodPlan';

/** A roster student with no response on this session yet. */
export interface NotJoinedStudent {
  key: string;
  name: string;
  /** Pseudonym uid when the class lookup resolved it; null for PIN-only students. */
  studentUid: string | null;
  /** Roster name, matching the monitor's class filter; '' when on no roster. */
  period: string;
  /** Session `periodAccess` key for the student's class. */
  periodKey: string | null;
  /** On the roster's absent list for today. */
  absent: boolean;
  /** Roster and student ids, for marking absent; null for a targeted student on no roster. */
  rosterId: string | null;
  studentId: string | null;
}

/** The assignment's targeting, from the teacher's own assignment doc. */
export interface MonitorRosterTargets {
  targetMode?: 'class' | 'students';
  targetStudents?: StudentTargetRef[];
  excludedTargets?: StudentTargetRef[];
}

const nameKey = (s: string): string =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

interface Candidate {
  key: string;
  uid: string | null;
  name: string;
  pin: string;
  period: string;
  periodKey: string | null;
  absent: boolean;
  rosterId: string | null;
  studentId: string | null;
}

/** Roster students who haven't opened the quiz; skipped and untargeted students are left out. */
export function buildNotJoined(params: {
  session: Pick<
    QuizSession,
    | 'rosterIds'
    | 'individualTargeting'
    | 'classIds'
    | 'classId'
    | 'classPeriodByClassId'
  >;
  rosters: ClassRoster[];
  responses: QuizResponse[];
  targets: MonitorRosterTargets | null;
  byStudentUid: Map<string, StudentName>;
  targetRefKeyByStudentUid: Map<string, string>;
  /** False while the class lookup is loading or failed; ClassLink students wait for it. */
  lookupReady: boolean;
  /** The name the monitor shows for a response, to catch a PIN or LMS join. */
  responseName: (r: QuizResponse) => string;
  /** Local date (YYYY-MM-DD); a roster's absent list counts only on its own date. */
  today: string;
}): NotJoinedStudent[] {
  const {
    session,
    rosters,
    responses,
    targets,
    byStudentUid,
    targetRefKeyByStudentUid,
    lookupReady,
    responseName,
    today,
  } = params;
  const studentsMode = targets?.targetMode === 'students';
  // A per-student assignment we can't see the targets of would list the whole class.
  if (session.individualTargeting && !studentsMode) return [];

  // Only the assigning teacher's own rosters match by id; name matching could pick a co-teacher's class.
  const matched = (session.rosterIds ?? [])
    .map((id) => rosters.find((r) => r.id === id))
    .filter((r): r is ClassRoster => !!r);
  // The class lookup only covers the session's classes.
  const lookedUp = new Set(
    session.classIds?.length
      ? session.classIds
      : session.classId
        ? [session.classId]
        : []
  );

  const uidByRefKey = new Map<string, string>();
  for (const [uid, refKey] of targetRefKeyByStudentUid)
    uidByRefKey.set(refKey, uid);

  const skip = new Set(
    (targets?.excludedTargets ?? []).map(studentTargetRefKey)
  );
  const targeted = studentsMode
    ? new Set((targets?.targetStudents ?? []).map(studentTargetRefKey))
    : null;

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const roster of matched) {
    const periodKey = periodKeyForRoster(roster);
    const absentIds = new Set(
      roster.absent?.date === today ? roster.absent.studentIds : []
    );
    for (const student of roster.students) {
      const ref = resolveStudentTargetRef(student, roster);
      const refKey = ref ? studentTargetRefKey(ref) : null;
      if (targeted && (!refKey || !targeted.has(refKey))) continue;
      if (refKey && skip.has(refKey)) continue;
      const rowKey = `${roster.id}:${student.id}`;
      const dedupe = refKey ?? rowKey;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      // Signed-in students need their uid, so a joined student never shows as not joined.
      if (refKey && (!lookupReady || !lookedUp.has(periodKey))) continue;
      const uid = refKey ? (uidByRefKey.get(refKey) ?? null) : null;
      candidates.push({
        key: uid ?? rowKey,
        uid,
        name:
          (uid ? formatStudentName(byStudentUid.get(uid)) : '') ||
          `${student.firstName} ${student.lastName}`.trim() ||
          'Student',
        pin: student.pin ?? '',
        period: roster.name,
        periodKey,
        absent: absentIds.has(student.id),
        rosterId: roster.id,
        studentId: student.id,
      });
    }
  }
  // Targeted students on none of the matched rosters.
  if (targeted && lookupReady) {
    for (const refKey of targeted) {
      if (seen.has(refKey) || skip.has(refKey)) continue;
      seen.add(refKey);
      const uid = uidByRefKey.get(refKey);
      if (!uid) continue;
      candidates.push({
        key: uid,
        uid,
        name: formatStudentName(byStudentUid.get(uid)) || 'Student',
        pin: '',
        period: '',
        periodKey: null,
        absent: false,
        rosterId: null,
        studentId: null,
      });
    }
  }

  const periodOf = (r: QuizResponse): string =>
    r.classPeriod ??
    (r.classId ? session.classPeriodByClassId?.[r.classId] : undefined) ??
    '';
  const singleClass = matched.length <= 1;
  const unclaimed = new Set(responses);
  const joined = new Set<Candidate>();
  // First by uid, then by PIN within the class.
  const byUid = new Map(responses.map((r) => [r.studentUid, r]));
  for (const c of candidates) {
    const r = c.uid ? byUid.get(c.uid) : undefined;
    if (r) {
      joined.add(c);
      unclaimed.delete(r);
    }
  }
  for (const c of candidates) {
    if (joined.has(c) || !c.pin) continue;
    const r = [...unclaimed].find(
      (x) =>
        x.pin === c.pin &&
        (periodOf(x) === c.period || (!periodOf(x) && singleClass))
    );
    if (r) {
      joined.add(c);
      unclaimed.delete(r);
    }
  }
  // Last, a response no row claimed (an LMS or PIN join) by its shown name, one row each.
  for (const c of candidates) {
    if (joined.has(c)) continue;
    const r = [...unclaimed].find(
      (x) =>
        nameKey(responseName(x)) === nameKey(c.name) &&
        (periodOf(x) === c.period || !periodOf(x))
    );
    if (r) {
      joined.add(c);
      unclaimed.delete(r);
    }
  }

  return candidates
    .filter((c) => !joined.has(c))
    .map((c) => ({
      key: c.key,
      name: c.name,
      studentUid: c.uid,
      period: c.period,
      periodKey: c.periodKey,
      absent: c.absent,
      rosterId: c.rosterId,
      studentId: c.studentId,
    }));
}
