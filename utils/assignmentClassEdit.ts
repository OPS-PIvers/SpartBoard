// A class change on an in-progress Video Activity, Mini App or Guided Learning assignment.
import type { DocumentReference, WriteBatch } from 'firebase/firestore';
import type { AccessMode, ClassRoster, PeriodAccess } from '@/types';
import {
  batchUpdateWithPaths,
  periodAccessWrites,
} from '@/utils/periodAccessWrites';
import { periodAccessClassEdits } from '@/utils/periodPlan';
import {
  deriveSessionTargetsFromRosters,
  type SessionTargets,
} from '@/utils/resolveAssignmentTargets';

export interface AssignmentClassEdit extends SessionTargets {
  /** Per-period rows to add or remove (null); absent without a period gate. */
  periodAccessRows?: Record<string, PeriodAccess | null>;
}

/** Session targets for the checked classes, plus row writes when the session gates by period. */
export function planAssignmentClassEdit({
  rosters,
  rosterIds,
  periodAccess,
  accessMode,
}: {
  rosters: readonly ClassRoster[];
  rosterIds: readonly string[];
  periodAccess?: Record<string, PeriodAccess>;
  accessMode?: AccessMode;
}): AssignmentClassEdit {
  const selected = rosters.filter((r) => rosterIds.includes(r.id));
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
  }: {
    assignmentRef: DocumentReference;
    sessionRef: DocumentReference;
    edit: AssignmentClassEdit;
    now: number;
    assignmentPeriodNames?: boolean;
    sessionFields: readonly OptionalSessionField[];
  }
): void {
  const rows = periodAccessWrites(edit.periodAccessRows);
  batchUpdateWithPaths(
    batch,
    assignmentRef,
    {
      rosterIds: edit.rosterIds,
      ...(assignmentPeriodNames ? { periodNames: edit.periodNames } : {}),
      updatedAt: now,
    },
    rows
  );
  const optional: Record<OptionalSessionField, unknown> = {
    classId: edit.classIds[0] ?? '',
    periodNames: edit.periodNames,
    classPeriodByClassId: edit.classPeriodByClassId,
  };
  batchUpdateWithPaths(
    batch,
    sessionRef,
    {
      rosterIds: edit.rosterIds,
      classIds: edit.classIds,
      ...Object.fromEntries(sessionFields.map((f) => [f, optional[f]])),
    },
    rows
  );
}
