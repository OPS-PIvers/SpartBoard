import { useCallback } from 'react';
import {
  collection,
  doc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import {
  GRADEBOOK_COLLECTIONS,
  gradebookDocId,
  type ActiveFlag,
  type GradebookHistoryField,
  type GradebookMark,
} from '@/utils/gradebook/gradebookCore';
import type {
  GradebookCellData,
  GradebookColumnRef,
} from '@/components/gradebook/popovers/types';
import {
  gradebookUndoStore,
  type UndoMarkSnapshot,
} from './gradebookUndoStore';

// Two writes per cell (mark + history) keep a chunk under the 500-write batch cap.
const CELLS_PER_BATCH = 200;
const MAX_ROSTER_IDS = 20;

type MarkPatch = Partial<
  Pick<
    GradebookMark,
    'override' | 'comment' | 'flags' | 'suppressedAuto' | 'publishOverride'
  >
>;

interface PlannedWrite {
  markId: string;
  before: GradebookMark | null;
  after: GradebookMark;
  field: GradebookHistoryField;
  historyBefore: unknown;
  historyAfter: unknown;
}

export function newBatchId(): string {
  return `gb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function blankMark(
  column: Pick<GradebookColumnRef, 'sessionId' | 'kind'>,
  cell: Pick<GradebookCellData, 'student' | 'row'>,
  rosterId: string,
  ownerUid: string
): GradebookMark {
  const rosterIds = Array.from(
    new Set([rosterId, ...(cell.row?.rosterIds ?? [])])
  ).slice(0, MAX_ROSTER_IDS);
  return {
    kind: column.kind,
    sessionId: column.sessionId,
    studentUid: cell.student.uid,
    ownerUid,
    editorUids: [],
    rosterIds,
    override: null,
    comment: null,
    flags: [],
    suppressedAuto: [],
    publishOverride: null,
    updatedAt: 0,
  };
}

/** Flag toggle for a cell: a manual flag flips, an auto flag is suppressed or restored (D15). */
export function flagPatch(
  mark: GradebookMark,
  flagId: string,
  active: ActiveFlag[]
): MarkPatch {
  const current = active.find((f) => f.id === flagId);
  if (current?.auto) {
    return {
      suppressedAuto: Array.from(new Set([...mark.suppressedAuto, flagId])),
    };
  }
  if (current) {
    return { flags: mark.flags.filter((f) => f !== flagId) };
  }
  return {
    flags: [...mark.flags.filter((f) => f !== flagId), flagId],
    suppressedAuto: mark.suppressedAuto.filter((f) => f !== flagId),
  };
}

/** D21 fill down / D22 fill empty: only unsubmitted, unscored, non-excluded assigned cells. */
export function isFillable(cell: GradebookCellData): boolean {
  if (cell.row && (!cell.row.assigned || cell.row.submittedAt !== null)) {
    return false;
  }
  if (cell.mark?.override) return false;
  const { status, source } = cell.final;
  return status === 'empty' || (status === 'scored' && source === 'flag');
}

/** D22 Mark all Missing: assigned students with no submission and no Missing flag yet. */
export function isMissingCandidate(cell: GradebookCellData): boolean {
  if (cell.row && (!cell.row.assigned || cell.row.submittedAt !== null)) {
    return false;
  }
  if (
    cell.final.status === 'not-assigned' ||
    cell.final.status === 'excluded'
  ) {
    return false;
  }
  return !cell.final.flags.some((f) => f.id === 'missing' && !f.auto);
}

function historyFieldFor(patch: MarkPatch): GradebookHistoryField {
  if ('override' in patch) return 'override';
  if ('comment' in patch) return 'comment';
  if ('publishOverride' in patch) return 'publish';
  return 'flags';
}

function historyValue(
  mark: GradebookMark | null,
  field: GradebookHistoryField
) {
  if (!mark) return null;
  switch (field) {
    case 'override':
    case 'fill':
      return mark.override?.points ?? null;
    case 'comment':
      return mark.comment
        ? { text: mark.comment.text, shared: mark.comment.shared }
        : null;
    case 'publish':
      return mark.publishOverride;
    case 'flags':
      return { flags: mark.flags, suppressedAuto: mark.suppressedAuto };
  }
}

export function useGradebookMarkWrites(rosterId: string) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const commit = useCallback(
    async (
      writes: PlannedWrite[],
      batchId: string | null,
      undoLabel: string | null
    ): Promise<void> => {
      if (!uid) throw new Error('Not authenticated');
      if (writes.length === 0) return;
      const at = Date.now();
      for (let i = 0; i < writes.length; i += CELLS_PER_BATCH) {
        const batch: WriteBatch = writeBatch(db);
        for (const w of writes.slice(i, i + CELLS_PER_BATCH)) {
          const ref = doc(db, GRADEBOOK_COLLECTIONS.marks, w.markId);
          batch.set(ref, { ...w.after, updatedAt: at });
          batch.set(doc(collection(ref, GRADEBOOK_COLLECTIONS.history)), {
            ownerUid: uid,
            byUid: uid,
            at,
            field: w.field,
            before: w.historyBefore,
            after: w.historyAfter,
            batchId,
          });
        }
        await batch.commit();
      }
      if (undoLabel && batchId) {
        const marks: UndoMarkSnapshot[] = writes.map((w) => ({
          markId: w.markId,
          before: w.before,
          after: w.after,
        }));
        gradebookUndoStore.push({ batchId, label: undoLabel, marks });
      }
    },
    [uid]
  );

  const plan = useCallback(
    (
      column: GradebookColumnRef,
      cell: GradebookCellData,
      patch: MarkPatch,
      fieldOverride?: GradebookHistoryField
    ): PlannedWrite | null => {
      if (!uid) return null;
      const before = cell.mark;
      const base = before ?? blankMark(column, cell, rosterId, uid);
      const after: GradebookMark = { ...base, ...patch };
      const field = fieldOverride ?? historyFieldFor(patch);
      return {
        markId: gradebookDocId(column.sessionId, cell.student.uid),
        before,
        after,
        field,
        historyBefore: historyValue(before, field),
        historyAfter: historyValue(after, field),
      };
    },
    [uid, rosterId]
  );

  const single = useCallback(
    async (
      column: GradebookColumnRef,
      cell: GradebookCellData,
      patch: MarkPatch,
      label: string
    ): Promise<string> => {
      const w = plan(column, cell, patch);
      const batchId = newBatchId();
      if (!w) throw new Error('Not authenticated');
      await commit([w], batchId, label);
      return batchId;
    },
    [plan, commit]
  );

  const setOverride = useCallback(
    (
      column: GradebookColumnRef,
      cell: GradebookCellData,
      points: number | null
    ) =>
      single(
        column,
        cell,
        { override: points === null ? null : { points, at: Date.now() } },
        points === null ? 'Revert score' : 'Score override'
      ),
    [single]
  );

  const setComment = useCallback(
    (
      column: GradebookColumnRef,
      cell: GradebookCellData,
      text: string,
      shared: boolean
    ) => {
      const trimmed = text.trim();
      return single(
        column,
        cell,
        { comment: trimmed ? { text: trimmed, shared, at: Date.now() } : null },
        'Comment'
      );
    },
    [single]
  );

  const toggleFlag = useCallback(
    (column: GradebookColumnRef, cell: GradebookCellData, flagId: string) => {
      const base = cell.mark ?? blankMark(column, cell, rosterId, uid ?? '');
      return single(
        column,
        cell,
        flagPatch(base, flagId, cell.final.flags),
        'Flag'
      );
    },
    [single, rosterId, uid]
  );

  const setPublish = useCallback(
    (
      column: GradebookColumnRef,
      cell: GradebookCellData,
      value: GradebookMark['publishOverride']
    ) =>
      single(
        column,
        cell,
        { publishOverride: value },
        value === 'unpublished'
          ? 'Unpublish for student'
          : 'Publish for student'
      ),
    [single]
  );

  const fillEmpty = useCallback(
    async (
      column: GradebookColumnRef,
      cells: GradebookCellData[],
      points: number
    ) => {
      const at = Date.now();
      const writes = cells
        .filter(isFillable)
        .map((c) => plan(column, c, { override: { points, at } }, 'fill'))
        .filter((w): w is PlannedWrite => w !== null);
      const batchId = newBatchId();
      await commit(writes, batchId, `Fill ${writes.length} cells`);
      return { batchId, count: writes.length };
    },
    [plan, commit]
  );

  /** Sets one manual flag on every given cell that lacks it (Mark all Missing, Excuse column). */
  const flagAll = useCallback(
    async (
      column: GradebookColumnRef,
      cells: GradebookCellData[],
      flagId: string,
      label: string
    ) => {
      const writes = cells
        .filter((c) => !(c.mark?.flags ?? []).includes(flagId))
        .map((c) => {
          const base = c.mark ?? blankMark(column, c, rosterId, uid ?? '');
          return plan(column, c, {
            flags: [...base.flags, flagId],
            suppressedAuto: base.suppressedAuto.filter((f) => f !== flagId),
          });
        })
        .filter((w): w is PlannedWrite => w !== null);
      const batchId = newBatchId();
      await commit(writes, batchId, label);
      return { batchId, count: writes.length };
    },
    [plan, commit, rosterId, uid]
  );

  /** Restores every mark a change touched to its prior state, logged as one batch. */
  const undoBatch = useCallback(
    async (batchId?: string): Promise<string | null> => {
      const entry = gradebookUndoStore.take(batchId);
      if (!entry || !uid) return null;
      const writes: PlannedWrite[] = entry.marks.map((m) => {
        const restored: GradebookMark = m.before ?? {
          ...m.after,
          override: null,
          comment: null,
          flags: [],
          suppressedAuto: [],
          publishOverride: null,
        };
        const field = changedField(m.after, restored);
        return {
          markId: m.markId,
          before: m.after,
          after: restored,
          field,
          historyBefore: historyValue(m.after, field),
          historyAfter: historyValue(restored, field),
        };
      });
      await commit(writes, `undo_${entry.batchId}`, null);
      return entry.label;
    },
    [uid, commit]
  );

  return {
    setOverride,
    setComment,
    toggleFlag,
    setPublish,
    fillEmpty,
    flagAll,
    undoBatch,
    undoLast: undoBatch,
  };
}

function changedField(
  a: GradebookMark | null,
  b: GradebookMark
): GradebookHistoryField {
  if ((a?.override?.points ?? null) !== (b.override?.points ?? null))
    return 'override';
  if (
    (a?.comment?.text ?? null) !== (b.comment?.text ?? null) ||
    (a?.comment?.shared ?? null) !== (b.comment?.shared ?? null)
  )
    return 'comment';
  if ((a?.publishOverride ?? null) !== b.publishOverride) return 'publish';
  return 'flags';
}

export type GradebookMarkWrites = ReturnType<typeof useGradebookMarkWrites>;
