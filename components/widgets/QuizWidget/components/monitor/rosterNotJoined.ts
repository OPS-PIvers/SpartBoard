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
}

/** The assignment's targeting, from the teacher's own assignment doc. */
export interface MonitorRosterTargets {
  targetMode?: 'class' | 'students';
  targetStudents?: StudentTargetRef[];
  excludedTargets?: StudentTargetRef[];
  removedStudentRefs?: StudentTargetRef[];
}

const nameKey = (s: string): string =>
  s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Roster students who haven't opened the quiz; skipped, removed and untargeted students are left out. */
export function buildNotJoined(params: {
  session: Pick<QuizSession, 'rosterIds' | 'individualTargeting'>;
  rosters: ClassRoster[];
  responses: QuizResponse[];
  targets: MonitorRosterTargets | null;
  byStudentUid: Map<string, StudentName>;
  targetRefKeyByStudentUid: Map<string, string>;
  /** False while the class lookup is loading; ClassLink students wait for it. */
  lookupReady: boolean;
  /** Names already shown for joined responses, to catch a PIN or LMS join. */
  joinedNames: Iterable<string>;
}): NotJoinedStudent[] {
  const {
    session,
    rosters,
    responses,
    targets,
    byStudentUid,
    targetRefKeyByStudentUid,
    lookupReady,
    joinedNames,
  } = params;
  const studentsMode = targets?.targetMode === 'students';
  // A per-student assignment we can't see the targets of would list the whole class.
  if (session.individualTargeting && !studentsMode) return [];

  // Only the assigning teacher's own rosters match by id; name matching could pick a co-teacher's class.
  const matched = (session.rosterIds ?? [])
    .map((id) => rosters.find((r) => r.id === id))
    .filter((r): r is ClassRoster => !!r);

  const uidByRefKey = new Map<string, string>();
  for (const [uid, refKey] of targetRefKeyByStudentUid)
    uidByRefKey.set(refKey, uid);

  const joinedUids = new Set(responses.map((r) => r.studentUid));
  const joinedPins = new Set<string>();
  for (const r of responses)
    if (r.pin) joinedPins.add(`${r.classPeriod ?? ''}|${r.pin}`);
  const pinJoined = (period: string, pin: string): boolean =>
    joinedPins.has(`${period}|${pin}`) || joinedPins.has(`|${pin}`);
  const joinedNameKeys = new Set([...joinedNames].map(nameKey));

  const skip = new Set(
    [
      ...(targets?.excludedTargets ?? []),
      ...(targets?.removedStudentRefs ?? []),
    ].map(studentTargetRefKey)
  );
  const targeted = studentsMode
    ? new Set((targets?.targetStudents ?? []).map(studentTargetRefKey))
    : null;

  const out: NotJoinedStudent[] = [];
  const seen = new Set<string>();
  const add = (
    refKey: string | null,
    uid: string | undefined,
    fallbackName: string,
    pins: string[],
    period: string,
    periodKey: string | null
  ) => {
    if (uid && joinedUids.has(uid)) return;
    if (pins.some((p) => p && pinJoined(period, p))) return;
    const name =
      (uid ? formatStudentName(byStudentUid.get(uid)) : '') ||
      fallbackName ||
      'Student';
    if (joinedNameKeys.has(nameKey(name))) return;
    out.push({
      key: uid ?? refKey ?? `roster:${period}:${name}`,
      name,
      studentUid: uid ?? null,
      period,
      periodKey,
    });
  };

  for (const roster of matched) {
    for (const student of roster.students) {
      const ref = resolveStudentTargetRef(student, roster);
      const refKey = ref ? studentTargetRefKey(ref) : null;
      if (targeted && (!refKey || !targeted.has(refKey))) continue;
      if (refKey && skip.has(refKey)) continue;
      const dedupe = refKey ?? `${roster.id}:${student.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const uid = refKey ? uidByRefKey.get(refKey) : undefined;
      // Wait for the lookup so a joined student never flashes as not joined.
      if (refKey && !lookupReady) continue;
      add(
        refKey,
        uid,
        `${student.firstName} ${student.lastName}`.trim(),
        [student.pin, ...(student.formerPins ?? [])],
        roster.name,
        periodKeyForRoster(roster)
      );
    }
  }

  // Targeted students on none of the matched rosters.
  if (targeted && lookupReady) {
    for (const refKey of targeted) {
      if (seen.has(refKey) || skip.has(refKey)) continue;
      seen.add(refKey);
      const uid = uidByRefKey.get(refKey);
      if (!uid) continue;
      add(refKey, uid, '', [], '', null);
    }
  }
  return out;
}
