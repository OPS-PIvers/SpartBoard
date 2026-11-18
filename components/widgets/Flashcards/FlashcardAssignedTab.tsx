import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  FieldPath,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { CheckCircle2, Monitor, PowerOff, RotateCcw } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type { ClassRoster, FlashcardAssignment } from '@/types';
import {
  AssignedList,
  AssignedRow,
  type ClassActionKind,
  mainActionLabel,
} from '@/components/common/library/assigned';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { useAssignmentClassActions } from '@/hooks/useAssignmentClassActions';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import {
  flashcardAssignedInput,
  flashcardAssignedResponse,
} from '@/utils/assignedAdapters';
import {
  deriveAssignedStatus,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import { BELL_CLOSE_CUSHION_MS, type EpochWindow } from '@/utils/periodPlan';
import { logError } from '@/utils/logError';
import {
  FLASHCARD_CLASS_COLLECTIONS,
  type FlashcardLifecycle,
} from './utils/flashcardClassLifecycle';
import { flashcardAssignmentSubtitle } from './utils/flashcardAssignmentRow';
import {
  FlashcardProgressFixture,
  type FlashcardProgressCount,
} from './utils/flashcardAssignedFixture';

type ProgressCount = FlashcardProgressCount;

export interface FlashcardAssignedHandlers {
  onMonitor: (a: FlashcardAssignment) => void;
  onResults: (a: FlashcardAssignment) => void;
  onPublish: (a: FlashcardAssignment) => void;
  /** The row's other menu items (Settings, Share, scores, Delete). */
  menu: (a: FlashcardAssignment) => LibraryMenuAction[];
}

interface FlashcardAssignedTabProps extends FlashcardAssignedHandlers {
  assignments: FlashcardAssignment[];
  loading: boolean;
  rosters: ClassRoster[];
  lifecycle: FlashcardLifecycle;
  pinnedId?: string | null;
}

const TICK_MS = 30_000;
const PIN_MS = 15 * 60_000;

/** A row still being worked: anything not ended before the Assigned tab handled it (D20). */
const wantsLiveData = (a: FlashcardAssignment) =>
  !(
    a.status === 'ended' &&
    (a.doneAt != null || (!!a.scoreVisibility && a.scoreVisibility !== 'none'))
  ) &&
  (a.status !== 'ended' ||
    a.closedAt != null ||
    Object.values(a.periodAccess ?? {}).some((r) => r.closedAt != null));

function useProgressById(ids: readonly string[]) {
  const fixture = useContext(FlashcardProgressFixture);
  const key = fixture ? '' : ids.join('|');
  const [byId, setById] = useState<Record<string, ProgressCount[]>>({});
  const [subs] = useState(() => new Map<string, () => void>());
  // Subscribes and drops one id at a time, so a new row doesn't restart the others.
  useEffect(() => {
    const wanted = new Set(key ? key.split('|') : []);
    for (const [id, unsub] of subs)
      if (!wanted.has(id)) {
        unsub();
        subs.delete(id);
      }
    for (const id of wanted) {
      if (subs.has(id)) continue;
      subs.set(
        id,
        onSnapshot(
          collection(db, 'flashcard_sessions', id, 'progress'),
          (snap) =>
            setById((prev) => ({
              ...prev,
              [id]: snap.docs.map((d) => ({
                classId: d.get('classId') as string,
                submittedAt: d.get('submittedAt') as number | undefined,
              })),
            })),
          (err) => {
            logError('FlashcardAssignedTab.progress', err, { sessionId: id });
            setById((prev) => ({ ...prev, [id]: [] }));
          }
        )
      );
    }
  }, [key, subs]);
  useEffect(
    () => () => {
      for (const unsub of subs.values()) unsub();
      subs.clear();
    },
    [subs]
  );
  return fixture ?? byId;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);
  return now;
}

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

interface RowModel {
  id: string;
  status: AssignedStatus;
  assignment: FlashcardAssignment;
  bells: Record<string, EpochWindow | null>;
}

