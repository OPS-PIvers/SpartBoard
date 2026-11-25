import {
  isClosedProjectRun,
  isClosedUnsubmittableRun,
  type AssignmentSummary,
  type SessionKind,
} from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import { getWindowState, isResourceAvailable } from '@/utils/assignmentWindow';
import { isMissingStillOpen, type TurnInState } from '@/utils/studentTurnIn';
import {
  closeWithPass,
  effectivePeriodState,
  runningPassUntil,
  studentCanEnter,
} from '@/utils/periodAccess';
import { readsTurnIn } from '@/utils/studentResponseDoc';
import { listBellPeriods, normalizePeriodKey } from '@/utils/bellSchedule';
import type { ScheduleLookup } from '@/utils/studentClassOrder';
import type { RosterBellPeriod } from '@/types';
import type { StudentGradeRow } from '@/utils/gradebook/studentGrades';

/** Where one row sits on the student landing page (STUDENT_LANDING_V2 D13 to D19). */
export type LandingRowState =
  | 'live'
  | 'open'
  | 'in-progress'
  | 'missing-open'
  | 'upcoming'
  | 'resource'
  | 'turned-in'
  | 'missing'
  | 'closed';

export interface LandingRow {
  assignment: AssignmentSummary;
  state: LandingRowState;
}

