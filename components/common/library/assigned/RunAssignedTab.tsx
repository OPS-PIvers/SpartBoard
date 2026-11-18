import React, { useContext, useEffect, useState } from 'react';
import {
  collection,
  doc,
  FieldPath,
  onSnapshot,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { CheckCircle2, Pause, Play, PowerOff, RotateCcw } from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type { ClassRoster } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import {
  useAssignmentClassActions,
  type AssignmentClassCollections,
  type AssignmentLifecycle,
  type AssignmentRun,
} from '@/hooks/useAssignmentClassActions';
import {
  deriveAssignedStatus,
  runStatus,
  scoresShown,
  type AssignedExtras,
  type AssignedInput,
  type AssignedResponse,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import { BELL_CLOSE_CUSHION_MS, type EpochWindow } from '@/utils/periodPlan';
import { logError } from '@/utils/logError';
import type { LibraryMenuAction } from '../types';
import { AssignedList } from './AssignedList';
import { AssignedRow } from './AssignedRow';
import { RunAssignedResponsesFixture } from './runAssignedFixture';
import {
  mainActionLabel,
  statusLineSegments,
  type ClassActionKind,
  type LineSegment,
} from './assignedWording';

/** An assignment of a kind whose teacher writes its session directly (Mini Apps, Guided Learning). */
export interface RunAssignment extends AssignmentRun {
  createdAt: number;
  rosterIds?: string[];
  scoreVisibility?: string | null;
}

export interface RunAssignedTabProps<A extends RunAssignment> {
  assignments: readonly A[];
  loading: boolean;
  rosters: readonly ClassRoster[];
  collections: AssignmentClassCollections;
  /** Null until the teacher is signed in. */
  lifecycle: AssignmentLifecycle | null;
  tourWidgetType: string;
  emptyTitle: string;
  emptySub: string;
  title: (a: A) => string;
  viewOnly: (a: A) => boolean;
  toInput: (a: A, extras: AssignedExtras) => AssignedInput;
  /** The responses collection path for a row. */
  responsesPath: (a: A) => string;
  toResponses: (a: A, docs: DocumentData[]) => AssignedResponse[];
  /** False where responses carry no class, so per-class counts stay hidden. */
  classCounts?: (a: A) => boolean;
  onMonitor?: (a: A) => void;
  onResults?: (a: A) => void;
  onPublish?: (a: A) => void;
  /** The main button where the kind has nothing better: Copy link for a share. */
  fallbackPrimary: (a: A) => { label: string; onClick: () => void } | null;
  /** Today's overflow items; `replacedMenuIds` are dropped for the class actions. */
  menu: (a: A) => LibraryMenuAction[];
  replacedMenuIds: readonly string[];
  /** Shown under the Active and Done sections, e.g. a Show older button. */
  footer?: React.ReactNode;
}

const TICK_MS = 30_000;
const PIN_MS = 15 * 60_000;

/** A row still being worked: anything not ended before the Assigned tab handled it (D20). */
function wantsLiveData(a: RunAssignment, viewOnly: boolean): boolean {
  if (viewOnly) return false;
  const ended = runStatus(a.status) === 'inactive';
  if (!ended) return true;
  if (a.doneAt != null || scoresShown(a.scoreVisibility)) return false;
  return (
    a.closedAt != null ||
    Object.values(a.periodAccess ?? {}).some((r) => r.closedAt != null)
  );
}

function useRunResponses<A extends RunAssignment>(
  live: readonly A[],
  pathOf: (a: A) => string,
  toResponses: (a: A, docs: DocumentData[]) => AssignedResponse[]
): Record<string, readonly AssignedResponse[] | null> {
  const fixture = useContext(RunAssignedResponsesFixture);
  const key = fixture ? '' : live.map((a) => `${a.id}=${pathOf(a)}`).join('|');
  const [raw, setRaw] = useState<Record<string, DocumentData[]>>({});
  const [subs] = useState(() => new Map<string, () => void>());
  // Subscribes and drops one row at a time, so a new row doesn't restart the others.
  useEffect(() => {
    const wanted = new Map(
      (key ? key.split('|') : []).map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at), pair.slice(at + 1)] as const;
      })
    );
    for (const [id, unsub] of subs)
      if (!wanted.has(id)) {
        unsub();
        subs.delete(id);
      }
    for (const [id, path] of wanted) {
      if (subs.has(id)) continue;
      subs.set(
        id,
        onSnapshot(
          collection(db, path),
          (snap) =>
            setRaw((prev) => ({
              ...prev,
              [id]: snap.docs.map((d) => d.data()),
            })),
          (err) => {
            logError('RunAssignedTab.responses', err, { assignmentId: id });
            setRaw((prev) => ({ ...prev, [id]: [] }));
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
  if (fixture) return fixture;
  const out: Record<string, readonly AssignedResponse[] | null> = {};
  for (const a of live) {
    const docs = raw[a.id];
    out[a.id] = docs ? toResponses(a, docs) : null;
  }
  return out;
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

interface RowModel<A> {
  id: string;
  status: AssignedStatus;
  assignment: A;
  bells: Record<string, EpochWindow | null>;
}

/** The Assigned tab for a kind driven by `useAssignmentClassActions` (ASSIGNED_TAB.md slice 5). */
export function RunAssignedTab<A extends RunAssignment>(
  props: RunAssignedTabProps<A>
): React.ReactElement {
  const {
    assignments,
    loading,
    rosters,
    tourWidgetType,
    emptyTitle,
    emptySub,
    viewOnly,
    toInput,
    responsesPath,
    toResponses,
    footer,
  } = props;
  const { featurePermissions } = useAuth();
  const now = useNow();
  const live = assignments.filter((a) => wantsLiveData(a, viewOnly(a)));
  const responsesById = useRunResponses(live, responsesPath, toResponses);

  const rows: RowModel<A>[] = assignments.map((a) => {
    const responses = wantsLiveData(a, viewOnly(a))
      ? (responsesById[a.id] ?? null)
      : [];
    const bellFor = (access: { rosterId?: string }) =>
      todaysBell(access, rosters, featurePermissions, now);
    const sizeOf = (rosterId: string | undefined) => {
      const r = rosters.find((x) => x.id === rosterId);
      return r && r.students.length > 0 ? r.students.length : undefined;
    };
    const bells: Record<string, EpochWindow | null> = {};
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
      // Neither kind has teacher-graded work.
      toInput(a, { responses, needsGrading: 0, classSizes, bellFor }),
      now
    );
    return { id: a.id, status, assignment: a, bells };
  });

  // D17: a just-assigned row that nothing has opened yet sits on top.
  const fresh = rows
    .filter(
      (r) =>
        r.assignment.createdAt > now - PIN_MS &&
        r.status.bucket === 'active' &&
        r.status.classes.every(
          (c) => c.status === 'ready' || c.status === 'scheduled'
        )
    )
    .sort((a, b) => b.assignment.createdAt - a.assignment.createdAt)[0];

  return (
    <div className="flex flex-col">
      <AssignedList<RowModel<A>>
        items={rows}
        loading={loading}
        pinnedId={fresh?.id ?? null}
        emptyTitle={emptyTitle}
        emptySub={emptySub}
        tourWidgetType={tourWidgetType}
        renderRow={(row, index) => (
          <RunAssignedRowHost<A> row={row} index={index} now={now} {...props} />
        )}
      />
      {footer}
    </div>
  );
}

/** Puts back what Close for all classes or Move to Done changed (D10 Undo). */
async function undoClose(
  prev: RunAssignment,
  uid: string,
  collections: AssignmentClassCollections,
  lifecycle: AssignmentLifecycle,
  wasEnded: boolean
): Promise<void> {
  const assignmentRef = doc(
    db,
    'users',
    uid,
    collections.assignmentCollection,
    prev.id
  );
  const sessionRef = doc(
    db,
    collections.sessionCollection,
    prev.sessionId ?? prev.id
  );
  if (!wasEnded) {
    await lifecycle.reopen(prev.id);
    if (runStatus(prev.status) === 'active' && lifecycle.resume)
      await lifecycle.resume(prev.id);
  }
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

const NO_LIFECYCLE: AssignmentLifecycle = {
  end: () => Promise.reject(new Error('Sign in to change this.')),
  reopen: () => Promise.reject(new Error('Sign in to change this.')),
};

function RunAssignedRowHost<A extends RunAssignment>({
  row,
  index,
  now,
  rosters,
  collections,
  lifecycle: lifecycleProp,
  tourWidgetType,
  title: titleOf,
  viewOnly: viewOnlyOf,
  classCounts,
  onMonitor,
  onResults,
  onPublish,
  fallbackPrimary,
  menu,
  replacedMenuIds,
}: RunAssignedTabProps<A> & {
  row: RowModel<A>;
  index: number;
  now: number;
}): React.ReactElement {
  const { assignment: a, status, bells } = row;
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const lifecycle = lifecycleProp ?? NO_LIFECYCLE;
  const actions = useAssignmentClassActions(a, collections, lifecycle, rosters);
  const run = usePeriodRunner(a.periodAccess, 'RunAssignedTab.class');
  const [busy, setBusy] = useState(false);
  const exec = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run(fn);
    } finally {
      setBusy(false);
    }
  };
  const title = titleOf(a);
  const viewOnly = viewOnlyOf(a);
  const isEnded = (x: A) =>
    lifecycle.isEnded
      ? lifecycle.isEnded(x)
      : runStatus(x.status) === 'inactive';
  const monitor = onMonitor ?? onResults;

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
        return monitor?.(a);
    }
  };

  const withUndo = (act: () => Promise<void>, message: string) => {
    const prev = a;
    const wasEnded = isEnded(a);
    void exec(async () => {
      await act();
      addToast(message, 'success', {
        label: 'Undo',
        onClick: () => {
          if (!user?.uid) return;
          const uid = user.uid;
          void run(() =>
            undoClose(prev, uid, collections, lifecycle, wasEnded)
          );
        },
      });
    });
  };

  const allClosed = status.classes.every((c) => c.status === 'closed');
  const singleItems: LibraryMenuAction[] = [];
  if (status.singleLine) {
    const only = status.classes[0];
    // A whole-run pause exists only where the kind has one.
    if (!viewOnly && only?.status === 'open' && lifecycle.pause)
      singleItems.push({
        id: 'assigned-pause',
        label: 'Pause',
        icon: Pause,
        onClick: () => onClassAction('pause', null),
      });
    if (
      !viewOnly &&
      only?.status === 'paused' &&
      status.action.kind !== 'resume'
    )
      singleItems.push({
        id: 'assigned-resume',
        label: 'Resume',
        icon: Play,
        onClick: () => onClassAction('resume', null),
      });
    if (!allClosed)
      singleItems.push({
        id: 'assigned-close',
        label: 'Close',
        icon: PowerOff,
        onClick: () =>
          withUndo(
            () => actions.closeAll(),
            viewOnly ? 'Share closed.' : `${title} is closed.`
          ),
      });
    else if (status.bucket === 'active' || viewOnly)
      singleItems.push({
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
      anchor: tourTypeAttr('library-shell.assigned-close-all', tourWidgetType),
      onClick: () =>
        withUndo(
          () => actions.closeAll(),
          `${title} is closed for all classes.`
        ),
    });
  if (status.bucket === 'active' && !viewOnly)
    lifecycleItems.push({
      id: 'assigned-move-to-done',
      label: 'Move to Done',
      icon: CheckCircle2,
      anchor: tourTypeAttr(
        'library-shell.assigned-move-to-done',
        tourWidgetType
      ),
      onClick: () =>
        withUndo(() => actions.moveToDone(), `${title} moved to Done.`),
    });
  for (const item of [...singleItems, ...lifecycleItems]) item.disabled = busy;
  const replaced = new Set(replacedMenuIds);
  const today = menu(a).filter((m) => !replaced.has(m.id));
  const firstDestructive = today.findIndex((m) => m.destructive);
  const menuActions =
    firstDestructive < 0
      ? [...singleItems, ...today, ...lifecycleItems]
      : [
          ...singleItems,
          ...today.slice(0, firstDestructive),
          ...lifecycleItems,
          ...today.slice(firstDestructive),
        ];

  // D16: the link is still the thing to do while a share runs.
  const fallback = fallbackPrimary(a);
  const { kind, classKey } = status.action;
  const handlerFor = (): (() => void) | null => {
    switch (kind) {
      case 'open':
      case 'resume':
        return () => onClassAction(kind, classKey);
      case 'monitor':
        return monitor ? () => monitor(a) : null;
      case 'publish': {
        const publish = onPublish ?? onResults;
        return publish ? () => publish(a) : null;
      }
      case 'choose-class':
        return () => undefined;
      default:
        return onResults ? () => onResults(a) : null;
    }
  };
  const derived = viewOnly ? null : handlerFor();
  const useFallback = !derived && (!viewOnly || !allClosed);
  const mainLabel = derived
    ? mainActionLabel(status.action, 0)
    : useFallback
      ? (fallback?.label ?? null)
      : null;
  const onMain = derived ?? (() => fallback?.onClick());

  // Responses that carry no class can't be counted per class, so the line shows the total.
  const counts = classCounts ? classCounts(a) : true;
  const submitted = status.classes.reduce((n, c) => n + c.submitted, 0);
  // Published rows skip the responses listener, so the line reads the doc.
  const lineOverride: LineSegment[] | undefined =
    status.bucket === 'done' && scoresShown(a.scoreVisibility) && !viewOnly
      ? [{ text: 'Scores published', tone: 'plain' }]
      : !counts && !status.singleLine && !viewOnly
        ? (() => {
            const segs = statusLineSegments(status, now).filter(
              (s) => !s.glued
            );
            return submitted > 0 &&
              status.classes.some((c) => c.status !== 'ready')
              ? [...segs, { text: `${submitted} turned in`, tone: 'plain' }]
              : segs;
          })()
        : undefined;

  const endsAtBell = Object.values(a.periodAccess ?? {}).some(
    (r) => r.bellPeriodId != null
  );
  const footer = [
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
      mainLabel={mainLabel}
      onMain={onMain}
      lineOverride={lineOverride}
      onClassAction={onClassAction}
      classCounts={counts}
      mainTone={derived ? undefined : 'monitor'}
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
      tourWidgetType={tourWidgetType}
    />
  );
}
