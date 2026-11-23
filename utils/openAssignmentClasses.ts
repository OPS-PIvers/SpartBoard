// Which of a teacher's classes already have an item open, so Assign can lock them and offer to add new classes instead.
import type {
  AccessMode,
  ClassRoster,
  PeriodAccess,
  QuizAssignment,
} from '@/types';
import {
  canEditAssignmentClasses,
  planAddClasses,
  previousRosterIdsFor,
  type AssignmentClassEdit,
} from '@/utils/assignmentClassEdit';
import { periodKeyForRoster } from '@/utils/periodPlan';
import { isClassClosed } from '@/utils/assignedStatus';
import { getAssignmentWidgetKind } from '@/utils/quizWidgetKind';

/** One assignment of the item being assigned, normalized across kinds. */
export interface OpenAssignmentInput {
  id: string;
  /** False once ended ('inactive' or 'ended'). */
  live: boolean;
  createdAt: number;
  rosterIds?: readonly string[];
  periodAccess?: Record<string, PeriodAccess>;
  /** Whether Assign may add classes to it (Edit classes works on it). */
  canAddClasses: boolean;
}

export interface OpenAssignmentClasses {
  /** Roster ids the item is open for. */
  ids: ReadonlySet<string>;
  /** Their names, in roster order. */
  names: string[];
  /** The newest open assignment new classes can join, with its open class names. */
  joinTarget: { id: string; rosterIds: string[]; names: string[] } | null;
}

const rowFor = (
  periodAccess: Record<string, PeriodAccess> | undefined,
  roster: ClassRoster
): PeriodAccess | undefined => {
  if (!periodAccess) return undefined;
  const key = periodKeyForRoster(roster);
  return Object.entries(periodAccess).find(
    ([k, row]) => row.rosterId === roster.id || k === key
  )?.[1];
};

/** Classes still open on one assignment: targeted, and not closed on its own row. */
function openRosterIds(
  a: OpenAssignmentInput,
  rosters: readonly ClassRoster[],
  nowMs: number
): string[] {
  if (!a.live) return [];
  const targeted = new Set(a.rosterIds ?? []);
  return rosters
    .filter((r) => targeted.has(r.id))
    .filter((r) => {
      const row = rowFor(a.periodAccess, r);
      return !row || !isClassClosed(row, nowMs);
    })
    .map((r) => r.id);
}

export function findOpenAssignmentClasses(
  assignments: readonly OpenAssignmentInput[],
  rosters: readonly ClassRoster[],
  nowMs: number
): OpenAssignmentClasses {
  const ids = new Set<string>();
  let joinTarget: OpenAssignmentClasses['joinTarget'] = null;
  let joinAt = -Infinity;
  const nameOf = new Map(rosters.map((r) => [r.id, r.name]));
  for (const a of assignments) {
    const open = openRosterIds(a, rosters, nowMs);
    for (const id of open) ids.add(id);
    if (open.length > 0 && a.canAddClasses && a.createdAt > joinAt) {
      joinAt = a.createdAt;
      joinTarget = {
        id: a.id,
        rosterIds: [...(a.rosterIds ?? [])],
        names: open.map((id) => nameOf.get(id) ?? ''),
      };
    }
  }
  return {
    ids,
    names: rosters.filter((r) => ids.has(r.id)).map((r) => r.name),
    joinTarget,
  };
}

/** A remembered class prefill without the classes a live assignment of the item targets. */
export const withoutLiveClasses = (
  classIds: readonly string[],
  assignments: readonly OpenAssignmentInput[] | null | undefined
): string[] => {
  const live = new Set(
    (assignments ?? []).filter((a) => a.live).flatMap((a) => a.rosterIds ?? [])
  );
  return classIds.filter((id) => !live.has(id));
};

/** A quiz's own device assignments; paper and staff copies don't reach students' lists. */
export const quizOpenInputs = (
  assignments: readonly QuizAssignment[],
  quizId: string,
  rosters: readonly ClassRoster[]
): OpenAssignmentInput[] =>
  openInputsFor(
    assignments,
    rosters,
    (a) =>
      a.quizId === quizId && !a.paper && getAssignmentWidgetKind(a) === 'quiz',
    (a) => a.status !== 'inactive'
  );

interface ClassTargetedAssignment {
  id: string;
  createdAt: number;
  rosterIds?: string[];
  periodNames?: string[];
  periodName?: string;
  periodAccess?: Record<string, PeriodAccess>;
  audience?: string;
  mode?: string;
  targetMode?: 'class' | 'students';
  targetGroupIds?: string[];
  overridesBySourcedId?: Record<string, unknown>;
}

/** Any kind's assignments of one item, given which are its and which are still live. */
export function openInputsFor<A extends ClassTargetedAssignment>(
  assignments: readonly A[],
  rosters: readonly ClassRoster[],
  isItem: (a: A) => boolean,
  isLive: (a: A) => boolean,
  canAddClasses: (a: A) => boolean = () => true
): OpenAssignmentInput[] {
  return assignments
    .filter(
      (a) => isItem(a) && a.audience !== 'staff' && a.mode !== 'view-only'
    )
    .map((a) => ({
      id: a.id,
      live: isLive(a),
      createdAt: a.createdAt,
      rosterIds: previousRosterIdsFor(a, rosters),
      periodAccess: a.periodAccess,
      canAddClasses: canEditAssignmentClasses(a) && canAddClasses(a),
    }));
}

/** Saves Assign's "Add to the X assignment" through the kind's own Edit classes write. */
export async function addToOpenAssignment<
  A extends ClassTargetedAssignment & { accessMode?: AccessMode },
>({
  assignments,
  assignmentId,
  rosters,
  addRosterIds,
  dueLockAt,
  save,
  toast,
  onError,
}: {
  assignments: readonly A[];
  assignmentId: string;
  rosters: readonly ClassRoster[];
  addRosterIds: readonly string[];
  dueLockAt?: number | null;
  save: (assignment: A, edit: AssignmentClassEdit) => Promise<void>;
  toast: (message: string, tone: 'success' | 'error') => void;
  onError?: (err: unknown) => void;
}): Promise<void> {
  const target = assignments.find((a) => a.id === assignmentId);
  try {
    if (!target) throw new Error('That assignment is gone.');
    await save(
      target,
      planAddClasses(target, rosters, addRosterIds, dueLockAt)
    );
  } catch (err) {
    onError?.(err);
    toast(ADD_FAILED, 'error');
    throw err;
  }
  toast(ADDED, 'success');
}

const ADDED = 'Added to the assignment.';
const ADD_FAILED = "Couldn't add the classes.";
