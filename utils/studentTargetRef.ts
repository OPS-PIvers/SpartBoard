/** Shared `StudentTargetRef` derivation + key formatting (M17 spec §2a/§5 B1). */

import type {
  ClassRoster,
  Student,
  StudentOverride,
  StudentTargetRef,
} from '@/types';
import { isEmptyStudentOverride } from '@/utils/rosterDefaultOverrides';

/** Default 'class'-mode value for `AssignTargetingSection` (spec §5 B3). */
export interface AssignTargetingValue {
  targetMode: 'class' | 'students';
  targetStudents: StudentTargetRef[];
  targetGroupIds: string[];
  overridesByKey: Record<string, StudentOverride>;
  /** Students the teacher skipped for this assignment; they get no pointer doc. */
  excludedStudents?: StudentTargetRef[];
  openAt?: number;
  closeAt?: number;
  dueAt?: number;
}

export const EMPTY_ASSIGN_TARGETING_VALUE: AssignTargetingValue = {
  targetMode: 'class',
  targetStudents: [],
  targetGroupIds: [],
  overridesByKey: {},
  excludedStudents: [],
};

/**
 * Resolve a roster student to a `StudentTargetRef`, or `null` if the student
 * has no SSO identity and cannot be individually targeted (manually-created
 * roster row — `classLinkSourcedId` and roster `testClassId` both absent).
 */
export function resolveStudentTargetRef(
  student: Student,
  roster: Pick<ClassRoster, 'testClassId'>
): StudentTargetRef | null {
  if (student.classLinkSourcedId) {
    return { kind: 'classlink', sourcedId: student.classLinkSourcedId };
  }
  if (roster.testClassId && student.email) {
    return { kind: 'test', email: student.email };
  }
  return null;
}

/**
 * Namespaced key for a `StudentTargetRef`, matching the format the
 * `setAssignmentTargetsV1` Cloud Function expects on `overridesBySourcedId`:
 * `classlink:{sourcedId}` (case preserved) or `test:{emailLower}`.
 */
export function studentTargetRefKey(ref: StudentTargetRef): string {
  return ref.kind === 'classlink'
    ? `classlink:${ref.sourcedId}`
    : `test:${ref.email.toLowerCase()}`;
}

/** Structural equality for two `StudentTargetRef`s (used for selection toggles). */
export function studentTargetRefEquals(
  a: StudentTargetRef,
  b: StudentTargetRef
): boolean {
  return studentTargetRefKey(a) === studentTargetRefKey(b);
}

/** The checked classes an assign dialog expands into per-student targets. */
export interface ClassTargetingContext {
  rosters: ClassRoster[];
  selectedRosterIds: string[];
}

/** One expandable student row from the checked classes. */
export interface ClassStudentRow {
  key: string;
  ref: StudentTargetRef;
  studentId: string;
  name: string;
  rosterId: string;
  rosterName: string;
  /** Standing roster accommodation, if the teacher set one for this student. */
  defaultOverride?: StudentOverride;
}

/**
 * Every individually-targetable student across the checked classes, standing
 * roster accommodations attached. Students with no SSO identity are skipped —
 * they cannot be given a pointer doc.
 */
export function classStudentRows(
  ctx: ClassTargetingContext
): ClassStudentRow[] {
  const selected = new Set(ctx.selectedRosterIds);
  const seen = new Set<string>();
  const rows: ClassStudentRow[] = [];
  for (const roster of ctx.rosters) {
    if (!selected.has(roster.id)) continue;
    for (const student of roster.students) {
      const ref = resolveStudentTargetRef(student, roster);
      if (!ref) continue;
      const key = studentTargetRefKey(ref);
      if (seen.has(key)) continue;
      seen.add(key);
      const defaultOverride = roster.defaultOverridesByStudentId?.[student.id];
      rows.push({
        key,
        ref,
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        rosterId: roster.id,
        rosterName: roster.name,
        ...(defaultOverride && !isEmptyStudentOverride(defaultOverride)
          ? { defaultOverride }
          : {}),
      });
    }
  }
  return rows;
}

/** The override actually served to a class-mode student: teacher edit wins over the standing default. */
export function effectiveClassOverride(
  row: ClassStudentRow,
  overridesByKey: Record<string, StudentOverride>
): StudentOverride | undefined {
  const explicit = overridesByKey[row.key];
  const resolved = explicit ?? row.defaultOverride;
  return resolved && !isEmptyStudentOverride(resolved) ? resolved : undefined;
}

/**
 * Snapshot the checked classes into per-student targets at assign time (later
 * roster edits never touch an existing assignment). Class mode keeps
 * `targetMode: 'class'` so the class channel still delivers to everyone —
 * pointer docs only carry accommodations. A skip is the one case that needs
 * individual delivery, since the class channel cannot hide a single student.
 */
