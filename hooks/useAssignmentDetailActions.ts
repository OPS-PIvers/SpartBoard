/**
 * useAssignmentDetailActions — save wiring for the Assignments hub detail
 * pane's edit-in-place actions (M17 spec §5 D3): window edits, add/remove
 * students + overrides, and close-early.
 *
 * Writes directly to the owning assignment + session docs (mirroring the
 * per-kind hooks' collection layout, `ASSIGNMENT_COLLECTION_BY_KIND` /
 * `SESSION_COLLECTION_BY_KIND` matching `functions/src/studentAssignmentTargets.ts`)
 * rather than depending on all four assignment hooks — `updateAssignmentSettings`
 * on those hooks types its patch as `Partial<*AssignmentSettings>`, which does
 * not include `openAt`/`closeAt`/`targetStudents` (those live only on the full
 * assignment doc type), so a dedicated writer here avoids widening that
 * contract for a hub-only edit path.
 *
 * `setAssignmentTargetsV1` (M17 §5 A2) is the sole writer of `targetStudents`,
 * `targetMode`, and `overridesByStudentUid` on the assignment doc — this hook
 * never writes those fields itself, only the client-owned
 * `overridesBySourcedId` / `targetGroupIds` / `targetSkippedCount` /
 * `removedStudentRefs` siblings. `overridesBySourcedId` is written per key
 * through a `FieldPath` update (with `deleteField()` for a cleared/removed
 * key), since its keys hold dots and a whole-map replace would strand
 * cleared overrides. The CF is invoked ONLY when targeting
 * actually changed (student add/remove/override diff) or `targetMode` is
 * 'students' — a pure window edit on a class-wide assignment never calls it
 * (spec §3a-G: the class-wide flow stays untouched).
 *
 * Window mirroring: the CF only rewrites a pointer doc's `openAt`/`closeAt`/
 * `dueAt` for students in THIS call's `add` list (see
 * `functions/src/studentAssignmentTargets.ts` — the per-student write loop
 * iterates `admitted`, not the full carried set). `useStudentAssignments`
 * falls back to the session doc's window when a pointer has none
 * (`pointer.openAt ?? base.openAt`), so mirroring the edited window directly
 * onto BOTH the assignment and session docs here is what actually makes a
 * window edit on already-targeted (not newly-added) students take effect —
 * matching Decision 17 r2 (window edits affect not-yet-submitted students
 * only, since already-submitted responses are already recorded and unaffected
 * by a later window change).
 */

import { useCallback } from 'react';
import {
  doc,
  writeBatch,
  arrayUnion,
  deleteField,
  FieldPath,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StudentOverride, StudentTargetRef } from '@/types';
import {
  useSetAssignmentTargets,
  type SkipReason,
} from './useSetAssignmentTargets';
import {
  buildSetAssignmentTargetsPayload,
  expandClassTargeting,
  payloadRequiresCall,
  hasStudentPointers,
  studentTargetRefKey,
  type AssignTargetingValue,
  type ClassTargetingContext,
} from '@/utils/studentTargetRef';
import type {
  AssignmentKind,
  UnifiedAssignmentRow,
} from '@/components/assignmentsHub/useUnifiedAssignments';
import {
  endWritingSession,
  updateWritingSession,
  type UpdateWritingSessionInput,
} from './useWritingAssignmentSessions';

const ASSIGNMENT_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_assignments',
  'video-activity': 'video_activity_assignments',
  'guided-learning': 'guided_learning_assignments',
  'mini-app': 'miniapp_assignments',
  flashcards: 'flashcard_assignments',
  writing: 'writing_assignment_records',
};

const SESSION_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'mini-app': 'mini_app_sessions',
  flashcards: 'flashcard_sessions',
  writing: 'writing_assignment_sessions',
};

export interface SaveAssignmentEditResult {
  skipped: { ref: StudentTargetRef; reason: SkipReason }[];
  /** Subset of `skipped` whose SKIP did not land, so they still see the work. */
  skippedExclusions: { ref: StudentTargetRef; reason: SkipReason }[];
}

export interface UseAssignmentDetailActionsResult {
  /** Reconstructs the row's current `AssignTargetingValue` (spec §5 D3 "previous"). */
  toTargetingValue: (row: UnifiedAssignmentRow) => AssignTargetingValue;
  /** Diffs `next` against the row's current state and saves window + targeting + overrides. */
  saveEdit: (
    row: UnifiedAssignmentRow,
    userId: string,
    next: AssignTargetingValue,
    classContext?: ClassTargetingContext
  ) => Promise<SaveAssignmentEditResult>;
  /** Convenience: sets `closeAt` to now, leaving targeting/overrides untouched. */
  closeNow: (
    row: UnifiedAssignmentRow,
    userId: string,
    classContext?: ClassTargetingContext
  ) => Promise<void>;
}

