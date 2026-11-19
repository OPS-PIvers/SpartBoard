// A class change on an in-progress Video Activity, Mini App or Guided Learning assignment.
import type { DocumentReference, WriteBatch } from 'firebase/firestore';
import type { AccessMode, ClassRoster, PeriodAccess } from '@/types';
import {
  batchUpdateWithPaths,
  periodAccessWrites,
} from '@/utils/periodAccessWrites';
import { periodAccessClassEdits } from '@/utils/periodPlan';
import {
  nextRemovedClasses,
  withLinkedSections,
  type SessionClassTargets,
} from '@/utils/sessionClassFilter';
import {
  deriveSessionTargetsFromRosters,
  type SessionTargets,
} from '@/utils/resolveAssignmentTargets';

export interface AssignmentClassEdit extends SessionTargets {
  /** Per-period rows to add or remove (null); absent without a period gate. */
  periodAccessRows?: Record<string, PeriodAccess | null>;
  /** Names of the rosters the edit takes off, so their PIN work is hidden. */
  removedRosterNames?: string[];
  /** Class ids and period keys of those rosters; a class dropped any other way is not recorded as removed. */
  removedClassIds?: string[];
}

/** The rosters an assignment targeted: `rosterIds` when present (even empty), else those matching its legacy period names. */
export function previousRosterIdsFor(
  a: { rosterIds?: string[]; periodNames?: string[]; periodName?: string },
  rosters: readonly ClassRoster[]
): string[] {
  if (a.rosterIds !== undefined) return a.rosterIds;
  const names = new Set(a.periodNames ?? (a.periodName ? [a.periodName] : []));
  return rosters.filter((r) => names.has(r.name)).map((r) => r.id);
}

/** The class ids and period keys a set of unchecked rosters carries. */
export function uncheckedRosterClassIds(
  rosters: readonly ClassRoster[]
): string[] {
  return [
    ...new Set(
      rosters.flatMap((r) => [
        r.classlinkClassId,
        r.testClassId,
        `roster:${r.id}`,
      ])
    ),
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Session targets for the checked classes, plus row writes when the session gates by period. */
export function planAssignmentClassEdit({
  rosters,
  rosterIds,
  previousRosterIds = [],
  periodAccess,
  accessMode,
}: {
  rosters: readonly ClassRoster[];
  rosterIds: readonly string[];
  previousRosterIds?: readonly string[];
  periodAccess?: Record<string, PeriodAccess>;
  accessMode?: AccessMode;
}): AssignmentClassEdit {
  const selected = rosters.filter((r) => rosterIds.includes(r.id));
  const unchecked = rosters.filter(
    (r) => previousRosterIds.includes(r.id) && !rosterIds.includes(r.id)
  );
  const removedRosterNames = unchecked.map((r) => r.name);
  const {
    rosterIds: ids,
    classIds,
    periodNames,
    classPeriodByClassId,
  } = deriveSessionTargetsFromRosters(selected);
  const targets = {
    rosterIds: ids,
    classIds,
    periodNames,
    classPeriodByClassId,
    removedRosterNames,
    removedClassIds: uncheckedRosterClassIds(unchecked),
  };
  if (!accessMode || !periodAccess || Object.keys(periodAccess).length === 0)
    return targets;
  // A new class in assignment mode opens on the window the other classes share.
  const shared = Object.values(periodAccess)[0];
  return {
    ...targets,
    periodAccessRows: periodAccessClassEdits({
      periodAccess,
      accessMode,
      rosters: selected,
      window: {
        openAt: shared.openAt ?? undefined,
        closeAt: shared.closeAt ?? undefined,
      },
    }),
  };
}

/** Class ids from Google Classroom or Schoology links, which no roster carries and an edit must keep. */
export const externalClassIds = (
  ids: readonly unknown[] | undefined
): string[] =>
  (ids ?? []).filter(
    (id): id is string =>
      typeof id === 'string' &&
      (id.startsWith('classroom:') || id.startsWith('schoology:'))
  );

/** Individually targeted assignments retarget through `setAssignmentTargetsV1`, so Edit classes skips them. */
export const canEditAssignmentClasses = (a: {
  targetMode?: 'class' | 'students';
  targetGroupIds?: string[];
  overridesBySourcedId?: Record<string, unknown>;
}): boolean =>
  a.targetMode !== 'students' &&
  !a.targetGroupIds?.length &&
  Object.keys(a.overridesBySourcedId ?? {}).length === 0;

type OptionalSessionField = 'classId' | 'periodNames' | 'classPeriodByClassId';

/** Stages a class edit on the assignment and session docs; rows go to both by FieldPath. */
export function stageAssignmentClassEdit(
  batch: WriteBatch,
  {
    assignmentRef,
    sessionRef,
    edit,
    now,
    assignmentPeriodNames = false,
    sessionFields,
    keepClassIds = [],
    currentSession,
  }: {
    assignmentRef: DocumentReference;
    sessionRef: DocumentReference;
    edit: AssignmentClassEdit;
    now: number;
    assignmentPeriodNames?: boolean;
    sessionFields: readonly OptionalSessionField[];
    /** The session's Classroom or Schoology ids (`externalClassIds`), kept after the roster ids. */
    keepClassIds?: readonly string[];
    /** The session doc before the edit, so the classes it drops are recorded. */
    currentSession?: SessionClassTargets;
  }
): void {
  const rows = periodAccessWrites(edit.periodAccessRows);
  // With the session in hand, a linked section paired only with removed classes leaves too.
  const carried = currentSession
    ? withLinkedSections(currentSession, {
        classIds: edit.classIds,
        periodNames: edit.periodNames,
        classPeriodByClassId: edit.classPeriodByClassId,
      })
    : null;
  const classIds = carried
    ? carried.classIds
    : [
        ...edit.classIds,
        ...keepClassIds.filter((id) => !edit.classIds.includes(id)),
      ];
  const periodNames = carried?.periodNames ?? edit.periodNames;
  const classPeriodByClassId =
    carried?.classPeriodByClassId ?? edit.classPeriodByClassId;
  batchUpdateWithPaths(
    batch,
    assignmentRef,
    {
      rosterIds: edit.rosterIds,
      ...(assignmentPeriodNames ? { periodNames } : {}),
      updatedAt: now,
    },
    rows
  );
  const nextRowKeys = new Set(Object.keys(currentSession?.periodAccess ?? {}));
  for (const [key, row] of Object.entries(edit.periodAccessRows ?? {})) {
    if (row) nextRowKeys.add(key);
    else nextRowKeys.delete(key);
  }
  const removedClasses = nextRemovedClasses(
    currentSession,
    {
      classIds,
      periodNames,
      periodAccessKeys: [...nextRowKeys],
    },
    edit.removedRosterNames ?? [],
    edit.removedClassIds ?? []
  );
  const optional: Record<OptionalSessionField, unknown> = {
    classId: classIds[0] ?? '',
    periodNames,
    classPeriodByClassId,
  };
  batchUpdateWithPaths(
    batch,
    sessionRef,
    {
      rosterIds: edit.rosterIds,
      classIds,
      removedClasses,
      ...Object.fromEntries(sessionFields.map((f) => [f, optional[f]])),
    },
    rows
  );
}