export interface LandingPartition {
  live: LandingRow[];
  /** Assignments tab: live, then open, then locked; within each, Missing-still-open, then by due date, then no due date (D15). */
  work: LandingRow[];
  resources: LandingRow[];
  /** Completed tab: turned in, plus printed copies waiting for their scan; newest first (D18). */
  done: LandingRow[];
  /** Expired: not turned in and can no longer be turned in; newest first. */
  expired: LandingRow[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isClosed(a: AssignmentSummary, nowMs: number): boolean {
  return (
    a.channel === 'ended' ||
    a.endedAt !== undefined ||
    getWindowState(a, nowMs) === 'closed'
  );
}

/** One row's state, or null when it does not belong on the page (yet). */
export function landingRowState(
  a: AssignmentSummary,
  checks: TurnInMap,
  nowMs: number
): LandingRowState | null {
  if (a.workKind === 'resource') {
    return isResourceAvailable(a, nowMs) ? 'resource' : null;
  }
  const check = checks[a.compositeId];
  const checkable = readsTurnIn(a);
  const turnIn: TurnInState | undefined = check?.turnIn;
  if (isClosedUnsubmittableRun(a) || turnIn === 'turned-in') return 'turned-in';
  // A printed copy waits for its scan, so it is never Missing; a closed untouched one stays off the page until then.
  const onPaper = a.kind === 'quiz' && a.override?.onPaper === true;
  // In no group yet, so nothing to submit: never Missing.
  if (a.kind === 'projects' && turnIn === 'not-started')
    return isClosedProjectRun(a) ? 'turned-in' : 'open';

  if (isClosed(a, nowMs) || isClosedProjectRun(a)) {
    if (check?.reopened && a.channel !== 'ended' && a.endedAt === undefined)
      return 'in-progress';
    // Ended rows wait for their check; one the student never opened needs a deadline to count as Missing.
    if (!checkable || !check) return null;
    if (onPaper) return turnIn === 'in-progress' ? 'closed' : null;
    const deadline = a.dueAt ?? a.closeAt;
    if (deadline !== undefined && nowMs > deadline) return 'missing';
    return turnIn === 'in-progress' ? 'missing' : null;
  }
  if (a.live && !a.outsideClasses) return 'live';
  if (getWindowState(a, nowMs) === 'upcoming') return 'upcoming';
  // A paused or not-yet-open quiz can't be done now, so it is never Missing.
  if (
    check &&
    !onPaper &&
    !a.held &&
    !a.outsideClasses &&
    isMissingStillOpen(a, check.turnIn, nowMs)
  ) {
    return 'missing-open';
  }
  return turnIn === 'in-progress' ? 'in-progress' : 'open';
}

const doneSortKey = (a: AssignmentSummary): number =>
  a.dueAt ?? a.closeAt ?? a.endedAt ?? a.createdAt ?? 0;

const dueKey = (a: AssignmentSummary): number => a.dueAt ?? Infinity;

const closeKey = (a: AssignmentSummary): number => a.closeAt ?? Infinity;

/** Whether a work row can be opened now: 'live' when its class has been started, 'locked' when paused, not open yet or upcoming. */
export function workAvailability(
  row: LandingRow,
  nowMs: number,
  uid: string | null
): 'live' | 'open' | 'locked' {
  const a = row.assignment;
  if (row.state === 'upcoming' || a.held !== undefined || a.outsideClasses)
    return 'locked';
  const gate = a.periodGate;
  if (!gate) return 'open';
  if (!studentCanEnter(gate, gate.periodKeys, uid, nowMs)) return 'locked';
  // A Manual start class the teacher has started (not a Let in now pass on a closed class).
  const started =
    gate.accessMode === 'assessment' &&
    (row.state === 'open' || row.state === 'in-progress') &&
    gate.periodKeys.some((k) => {
      const access = gate.periodAccess?.[k];
      return !!access && effectivePeriodState(access, nowMs) === 'open';
    });
  return started ? 'live' : 'open';
}

/** A running Schedule or Let in pass opens the row past a whole-quiz pause, open time or close. */
export function withLandingPass(
  a: AssignmentSummary,
  uid: string | null,
  nowMs: number
): AssignmentSummary {
  const until = runningPassUntil(a.passes, uid, nowMs);
  if (until == null || a.channel === 'ended' || a.endedAt !== undefined)
    return a;
  return {
    ...a,
    openAt: undefined,
    closeAt: closeWithPass(a.closeAt, until) ?? undefined,
    held: undefined,
  };
}

const AVAILABILITY_RANK = { live: 0, open: 1, locked: 2 } as const;

/** Splits the student's assignments into the landing page's sections, sorted. */
export function partitionLanding(
  assignments: readonly AssignmentSummary[],
  checks: TurnInMap,
  nowMs: number,
  uid: string | null = null
): LandingPartition {
  const out: LandingPartition = {
    live: [],
    work: [],
    resources: [],
    done: [],
    expired: [],
  };
  for (const listed of assignments) {
    const assignment = withLandingPass(listed, uid, nowMs);
    const state = landingRowState(assignment, checks, nowMs);
    if (!state) continue;
    const row = { assignment, state };
    if (state === 'live') out.live.push(row);
    else if (state === 'resource') out.resources.push(row);
    else if (state === 'missing') out.expired.push(row);
    else if (state === 'turned-in' || state === 'closed') out.done.push(row);
    else out.work.push(row);
  }
  const rank = (r: LandingRow) =>
    AVAILABILITY_RANK[workAvailability(r, nowMs, uid)];
  out.work.sort(
    (x, y) =>
      rank(x) - rank(y) ||
      Number(y.state === 'missing-open') - Number(x.state === 'missing-open') ||
      dueKey(x.assignment) - dueKey(y.assignment) ||
      (y.assignment.createdAt ?? 0) - (x.assignment.createdAt ?? 0) ||
      x.assignment.title.localeCompare(y.assignment.title)
  );
  out.resources.sort(
    (x, y) =>
      closeKey(x.assignment) - closeKey(y.assignment) ||
      x.assignment.title.localeCompare(y.assignment.title)
  );
  const newestFirst = (x: LandingRow, y: LandingRow) =>
    doneSortKey(y.assignment) - doneSortKey(x.assignment);
  out.done.sort(newestFirst);
  out.expired.sort(newestFirst);
  return out;
}

/** One Completed or Gradebook row (D17, D18): a landing row, a grade, or both. */
export interface DoneItem {
  key: string;
  kind: SessionKind;
  sessionId: string;
  title: string;
  /** Absent when the session is no longer in the student's list. */
  row?: LandingRow;
  grade?: StudentGradeRow;
  missing: boolean;
  /** Due date, else when it closed. */
  when?: number;
}

const itemFromRow = (row: LandingRow, grade?: StudentGradeRow): DoneItem => {
  const a = row.assignment;
  return {
    key: a.compositeId,
    kind: a.kind,
    sessionId: a.sessionId,
    title: a.title,
    row,
    grade,
    missing: row.state === 'missing',
    when: a.dueAt ?? a.closeAt ?? a.endedAt,
  };
};

const sortKeyOf = (item: DoneItem): number =>
  item.row
    ? doneSortKey(item.row.assignment)
    : (item.grade?.dueAt ?? item.grade?.updatedAt ?? 0);

/** Completed or Expired tab rows, in the partition's order. */
export function completedItems(rows: readonly LandingRow[]): DoneItem[] {
  return rows.map((row) => itemFromRow(row));
}

/** D17, D18: done and expired rows joined to their grades, plus grades whose session left the list; open work stays out. */
export function gradebookItems(
  p: LandingPartition,
  grades: readonly StudentGradeRow[]
): DoneItem[] {
  const bySession = new Map(grades.map((g) => [g.sessionId, g]));
  const listed = new Set(
    [...p.live, ...p.work, ...p.resources, ...p.done, ...p.expired].map(
      (r) => r.assignment.sessionId
    )
  );
  const items = [...p.done, ...p.expired].map((row) =>
    itemFromRow(row, bySession.get(row.assignment.sessionId))
  );
  for (const g of grades) {
    if (listed.has(g.sessionId)) continue;
    items.push({
      key: `${g.kind}:${g.sessionId}`,
      kind: g.kind,
      sessionId: g.sessionId,
      title: g.title,
      grade: g,
      missing: g.flags.some((f) => f.id === 'missing'),
      when: g.dueAt ?? undefined,
    });
  }
  return items.sort(
    (x, y) =>
      Number(y.missing) - Number(x.missing) ||
      sortKeyOf(y) - sortKeyOf(x) ||
      x.title.localeCompare(y.title)
  );
}

/** The slice of a partition that targets one class. */
export function partitionForClass(
  p: LandingPartition,
  classId: string
): LandingPartition {
  const inClass = (r: LandingRow) => r.assignment.classIds.includes(classId);
  return {
    live: p.live.filter(inClass),
    work: p.work.filter(inClass),
    resources: p.resources.filter(inClass),
    done: p.done.filter(inClass),
    expired: p.expired.filter(inClass),
  };
}

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** D19: Missing-still-open and due today always show; then the next `extra` by due date. */
export function upNextRows(
  work: readonly LandingRow[],
  nowMs: number,
  extra = 3
): { shown: LandingRow[]; total: number } {
  const today = new Date(nowMs);
  const priority = (r: LandingRow) =>
    r.state === 'missing-open' ||
    (r.assignment.dueAt !== undefined &&
      sameDay(new Date(r.assignment.dueAt), today));
  const rest = new Set(work.filter((r) => !priority(r)).slice(0, extra));
  return {
    shown: work.filter((r) => priority(r) || rest.has(r)),
    total: work.length,
  };
}

/** D21: the one plain line under a class in the class list. */
export function classListLine(
  work: readonly LandingRow[],
  inSession: boolean,
  teachers: string,
  nowMs: number
): { text: string; tone: 'now' | 'missing' | 'plain' } {
  if (inSession) return { text: 'In class now', tone: 'now' };
  const missing = work.filter((r) => r.state === 'missing-open').length;
  if (missing > 0) return { text: `Missing: ${missing}`, tone: 'missing' };
  const dueSoon = work.filter(
    (r) =>
      r.state !== 'missing-open' &&
      r.assignment.dueAt !== undefined &&
      r.assignment.dueAt - nowMs <= WEEK_MS
  ).length;
  if (dueSoon > 0) return { text: `${dueSoon} due this week`, tone: 'plain' };
  return { text: teachers, tone: 'plain' };
}

/** D5, D21: the period for the class-colour square, else the class name's first letter. */
export function periodSquare(
  name: string,
  bellPeriod?: RosterBellPeriod
): string {
  const id = bellPeriod?.periodId.trim() ?? '';
  const number = /\d+[A-Za-z]?/.exec(id)?.[0];
  if (number && number.length <= 3) return number.toUpperCase();
  if (id && id.length <= 2) return id.toUpperCase();
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** D20: the schedule's own name for the class's period, e.g. "3rd Period". */
export function periodLabel(
  bellPeriod: RosterBellPeriod | undefined,
  scheduleFor: ScheduleLookup
): string | undefined {
  if (!bellPeriod) return undefined;
  const key = normalizePeriodKey(bellPeriod.periodId);
  const match = listBellPeriods(scheduleFor(bellPeriod.buildingId)).find(
    (o) => normalizePeriodKey(o.periodId) === key
  );
  return match?.label ?? `Period ${bellPeriod.periodId}`;
}
