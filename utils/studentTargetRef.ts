/** Shared `StudentTargetRef` derivation + key formatting (M17 spec §2a/§5 B1). */

import type {
  ClassRoster,
  Student,
  StudentOverride,
  StudentTargetRef,
} from '@/types';

/** Default 'class'-mode value for `AssignTargetingSection` (spec §5 B3). */
export interface AssignTargetingValue {
  targetMode: 'class' | 'students';
  targetStudents: StudentTargetRef[];
  targetGroupIds: string[];
  overridesByKey: Record<string, StudentOverride>;
  openAt?: number;
  closeAt?: number;
  dueAt?: number;
}

export const EMPTY_ASSIGN_TARGETING_VALUE: AssignTargetingValue = {
  targetMode: 'class',
  targetStudents: [],
  targetGroupIds: [],
  overridesByKey: {},
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
  current: AssignTargetingValue
): SetAssignmentTargetsPayload {
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
  const allKeys = new Set([...prevRefByKey.keys(), ...currRefByKey.keys()]);
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

  return {
    targetMode: current.targetMode,
    add,
    remove,
    overridesBySourcedId,
    window,
  };
}
