import {
  isClosedProjectRun,
  type AssignmentSummary,
} from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import { getWindowState, isResourceAvailable } from '@/utils/assignmentWindow';
import { isMissingStillOpen, type TurnInState } from '@/utils/studentTurnIn';
import { hasResponseDoc } from '@/utils/studentResponseDoc';
import { listBellPeriods, normalizePeriodKey } from '@/utils/bellSchedule';
import type { ScheduleLookup } from '@/utils/studentClassOrder';
import type { RosterBellPeriod } from '@/types';

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
  /** Assignments tab: Missing-still-open first, then by due date, then no due date (D15). */
  work: LandingRow[];
  resources: LandingRow[];
  /** Completed tab: Missing (closed) first, then newest first (D18). */
  done: LandingRow[];
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
  const checkable = hasResponseDoc(a.kind);
  const turnIn: TurnInState | undefined = check?.turnIn;
  if (isClosedProjectRun(a) || turnIn === 'turned-in') return 'turned-in';

  if (isClosed(a, nowMs)) {
    // Ended rows wait for their check; one the student never opened needs a deadline to count as Missing.
    if (!checkable || !check) return null;
    const deadline = a.dueAt ?? a.closeAt;
    if (deadline !== undefined && nowMs > deadline) return 'missing';
    return turnIn === 'in-progress' ? 'closed' : null;
  }
  if (a.live) return 'live';
  if (getWindowState(a, nowMs) === 'upcoming') return 'upcoming';
  if (check && isMissingStillOpen(a, check.turnIn, nowMs)) {
    return 'missing-open';
  }
  return turnIn === 'in-progress' ? 'in-progress' : 'open';
}

const doneSortKey = (a: AssignmentSummary): number =>
  a.dueAt ?? a.closeAt ?? a.endedAt ?? a.createdAt ?? 0;

const dueKey = (a: AssignmentSummary): number => a.dueAt ?? Infinity;

const closeKey = (a: AssignmentSummary): number => a.closeAt ?? Infinity;

/** Splits the student's assignments into the landing page's sections, sorted. */
export function partitionLanding(
  assignments: readonly AssignmentSummary[],
  checks: TurnInMap,
  nowMs: number
): LandingPartition {
  const out: LandingPartition = { live: [], work: [], resources: [], done: [] };
  for (const assignment of assignments) {
    const state = landingRowState(assignment, checks, nowMs);
    if (!state) continue;
    const row = { assignment, state };
    if (state === 'live') out.live.push(row);
    else if (state === 'resource') out.resources.push(row);
    else if (state === 'turned-in' || state === 'missing' || state === 'closed')
      out.done.push(row);
    else out.work.push(row);
  }
  out.work.sort(
    (x, y) =>
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
  out.done.sort(
    (x, y) =>
      Number(y.state === 'missing') - Number(x.state === 'missing') ||
      doneSortKey(y.assignment) - doneSortKey(x.assignment)
  );
  return out;
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
  const first = work.filter(priority);
  const rest = work.filter((r) => !priority(r)).slice(0, extra);
  return { shown: [...first, ...rest], total: work.length };
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
