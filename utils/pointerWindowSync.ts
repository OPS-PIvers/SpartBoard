import {
  deleteField,
  doc,
  FieldPath,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StudentOverride, StudentTargetRef } from '@/types';
import type {
  AssignmentTargetKind,
  SetAssignmentTargetsCallResult,
  UseSetAssignmentTargetsResult,
} from '@/hooks/useSetAssignmentTargets';
import {
  hasStudentPointers,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';

/** Which per-student window shifts to drop: every close, only expired closes, and starts still ahead. */
export interface StaleWindowRule {
  closeAt: 'all' | 'expired' | 'keep';
  futureOpenAt: boolean;
}

/** The assignment row fields the sync reads. */
export interface PointerWindowRow {
  targetMode?: 'class' | 'students';
  targetStudents?: StudentTargetRef[] | null;
  excludedTargets?: StudentTargetRef[] | null;
  overridesBySourcedId?: Record<string, StudentOverride>;
  sessionId?: string;
}

/** Per-student window shifts that would still hold a student out once the teacher opens the run; null clears the override. */
export function staleWindowOverrides(
  assignment: Pick<PointerWindowRow, 'overridesBySourcedId' | 'targetStudents'>,
  rule: StaleWindowRule,
  now: number
): Record<string, StudentOverride | null> {
  const targeted = new Set(
    (assignment.targetStudents ?? []).map(studentTargetRefKey)
  );
  const out: Record<string, StudentOverride | null> = {};
  for (const [key, override] of Object.entries(
    assignment.overridesBySourcedId ?? {}
  )) {
    if (!targeted.has(key) || !override) continue;
    const next: StudentOverride = { ...override };
    const close = next.closeAt;
    if (
      typeof close === 'number' &&
      (rule.closeAt === 'all' || (rule.closeAt === 'expired' && close <= now))
    )
      delete next.closeAt;
    if (
      rule.futureOpenAt &&
      typeof next.openAt === 'number' &&
      next.openAt > now
    )
      delete next.openAt;
    if (next.closeAt === override.closeAt && next.openAt === override.openAt)
      continue;
    out[key] = Object.keys(next).length > 0 ? next : null;
  }
  return out;
}

/** The rule for a cleared run window: a cleared close drops every student close, a cleared open drops later starts. */
export function clearedWindowRule(patch: {
  openAt?: null;
  closeAt?: null;
}): StaleWindowRule {
  return {
    closeAt: 'closeAt' in patch ? 'all' : 'keep',
    futureOpenAt: 'openAt' in patch,
  };
}

/** Flag `student-windows`: a lifecycle also drops per-student shifts that would hold a student out. */
export interface StudentWindowsOption {
  studentWindows?: boolean;
}

export interface PointerWindowSyncTarget {
  /** The teacher who owns the row. */
  uid: string;
  kind: AssignmentTargetKind;
  assignmentCollection: string;
  assignmentId: string;
  /** Flashcards and Mini Apps run under the row's own session id; the rest share the assignment id. */
  sessionIdOnRow?: boolean;
  /** The row as the caller last saw it, used when the stored one can't be read. */
  fallback?: PointerWindowRow | null;
}

/**
 * Brings targeted students' pointer windows in step with the run's: the cleared run window rides
 * along, and with a rule, per-student shifts that would still hold a student out are dropped.
 */
export async function syncPointerWindows(
  setAssignmentTargets: UseSetAssignmentTargetsResult['setAssignmentTargets'],
  target: PointerWindowSyncTarget,
  patch: { openAt?: number | null; closeAt?: number | null } | null,
  rule: StaleWindowRule | null
): Promise<void> {
  // A failed pointer sync must not stop Open from letting the class in.
  try {
    const ref = doc(
      db,
      'users',
      target.uid,
      target.assignmentCollection,
      target.assignmentId
    );
    const stored = (await getDoc(ref)).data() as PointerWindowRow | undefined;
    const row = stored ?? target.fallback ?? undefined;
    if (!row || !hasStudentPointers(row)) return;
    const sessionId = target.sessionIdOnRow
      ? row.sessionId
      : target.assignmentId;
    if (!sessionId) return;
    const stale = rule ? staleWindowOverrides(row, rule, Date.now()) : {};
    if (!patch && Object.keys(stale).length === 0) return;
    const call = (
      overridesBySourcedId: Record<string, StudentOverride | null>,
      window: { openAt?: number | null; closeAt?: number | null }
    ) =>
      setAssignmentTargets({
        assignmentId: target.assignmentId,
        kind: target.kind,
        sessionId,
        targetMode: row.targetMode,
        add: [],
        remove: [],
        overridesBySourcedId,
        window,
      });
    const skippedKeys = (result: SetAssignmentTargetsCallResult | undefined) =>
      new Set(
        (result?.skipped ?? [])
          .filter((s) => s.reason === 'malformed-override')
          .map((s) => studentTargetRefKey(s.ref))
      );
    let missed = skippedKeys(await call(stale, patch ?? {}));
    // An override left with nothing the server keeps is cleared outright, so its old close can't win.
    if (missed.size > 0)
      missed = skippedKeys(
        await call(
          Object.fromEntries([...missed].map((key) => [key, null])),
          {}
        )
      );
    // Mirror only what reached the pointers, so a later Open still sees the rest as stale.
    const applied = Object.entries(stale).filter(([key]) => !missed.has(key));
    const fields = applied.flatMap(([key, value]) => [
      new FieldPath('overridesBySourcedId', key),
      value ?? deleteField(),
    ]);
    if (fields.length > 0) {
      const [first, firstValue, ...rest] = fields;
      await updateDoc(ref, first as FieldPath, firstValue, ...rest);
    }
  } catch (err) {
    console.error('Pointer window sync failed', err);
  }
}