/** The Flashcards Assigned tab on the shared row and list (ASSIGNED_TAB.md slice 5). */
export const FlashcardAssignedTab: React.FC<FlashcardAssignedTabProps> = ({
  assignments,
  loading,
  rosters,
  lifecycle,
  pinnedId,
  ...handlers
}) => {
  const { featurePermissions } = useAuth();
  const now = useNow();
  const liveIds = useMemo(
    () => assignments.filter(wantsLiveData).map((a) => a.sessionId || a.id),
    [assignments]
  );
  const progressById = useProgressById(liveIds);

  const rows: RowModel[] = useMemo(
    () =>
      assignments.map((a) => {
        const progress = wantsLiveData(a)
          ? (progressById[a.sessionId || a.id] ?? null)
          : [];
        const bells: Record<string, EpochWindow | null> = {};
        const bellFor = (access: { rosterId?: string }) =>
          todaysBell(access, rosters, featurePermissions, now);
        const sizeOf = (rosterId: string | undefined) => {
          const r = rosters.find((x) => x.id === rosterId);
          return r && r.students.length > 0 ? r.students.length : undefined;
        };
        const classSizes: Record<string, number> = {};
        for (const [k, row] of Object.entries(a.periodAccess ?? {})) {
          bells[k] = bellFor({ rosterId: row.rosterId ?? k });
          const n = sizeOf(row.rosterId ?? k);
          if (n != null) classSizes[k] = n;
        }
        if (a.rosterIds?.length === 1) {
          const n = sizeOf(a.rosterIds[0]);
          if (n != null) classSizes[''] = n;
        }
        const status = deriveAssignedStatus(
          flashcardAssignedInput(a, {
            responses: progress?.map(flashcardAssignedResponse) ?? null,
            // A Check scores itself on submit, so nothing waits for a grade.
            needsGrading: 0,
            classSizes,
            bellFor: (access) => bellFor({ rosterId: access.rosterId }),
          }),
          now
        );
        return { id: a.id, status, assignment: a, bells };
      }),
    [assignments, progressById, rosters, featurePermissions, now]
  );

  // D17: only a just-assigned row that nothing has opened yet sits on top.
  const pinned = rows.find((r) => r.id === pinnedId);
  const freshPin =
    pinned &&
    pinned.assignment.createdAt > now - PIN_MS &&
    pinned.status.classes.every(
      (c) => c.status === 'ready' || c.status === 'scheduled'
    )
      ? pinned.id
      : null;

  return (
    <AssignedList<RowModel>
      items={rows}
      loading={loading}
      pinnedId={freshPin}
      emptyTitle="Nothing assigned yet"
      emptySub="Assign a set from the Library."
      tourWidgetType="flashcards"
      renderRow={(row, index) => (
        <FlashcardAssignedRowHost
          row={row}
          index={index}
          now={now}
          rosters={rosters}
          lifecycle={lifecycle}
          {...handlers}
        />
      )}
    />
  );
};

/** Puts back what Close for all classes or Move to Done changed (D10 Undo). */
async function undoClose(
  prev: FlashcardAssignment,
  uid: string,
  lifecycle: FlashcardLifecycle
): Promise<void> {
  const assignmentRef = doc(
    db,
    'users',
    uid,
    FLASHCARD_CLASS_COLLECTIONS.assignmentCollection,
    prev.id
  );
  const sessionRef = doc(
    db,
    FLASHCARD_CLASS_COLLECTIONS.sessionCollection,
    prev.sessionId || prev.id
  );
  if (prev.status !== 'ended') await lifecycle.reopen(prev.id);
  // Every class row goes back exactly as it was, times and marks included.
  const rows = Object.entries(prev.periodAccess ?? {});
  if (rows.length > 0) {
    const batch = writeBatch(db);
    for (const ref of [sessionRef, assignmentRef])
      for (const [key, row] of rows)
        batch.update(ref, new FieldPath('periodAccess', key), row);
    await batch.commit();
  }
  await updateDoc(assignmentRef, {
    doneAt: prev.doneAt ?? null,
    closedAt: prev.closedAt ?? null,
  });
}

interface RowHostProps extends FlashcardAssignedHandlers {
  row: RowModel;
  index: number;
  now: number;
  rosters: ClassRoster[];
  lifecycle: FlashcardLifecycle;
}

