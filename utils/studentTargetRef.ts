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
  /** Sort key for the per-class list. */
  lastName: string;
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
  const seen = new Map<string, ClassStudentRow>();
  const rows: ClassStudentRow[] = [];
  for (const roster of ctx.rosters) {
    if (!selected.has(roster.id)) continue;
    for (const student of roster.students) {
      const ref = resolveStudentTargetRef(student, roster);
      if (!ref) continue;
      const key = studentTargetRefKey(ref);
      const raw = roster.defaultOverridesByStudentId?.[student.id];
      const defaultOverride =
        raw && !isEmptyStudentOverride(raw) ? raw : undefined;
      const existing = seen.get(key);
      if (existing) {
        // Same student in two checked rosters: merge the standing defaults so
        // the second roster's accommodation is not silently dropped.
        if (defaultOverride) {
          existing.defaultOverride = {
            ...defaultOverride,
            ...(existing.defaultOverride ?? {}),
          };
        }
        continue;
      }
      const row: ClassStudentRow = {
        key,
        ref,
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        lastName: student.lastName ?? '',
        rosterId: roster.id,
        rosterName: roster.name,
        ...(defaultOverride ? { defaultOverride } : {}),
      };
      seen.set(key, row);
      rows.push(row);
    }
  }
  return rows;
}

/** Drops an override that carries no actual accommodation. */
function nonEmptyOverride(
  override: StudentOverride | undefined
): StudentOverride | undefined {
  return override && !isEmptyStudentOverride(override) ? override : undefined;
}

/** The override actually served to a class-mode student: teacher edit wins over the standing default. */
export function effectiveClassOverride(
  row: ClassStudentRow,
  overridesByKey: Record<string, StudentOverride>,
  /** False on a re-edit: a roster default added later must not apply retroactively. */
  useRosterDefaults = true
): StudentOverride | undefined {
  const explicit = overridesByKey[row.key];
  return nonEmptyOverride(
    explicit ?? (useRosterDefaults ? row.defaultOverride : undefined)
  );
}

/**
 * Snapshot the checked classes into per-student targets at assign time (later
 * roster edits never touch an existing assignment). Class mode keeps
 * `targetMode: 'class'` so the class channel still delivers to everyone —
 * pointer docs only carry accommodations. A skip is the one case that needs
 * individual delivery, since the class channel cannot hide a single student.
 */
export interface ExpandClassTargetingOptions {
  /** False for re-edits: standing roster defaults must not apply retroactively. */
  useRosterDefaults?: boolean;
}

export function expandClassTargeting(
  value: AssignTargetingValue,
  ctx: ClassTargetingContext,
  options: ExpandClassTargetingOptions = {}
): AssignTargetingValue {
  if (value.targetMode === 'students') return value;
  const useRosterDefaults = options.useRosterDefaults !== false;
  const rows = classStudentRows(ctx);
  const rowByKey = new Map(rows.map((row) => [row.key, row] as const));
  // Refs the stored snapshot already carries survive even when the roster no
  // longer lists the student, so a re-edit never orphans their pointer doc.
  const refByKey = new Map<string, StudentTargetRef>();
  for (const ref of value.targetStudents)
    refByKey.set(studentTargetRefKey(ref), ref);
  for (const ref of value.excludedStudents ?? [])
    refByKey.set(studentTargetRefKey(ref), ref);
  for (const row of rows) refByKey.set(row.key, row.ref);
  // Pruning to the checked classes only makes sense at assign time, where
  // unchecking a class must drop its skips; a re-edit has no class picker.
  const excludedStudents = useRosterDefaults
    ? (value.excludedStudents ?? []).filter((ref) =>
        rowByKey.has(studentTargetRefKey(ref))
      )
    : (value.excludedStudents ?? []);
  const excludedKeys = new Set(excludedStudents.map(studentTargetRefKey));
  const candidateKeys = useRosterDefaults
    ? rows.map((row) => row.key)
    : [...refByKey.keys()];
  // On a re-edit the stored snapshot is the only record of who is targeted, so
  // a ref it carries survives even when its override entry was lost in an
  // earlier lossy archive write.
  const priorTargetKeys = new Set(
    value.targetStudents.map(studentTargetRefKey)
  );
  const overridesByKey: Record<string, StudentOverride> = {};
  const withOverride: StudentTargetRef[] = [];
  for (const key of candidateKeys) {
    if (excludedKeys.has(key)) continue;
    const ref = refByKey.get(key);
    if (!ref) continue;
    const row = rowByKey.get(key);
    const override = row
      ? effectiveClassOverride(row, value.overridesByKey, useRosterDefaults)
      : nonEmptyOverride(value.overridesByKey[key]);
    if (override) {
      overridesByKey[key] = override;
      withOverride.push(ref);
    } else if (!useRosterDefaults && priorTargetKeys.has(key)) {
      withOverride.push(ref);
    }
  }
  // `targetMode` stays 'class': the class channel keeps delivering to everyone,
  // including students with no SSO identity. A skip is expressed as an
  // exclusion marker on that student's own pointer doc instead.
  return {
    ...value,
    targetMode: 'class',
    targetStudents: withOverride,
    overridesByKey,
    excludedStudents,
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
  /** Subset of `remove` that is only an un-skip, never a de-targeting. */
  unskipped?: StudentTargetRef[];
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
  classContext?: ClassTargetingContext,
  options?: ExpandClassTargetingOptions
): SetAssignmentTargetsPayload {
  const current = classContext
    ? expandClassTargeting(currentValue, classContext, options)
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

  // Un-skipping: the student left the exclusion list without joining the
  // override set, so nothing else would clear their marker pointer. Deleting it
  // is exactly "no overrides, no pointer"; a student who kept an override is
  // already in `add` and gets the marker rewritten away there.
  const excludedKeys = new Set(excluded.map(studentTargetRefKey));
  const unskipped: StudentTargetRef[] = [];
  for (const ref of previous?.excludedStudents ?? []) {
    const key = studentTargetRefKey(ref);
    if (excludedKeys.has(key) || currRefByKey.has(key)) continue;
    if (remove.some((r) => studentTargetRefKey(r) === key)) continue;
    remove.push(ref);
    unskipped.push(ref);
  }

  return {
    targetMode: current.targetMode,
    add,
    remove,
    overridesBySourcedId,
    ...(excludedChanged ? { excludedTargets: excluded } : {}),
    ...(unskipped.length > 0 ? { unskipped } : {}),
    window,
  };
}

/** True when a payload carries work for `setAssignmentTargetsV1`; class-wide no-ops skip the call. */
export function payloadRequiresCall(
  payload: SetAssignmentTargetsPayload,
  /** True when the assignment already has pointer docs to keep in step. */
  hasExistingPointers = false
): boolean {
  const windowChanged = Object.keys(payload.window).length > 0;
  return (
    payload.targetMode === 'students' ||
    payload.add.length > 0 ||
    payload.remove.length > 0 ||
    Object.keys(payload.overridesBySourcedId).length > 0 ||
    (payload.excludedTargets?.length ?? 0) > 0 ||
    // A window edit must still reach the pointer docs of accommodated or
    // skipped students, which the class channel no longer drives.
    (hasExistingPointers && windowChanged)
  );
}
