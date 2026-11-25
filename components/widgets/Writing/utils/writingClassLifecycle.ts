import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { PeriodAccess, WritingAssignmentRecord } from '@/types';
import type {
  AssignmentClassCollections,
  AssignmentLifecycle,
  AssignmentRun,
  AssignmentWriter,
} from '@/hooks/useAssignmentClassActions';
import { closedRow } from '@/hooks/usePeriodAccess';
import type { UseSetAssignmentTargetsResult } from '@/hooks/useSetAssignmentTargets';
import {
  updateWritingSession,
  WRITING_RECORDS_COLLECTION,
} from '@/hooks/useWritingAssignmentSessions';
import { hasStudentPointers } from '@/utils/studentTargetRef';

/** No client writes a Writing session or its record, so every class action goes through `updateWritingSessionV1`. */
export const WRITING_CLASS_WRITER: AssignmentWriter = {
  commit: (sessionId, patch) => updateWritingSession({ sessionId, ...patch }),
  mark: (sessionId, marks) => updateWritingSession({ sessionId, marks }),
  clearWindow: (sessionId, window) =>
    updateWritingSession({ sessionId, window }),
  closeClass: (sessionId, key, closedAt) =>
    updateWritingSession({
      sessionId,
      periodAccess: { [key]: closedRow(closedAt) },
      endIfAllClosed: true,
    }),
  async restore(prev, wasEnded) {
    const rows: Record<string, Partial<PeriodAccess>> = {};
    for (const [k, row] of Object.entries(prev.periodAccess ?? {}))
      rows[k] = {
        state: row.state,
        openAt: row.openAt ?? null,
        closeAt: row.closeAt ?? null,
        ...(row.pausedAt != null ? { pausedAt: row.pausedAt } : {}),
        closedAt: row.closedAt ?? null,
      };
    await updateWritingSession({
      sessionId: prev.id,
      ...(Object.keys(rows).length > 0 ? { periodAccess: rows } : {}),
      ...(wasEnded ? {} : { reopen: true }),
      marks: { closedAt: prev.closedAt ?? null, doneAt: prev.doneAt ?? null },
    });
  },
};

export const WRITING_CLASS_COLLECTIONS = {
  sessionCollection: 'writing_assignment_sessions',
  assignmentCollection: WRITING_RECORDS_COLLECTION,
  refreshIdle: false,
  writer: WRITING_CLASS_WRITER,
} as const satisfies AssignmentClassCollections;

/** Writing's whole-run writes: no run-wide pause, and drafts don't turn in on Close. */
export function writingLifecycle(
  uid: string,
  actions: Pick<UseSetAssignmentTargetsResult, 'setAssignmentTargets'>
): AssignmentLifecycle {
  return {
    end: (id) => updateWritingSession({ sessionId: id, end: true }),
    // The server's reopen clears the record's closedAt and doneAt marks.
    reopen: (id) => updateWritingSession({ sessionId: id, reopen: true }),
    reopenClearsMarks: true,
    isEnded: (a: Pick<AssignmentRun, 'status'>) => a.status === 'ended',
    async onWindowCleared(id, window) {
      try {
        const record = (
          await getDoc(doc(db, 'users', uid, WRITING_RECORDS_COLLECTION, id))
        ).data() as WritingAssignmentRecord | undefined;
        if (!record || !hasStudentPointers(record)) return;
        await actions.setAssignmentTargets({
          assignmentId: id,
          kind: 'writing',
          sessionId: id,
          targetMode: record.targetMode,
          add: [],
          remove: [],
          overridesBySourcedId: {},
          window,
        });
      } catch (err) {
        // A failed pointer sync must not stop Open from letting the class in.
        console.error('[writingLifecycle] Pointer sync failed:', err);
      }
    },
  };
}