/** Reconstructs the row's current targeting value — the "previous" side of the D3 diff. */
export function assignmentRowToTargetingValue(
  row: UnifiedAssignmentRow
): AssignTargetingValue {
  const overridesByKey: Record<string, StudentOverride> = {};
  for (const [key, override] of Object.entries(
    row.overridesBySourcedId ?? {}
  )) {
    overridesByKey[key] = override;
  }
  return {
    targetMode: row.targetMode,
    targetStudents: row.targetStudents ?? [],
    targetGroupIds: [],
    overridesByKey,
    excludedStudents: row.excludedTargets ?? [],
    openAt: row.openAt ?? undefined,
    closeAt: row.closeAt ?? undefined,
    dueAt: row.dueAt ?? undefined,
  };
}

/** A Manual due date that moved: class rows still locked at the old due follow it. */
export function dueLockRowCaps(
  row: Pick<UnifiedAssignmentRow, 'dueLocks' | 'dueAt' | 'periodAccess'>,
  window: { dueAt?: number | null }
): Record<string, { closeAt: number | null }> | null {
  if (!row.dueLocks || !('dueAt' in window) || row.dueAt == null) return null;
  const next = window.dueAt ?? null;
  if (next === row.dueAt) return null;
  const caps = Object.fromEntries(
    Object.entries(row.periodAccess ?? {})
      .filter(([, access]) => access.closeAt === row.dueAt)
      .map(([key]) => [key, { closeAt: next }])
  );
  return Object.keys(caps).length > 0 ? caps : null;
}