const FlashcardAssignedRowHost: React.FC<RowHostProps> = ({
  row,
  index,
  now,
  rosters,
  lifecycle,
  onMonitor,
  onResults,
  onPublish,
  menu,
}) => {
  const { assignment: a, status, bells } = row;
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const actions = useAssignmentClassActions(
    a,
    FLASHCARD_CLASS_COLLECTIONS,
    lifecycle,
    rosters
  );
  const run = usePeriodRunner(a.periodAccess, 'FlashcardAssignedTab.class');
  const [busy, setBusy] = useState(false);
  const exec = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run(fn);
    } finally {
      setBusy(false);
    }
  };
  const title = a.setTitle || 'Untitled set';
  const study = a.kind !== 'check';

  const onClassAction = (kind: ClassActionKind, key: string | null) => {
    switch (kind) {
      case 'open':
      case 'resume':
        return void exec(() => actions.openClass(key));
      case 'pause':
        return void exec(() => actions.pauseClass(key));
      case 'close':
        return void exec(() => actions.closeClass(key));
      case 'reopen':
        return void exec(() => actions.reopenClass(key));
      case 'monitor':
        return onMonitor(a);
    }
  };

  const withUndo = (act: () => Promise<void>, message: string) => {
    const prev = a;
    void exec(async () => {
      await act();
      addToast(message, 'success', {
        label: 'Undo',
        onClick: () => {
          if (!user?.uid) return;
          const uid = user.uid;
          void run(() => undoClose(prev, uid, lifecycle));
        },
      });
    });
  };

  const allClosed = status.classes.every((c) => c.status === 'closed');
  // Flashcards has no run-wide pause, so a single line offers Close and Reopen only.
  const singleLineItems: LibraryMenuAction[] = [];
  if (status.singleLine) {
    if (!allClosed)
      singleLineItems.push({
        id: 'assigned-close',
        label: 'Close',
        icon: PowerOff,
        onClick: () =>
          withUndo(() => actions.closeAll(), `${title} is closed.`),
      });
    else if (status.bucket === 'active')
      singleLineItems.push({
        id: 'assigned-reopen',
        label: 'Reopen',
        icon: RotateCcw,
        onClick: () => onClassAction('reopen', null),
      });
  }
  const lifecycleItems: LibraryMenuAction[] = [];
  if (!status.singleLine && !allClosed)
    lifecycleItems.push({
      id: 'assigned-close-all',
      label: 'Close for all classes',
      icon: PowerOff,
      anchor: tourTypeAttr('library-shell.assigned-close-all', 'flashcards'),
      onClick: () =>
        withUndo(
          () => actions.closeAll(),
          `${title} is closed for all classes.`
        ),
    });
  if (status.bucket === 'active')
    lifecycleItems.push({
      id: 'assigned-move-to-done',
      label: 'Move to Done',
      icon: CheckCircle2,
      anchor: tourTypeAttr('library-shell.assigned-move-to-done', 'flashcards'),
      onClick: () =>
        withUndo(() => actions.moveToDone(), `${title} moved to Done.`),
    });
  const today = menu(a);
  // D7: Monitor is always one menu row away, and opening it changes nothing.
  today.unshift({
    id: 'monitor',
    label: 'Monitor',
    icon: Monitor,
    onClick: () => onMonitor(a),
  });
  for (const item of [...singleLineItems, ...lifecycleItems])
    item.disabled = busy;
  const firstDestructive = today.findIndex((m) => m.destructive);
  const menuActions =
    firstDestructive < 0
      ? [...singleLineItems, ...today, ...lifecycleItems]
      : [
          ...singleLineItems,
          ...today.slice(0, firstDestructive),
          ...lifecycleItems,
          ...today.slice(firstDestructive),
        ];

  const onMain = () => {
    const { kind, classKey } = status.action;
    switch (kind) {
      case 'open':
      case 'resume':
        return onClassAction(kind, classKey);
      case 'monitor':
        return onMonitor(a);
      case 'publish':
        return onPublish(a);
      default:
        return onResults(a);
    }
  };

  const endsAtBell = Object.values(a.periodAccess ?? {}).some(
    (r) => r.bellPeriodId != null
  );
  const footer = [
    flashcardAssignmentSubtitle(a),
    endsAtBell
      ? 'Closes at the end of each class'
      : 'Stays open until you close it',
    `Assigned ${new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
  ];

  return (
    <AssignedRow
      title={title}
      status={status}
      nowMs={now}
      mainLabel={mainActionLabel(status.action, 0)}
      onMain={onMain}
      onClassAction={onClassAction}
      showCounts={!study}
      bellLabel={(c) => {
        const w = bells[c.key];
        return w
          ? `${fmtTime(w.openAt)} to ${fmtTime(w.closeAt - BELL_CLOSE_CUSHION_MS)}`
          : null;
      }}
      footer={footer}
      menuActions={menuActions}
      busy={busy}
      tourIndex={index}
      tourWidgetType="flashcards"
    />
  );
};
