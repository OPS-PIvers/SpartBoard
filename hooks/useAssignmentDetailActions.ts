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
 * `removedStudentRefs` siblings. `overridesBySourcedId` is written as
 * per-key dot-path fields (with `deleteField()` for a cleared/removed key),
 * never as a whole-map replace — Firestore's set-with-merge recurses into
 * nested maps key-by-key, so a whole-map replace would leave a cleared
 * override stranded on the doc forever. The CF is invoked ONLY when targeting
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
import { doc, writeBatch, arrayUnion, deleteField } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StudentOverride, StudentTargetRef } from '@/types';
import {
  useSetAssignmentTargets,
  type SkipReason,
} from './useSetAssignmentTargets';
import {
  buildSetAssignmentTargetsPayload,
  studentTargetRefKey,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type {
  AssignmentKind,
  UnifiedAssignmentRow,
} from '@/components/assignmentsHub/useUnifiedAssignments';

const ASSIGNMENT_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_assignments',
  'video-activity': 'video_activity_assignments',
  'guided-learning': 'guided_learning_assignments',
  'mini-app': 'miniapp_assignments',
};

const SESSION_COLLECTION_BY_KIND: Record<AssignmentKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  'mini-app': 'mini_app_sessions',
};

export interface SaveAssignmentEditResult {
  skipped: { ref: StudentTargetRef; reason: SkipReason }[];
}

export interface UseAssignmentDetailActionsResult {
  /** Reconstructs the row's current `AssignTargetingValue` (spec §5 D3 "previous"). */
  toTargetingValue: (row: UnifiedAssignmentRow) => AssignTargetingValue;
  /** Diffs `next` against the row's current state and saves window + targeting + overrides. */
  saveEdit: (
    row: UnifiedAssignmentRow,
    userId: string,
    next: AssignTargetingValue
  ) => Promise<SaveAssignmentEditResult>;
  /** Convenience: sets `closeAt` to now, leaving targeting/overrides untouched. */
  closeNow: (row: UnifiedAssignmentRow, userId: string) => Promise<void>;
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
    openAt: row.openAt ?? undefined,
    closeAt: row.closeAt ?? undefined,
  };
}

export function useAssignmentDetailActions(): UseAssignmentDetailActionsResult {
  const { setAssignmentTargets } = useSetAssignmentTargets();

  const saveEdit = useCallback(
    async (
      row: UnifiedAssignmentRow,
      userId: string,
      next: AssignTargetingValue
    ): Promise<SaveAssignmentEditResult> => {
      const previous = assignmentRowToTargetingValue(row);
      const payload = buildSetAssignmentTargetsPayload(previous, next);

      const targetingChanged =
        payload.add.length > 0 ||
        payload.remove.length > 0 ||
        Object.keys(payload.overridesBySourcedId).length > 0;
      const callCf = targetingChanged || next.targetMode === 'students';

      let skipped: SaveAssignmentEditResult['skipped'] = [];
      if (callCf) {
        const result = await setAssignmentTargets({
          assignmentId: row.id,
          kind: row.kind,
          sessionId: row.sessionId,
          targetMode: payload.targetMode,
          add: payload.add,
          remove: payload.remove,
          overridesBySourcedId: payload.overridesBySourcedId,
          window: payload.window,
        });
        skipped = result.skipped;
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
        targetGroupIds: next.targetGroupIds,
      };
      // `overridesBySourcedId` is a nested map: Firestore's set-with-merge
      // recurses into maps key-by-key, so a whole-map replace here would leave
      // a cleared override or a removed student's key stranded in the stored
      // doc forever. Write each key as its own dot-path field instead, and
      // `deleteField()` any key present in `previous` but absent from `next`.
      const overrideKeys = new Set([
        ...Object.keys(previous.overridesByKey),
        ...Object.keys(next.overridesByKey),
      ]);
      for (const key of overrideKeys) {
        assignmentPatch[`overridesBySourcedId.${key}`] =
          key in next.overridesByKey ? next.overridesByKey[key] : deleteField();
      }
      if (callCf) assignmentPatch.targetSkippedCount = skipped.length;
      if ('openAt' in payload.window)
        assignmentPatch.openAt = next.openAt ?? null;
      if ('closeAt' in payload.window)
        assignmentPatch.closeAt = next.closeAt ?? null;
      if ('dueAt' in payload.window) assignmentPatch.dueAt = next.dueAt ?? null;
      if (payload.remove.length > 0) {
        assignmentPatch.removedStudentRefs = arrayUnion(...payload.remove);
      }

      const sessionPatch: Record<string, unknown> = {};
      if ('openAt' in payload.window) sessionPatch.openAt = next.openAt ?? null;
      if ('closeAt' in payload.window)
        sessionPatch.closeAt = next.closeAt ?? null;
      if ('dueAt' in payload.window) sessionPatch.dueAt = next.dueAt ?? null;

      const batch = writeBatch(db);
      batch.set(assignmentRef, assignmentPatch, { merge: true });
      if (Object.keys(sessionPatch).length > 0) {
        batch.set(sessionRef, sessionPatch, { merge: true });
      }
      await batch.commit();

      return { skipped };
    },
    [setAssignmentTargets]
  );

  const closeNow = useCallback(
    async (row: UnifiedAssignmentRow, userId: string): Promise<void> => {
      const current = assignmentRowToTargetingValue(row);
      await saveEdit(row, userId, { ...current, closeAt: Date.now() });
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