export function expandClassTargeting(
  value: AssignTargetingValue,
  ctx: ClassTargetingContext
): AssignTargetingValue {
  if (value.targetMode === 'students') return value;
  const rows = classStudentRows(ctx);
  const excludedKeys = new Set(
    (value.excludedStudents ?? []).map(studentTargetRefKey)
  );
  const overridesByKey: Record<string, StudentOverride> = {};
  const withOverride: StudentTargetRef[] = [];
  const included: StudentTargetRef[] = [];
  for (const row of rows) {
    if (excludedKeys.has(row.key)) continue;
    included.push(row.ref);
    const override = effectiveClassOverride(row, value.overridesByKey);
    if (override) {
      overridesByKey[row.key] = override;
      withOverride.push(row.ref);
    }
  }
  const skipping = excludedKeys.size > 0;
  return {
    ...value,
    targetMode: skipping ? 'students' : 'class',
    targetStudents: skipping ? included : withOverride,
    overridesByKey,
    excludedStudents: value.excludedStudents ?? [],
  };
}

/**
 * The exact input `setAssignmentTargetsV1` (`functions/src/studentAssignmentTargets.ts`)
 * expects for the target/override/window portion of its payload — everything
 * except `assignmentId`/`kind`/`sessionId`, which the consumer already knows
 * from its own save-wiring.
 */
export interface SetAssignmentTargetsPayload {
  targetMode: 'class' | 'students';
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  /** Keyed by `studentTargetRefKey`; `null` explicitly clears a stored override. */
  overridesBySourcedId: Record<string, StudentOverride | null>;
  /** Omitted entirely when nothing is skipped — absence keeps the legacy fan-out. */
  excludedTargets?: StudentTargetRef[];
  window: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
  };
}

const WINDOW_FIELDS = ['openAt', 'closeAt', 'dueAt'] as const;

/**
 * Diff a previous `AssignTargetingValue` against the current one and produce
 * the exact CF input (spec §5 B3 / F2 fix). The CF's merge contract preserves
 * an ABSENT key and clears only on an explicit `null` — so every B3 consumer
 * MUST build its `setAssignmentTargetsV1` payload through this helper rather
 * than hand-rolling the diff, or a cleared override/window silently survives
 * on the pointer doc as a stale 504/IEP accommodation.
 *
 * `previous` is `undefined` for a first save (every current student is an
 * `add`, every current override is emitted).
 */
export function buildSetAssignmentTargetsPayload(
  previous: AssignTargetingValue | undefined,
  currentValue: AssignTargetingValue,
  classContext?: ClassTargetingContext
): SetAssignmentTargetsPayload {
  const current = classContext
    ? expandClassTargeting(currentValue, classContext)
    : currentValue;
  const prevRefByKey = new Map(
    (previous?.targetStudents ?? []).map(
      (ref) => [studentTargetRefKey(ref), ref] as const
    )
  );
  const currRefByKey = new Map(
    current.targetStudents.map(
      (ref) => [studentTargetRefKey(ref), ref] as const
    )
  );

  const add: StudentTargetRef[] = [];
  for (const [key, ref] of currRefByKey) {
    if (!prevRefByKey.has(key)) add.push(ref);
  }
  const remove: StudentTargetRef[] = [];
  for (const [key, ref] of prevRefByKey) {
    if (!currRefByKey.has(key)) remove.push(ref);
  }

  const overridesBySourcedId: Record<string, StudentOverride | null> = {};
  const allKeys = new Set([
    ...prevRefByKey.keys(),
    ...currRefByKey.keys(),
    ...Object.keys(previous?.overridesByKey ?? {}),
    ...Object.keys(current.overridesByKey),
  ]);
  for (const key of allKeys) {
    const prevOverride = previous?.overridesByKey[key];
    // A student no longer targeted has no current override, same as one
    // whose override was simply cleared while staying selected.
    const currOverride = currRefByKey.has(key)
      ? current.overridesByKey[key]
      : undefined;
    if (currOverride) {
      if (
        !prevOverride ||
        JSON.stringify(prevOverride) !== JSON.stringify(currOverride)
      ) {
        overridesBySourcedId[key] = currOverride;
      }
      // else: unchanged — key omitted, CF preserves the stored value.
    } else if (prevOverride) {
      overridesBySourcedId[key] = null;
    }
  }

  const window: SetAssignmentTargetsPayload['window'] = {};
  for (const field of WINDOW_FIELDS) {
    const prevVal = previous?.[field];
    const currVal = current[field];
    if (currVal !== undefined) {
      if (currVal !== prevVal) window[field] = currVal;
    } else if (prevVal !== undefined) {
      window[field] = null;
    }
  }

  const excluded = current.excludedStudents ?? [];
  const excludedChanged =
    excluded.length > 0 || (previous?.excludedStudents?.length ?? 0) > 0;

  return {
    targetMode: current.targetMode,
    add,
    remove,
    overridesBySourcedId,
    ...(excludedChanged ? { excludedTargets: excluded } : {}),
    window,
  };
}

/** True when a payload carries work for `setAssignmentTargetsV1`; class-wide no-ops skip the call. */
export function payloadRequiresCall(
  payload: SetAssignmentTargetsPayload
): boolean {
  return (
    payload.targetMode === 'students' ||
    payload.add.length > 0 ||
    payload.remove.length > 0 ||
    Object.keys(payload.overridesBySourcedId).length > 0 ||
    (payload.excludedTargets?.length ?? 0) > 0
  );
}