export function useAssignmentDetailActions(): UseAssignmentDetailActionsResult {
  const { setAssignmentTargets } = useSetAssignmentTargets();

  const saveEdit = useCallback(
    async (
      row: UnifiedAssignmentRow,
      userId: string,
      next: AssignTargetingValue,
      classContext?: ClassTargetingContext
    ): Promise<SaveAssignmentEditResult> => {
      const previous = assignmentRowToTargetingValue(row);
      // Expand once so the assignment doc stores the same snapshot the CF fans
      // out. Roster defaults are NOT re-applied: the stored snapshot is frozen,
      // so a standing accommodation added later never lands retroactively.
      const effective = classContext
        ? expandClassTargeting(next, classContext, { useRosterDefaults: false })
        : next;
      const payload = buildSetAssignmentTargetsPayload(previous, effective);

      // A window edit must still reach the pointer docs this assignment
      // already fanned out, or "Close now" never reaches accommodated students.
      const hasExistingPointers = hasStudentPointers({
        targetStudents: previous.targetStudents,
        excludedTargets: previous.excludedStudents,
      });
      const callCf = payloadRequiresCall(payload, hasExistingPointers);

      let skipped: SaveAssignmentEditResult['skipped'] = [];
      let skippedExclusions: SaveAssignmentEditResult['skipped'] = [];
      if (callCf) {
        const result = await setAssignmentTargets({
          assignmentId: row.id,
          kind: row.kind,
          sessionId: row.sessionId,
          targetMode: payload.targetMode,
          add: payload.add,
          remove: payload.remove,
          overridesBySourcedId: payload.overridesBySourcedId,
          ...(payload.excludedTargets
            ? { excludedTargets: payload.excludedTargets }
            : {}),
          window: payload.window,
        });
        skipped = result.skipped;
        skippedExclusions = result.skippedExclusions ?? [];
      }

      const unskippedKeys = new Set(
        (payload.unskipped ?? []).map(studentTargetRefKey)
      );
      // An un-skip deletes a marker pointer; it is not a de-targeting, so it
      // must never be archived as a removed student.
      const deTargeted = payload.remove.filter(
        (ref) => !unskippedKeys.has(studentTargetRefKey(ref))
      );
      const rowCaps = dueLockRowCaps(row, payload.window);

      // No client writes a Writing session or its record; the server applies the same edit.
      if (row.kind === 'writing') {
        const window: UpdateWritingSessionInput['window'] = {};
        if ('openAt' in payload.window)
          window.openAt = effective.openAt ?? null;
        if ('closeAt' in payload.window)
          window.closeAt = effective.closeAt ?? null;
        if ('dueAt' in payload.window) window.dueAt = effective.dueAt ?? null;
        const overrides: Record<string, StudentOverride | null> = {};
        for (const key of new Set([
          ...Object.keys(previous.overridesByKey),
          ...Object.keys(effective.overridesByKey),
        ]))
          overrides[key] = effective.overridesByKey[key] ?? null;
        await updateWritingSession({
          sessionId: row.sessionId,
          window,
          ...(rowCaps ? { periodAccess: rowCaps } : {}),
          record: {
            targetGroupIds: effective.targetGroupIds,
            overrides,
            ...(payload.excludedTargets
              ? { excludedTargets: payload.excludedTargets }
              : {}),
            ...(callCf ? { targetSkippedCount: skipped.length } : {}),
            ...(deTargeted.length > 0
              ? { removedStudentRefs: deTargeted }
              : {}),
          },
        });
        return { skipped, skippedExclusions };
      }

      const assignmentRef = doc(
        db,
        'users',
        userId,
        ASSIGNMENT_COLLECTION_BY_KIND[row.kind],
        row.id
      );
      const sessionRef = doc(
        db,
        SESSION_COLLECTION_BY_KIND[row.kind],
        row.sessionId
      );

      const assignmentPatch: Record<string, unknown> = {
        updatedAt: Date.now(),
        // Client-owned sibling the CF never writes (spec §2a division of labor).
        // `targetGroupIds` is safe to replace wholesale — it isn't a nested map.
        targetGroupIds: effective.targetGroupIds,
      };
      // Keys can hold dots, so each override is its own FieldPath in an update.
      const overrideKeys = new Set([
        ...Object.keys(previous.overridesByKey),
        ...Object.keys(effective.overridesByKey),
      ]);
      const overrideFields = [...overrideKeys].flatMap((key) => [
        new FieldPath('overridesBySourcedId', key),
        key in effective.overridesByKey
          ? effective.overridesByKey[key]
          : deleteField(),
      ]);
      if (payload.excludedTargets) {
        assignmentPatch.excludedTargets = payload.excludedTargets;
      }
      if (callCf) assignmentPatch.targetSkippedCount = skipped.length;
      if ('openAt' in payload.window)
        assignmentPatch.openAt = effective.openAt ?? null;
      if ('closeAt' in payload.window)
        assignmentPatch.closeAt = effective.closeAt ?? null;
      if ('dueAt' in payload.window)
        assignmentPatch.dueAt = effective.dueAt ?? null;
      if (deTargeted.length > 0) {
        assignmentPatch.removedStudentRefs = arrayUnion(...deTargeted);
      }

      const sessionPatch: Record<string, unknown> = {};
      if ('openAt' in payload.window)
        sessionPatch.openAt = effective.openAt ?? null;
      if ('closeAt' in payload.window)
        sessionPatch.closeAt = effective.closeAt ?? null;
      if ('dueAt' in payload.window)
        sessionPatch.dueAt = effective.dueAt ?? null;
      if (rowCaps) {
        sessionPatch.periodAccess = rowCaps;
        assignmentPatch.periodAccess = rowCaps;
      }

      const batch = writeBatch(db);
      batch.set(assignmentRef, assignmentPatch, { merge: true });
      if (overrideFields.length > 0) {
        const [first, firstValue, ...rest] = overrideFields;
        batch.update(assignmentRef, first as FieldPath, firstValue, ...rest);
      }
      if (Object.keys(sessionPatch).length > 0) {
        batch.set(sessionRef, sessionPatch, { merge: true });
      }
      await batch.commit();

      return { skipped, skippedExclusions };
    },
    [setAssignmentTargets]
  );

  const closeNow = useCallback(
    async (
      row: UnifiedAssignmentRow,
      userId: string,
      classContext?: ClassTargetingContext
    ): Promise<void> => {
      // Writing's close is the teacher's End, which the server stamps on the session and record.
      if (row.kind === 'writing') {
        await endWritingSession(row.sessionId);
        return;
      }
      const current = assignmentRowToTargetingValue(row);
      await saveEdit(
        row,
        userId,
        { ...current, closeAt: Date.now() },
        classContext
      );
    },
    [saveEdit]
  );

  return {
    toTargetingValue: assignmentRowToTargetingValue,
    saveEdit,
    closeNow,
  };
}

// Re-exported for tests that only need the ref-key helper alongside this hook.
export { studentTargetRefKey };
