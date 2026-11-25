import React, { useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useShowPickedStudents } from '@/hooks/useShowPickedStudents';
import { useDashboard } from '@/context/useDashboard';
import type { ClassRoster, StudentTargetRef } from '@/types';
import {
  pickedClassSizes,
  pickedStudents,
  type PickedStudents,
} from '@/utils/assignedStudents';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import {
  restoreRun,
  useAssignmentClassActions,
  type AssignmentClassCollections,
  type AssignmentLifecycle,
  type AssignmentRun,
} from '@/hooks/useAssignmentClassActions';
import {
  deriveAssignedStatus,
  runStatus,
  scoresShown,
  type AssignedClass,
  type AssignedExtras,
  type AssignedInput,
  type AssignedResponse,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import { BELL_CLOSE_CUSHION_MS, type EpochWindow } from '@/utils/periodPlan';
import { logError } from '@/utils/logError';
import type { LibraryMenuAction } from '../types';
import { AssignedList } from './AssignedList';
import { AssignedLeftOpenFlag } from './AssignedLeftOpenFlag';
import { AssignedRow } from './AssignedRow';
import { AssignedReopenDialog } from './AssignedReopenDialog';
import { assignedMenu } from './assignedMenu';
import { useAssignedBulkOps } from './assignedBulkContext';
import { RunAssignedResponsesFixture } from './runAssignedFixture';
import {
  detailText,
  mainActionLabel,
  type ClassActionKind,
} from './assignedWording';

/** An assignment of a kind whose teacher writes its session directly (Mini Apps, Guided Learning). */
export interface RunAssignment extends AssignmentRun {
  createdAt: number;
  rosterIds?: string[];
  scoreVisibility?: string | null;
  targetMode?: 'class' | 'students';
  targetStudents?: StudentTargetRef[];
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
  /** Today's flat overflow items; `assignedMenu` keeps what fits the row (R6). */
  menu: (a: A) => LibraryMenuAction[];
  replacedMenuIds: readonly string[];
  /** Shown under the Active and Finished sections, e.g. a Show older button. */
  footer?: React.ReactNode;
  /** False where the row never publishes scores; defaults to true. */
  publishes?: (a: A) => boolean;
  /** Reads a stored row as the tab should, e.g. a close time that has passed as ended. */
  normalize?: (a: A, nowMs: number) => A;
  /** False where students never turn anything in (Flashcards study), so no counts show. */
  submits?: (a: A) => boolean;
  /** A first footer line naming the row's kind, e.g. "Check · Test". */
  footerLead?: (a: A) => string | null;
  /** Deletes without asking; resolves to how many failed. Turns on bulk select. */
  onBulkDelete?: (assignments: A[]) => Promise<number>;
  /** Opens the publish dialog once for the picked closed rows. */
  onBulkPublish?: (assignments: A[]) => void;
}

const TICK_MS = 30_000;
const PIN_MS = 15 * 60_000;

/** A row still being worked: anything not ended before the Assigned tab handled it (D20). */
function wantsLiveData(
  a: RunAssignment,
  viewOnly: boolean,
  publishes: boolean
): boolean {
  if (viewOnly) return false;
  const ended = runStatus(a.status) === 'inactive';
  if (!ended) return true;
  // An ended row with nothing to publish is Done once closed, so it needs no count.
  if (!publishes || a.doneAt != null || scoresShown(a.scoreVisibility))
    return false;
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
  viewOnly: boolean;
  published: boolean;
  picked: PickedStudents | null;
}

/** The Assigned tab for a kind driven by `useAssignmentClassActions` (ASSIGNED_TAB.md slice 5). */
export function RunAssignedTab<A extends RunAssignment>(
  props: RunAssignedTabProps<A>
): React.ReactElement {
  const {
    assignments: stored,
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
    publishes,
    normalize,
    onBulkDelete,
    onBulkPublish,
  } = props;
  const { featurePermissions } = useAuth();
  const showPicked = useShowPickedStudents();
  const now = useNow();
  const assignments = normalize ? stored.map((a) => normalize(a, now)) : stored;
  const wants = (a: A) => wantsLiveData(a, viewOnly(a), publishes?.(a) ?? true);
  const live = assignments.filter(wants);
  const responsesById = useRunResponses(live, responsesPath, toResponses);

  const rows: RowModel<A>[] = assignments.map((a) => {
    const responses = wants(a) ? (responsesById[a.id] ?? null) : [];
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
    const picked = pickedStudents(a, rosters);
    const sizes =
      picked && showPicked
        ? pickedClassSizes(picked, a.periodAccess)
        : classSizes;
    const status = deriveAssignedStatus(
      // Neither kind has teacher-graded work.
      toInput(a, {
        responses,
        needsGrading: 0,
        classSizes: sizes,
        bellFor,
      }),
      now
    );
    return {
      id: a.id,
      status,
      assignment: a,
      bells,
      viewOnly: viewOnly(a),
      published: scoresShown(a.scoreVisibility),
      picked,
    };
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
        titleOf={(r) => props.title(r.assignment)}
        loading={loading}
        pinnedId={fresh?.id ?? null}
        emptyTitle={emptyTitle}
        emptySub={emptySub}
        tourWidgetType={tourWidgetType}
        bulk={
          onBulkDelete
            ? {
                remove: (rs) => onBulkDelete(rs.map((r) => r.assignment)),
                publish: onBulkPublish
                  ? (rs) => onBulkPublish(rs.map((r) => r.assignment))
                  : undefined,
                canPublish: (r) => publishes?.(r.assignment) ?? true,
              }
            : undefined
        }
        renderLeftOpen={(row, cls, index, leaveOpen) => (
          <RunLeftOpenHost<A>
            row={row}
            cls={cls}
            index={index}
            onLeaveOpen={leaveOpen}
            {...props}
          />
        )}
        renderRow={(row, index) => (
          <RunAssignedRowHost<A> row={row} index={index} now={now} {...props} />
        )}
      />
      {footer}
    </div>
  );
}

const NO_LIFECYCLE: AssignmentLifecycle = {
  end: () => Promise.reject(new Error('Sign in to change this.')),
  reopen: () => Promise.reject(new Error('Sign in to change this.')),
};

/** D11: Close or Leave open for one class left open, with the row's own class actions. */
function RunLeftOpenHost<A extends RunAssignment>({
  row,
  cls,
  index,
  onLeaveOpen,
  rosters,
  collections,
  lifecycle,
  tourWidgetType,
  title,
}: RunAssignedTabProps<A> & {
  row: RowModel<A>;
  cls: AssignedClass;
  index: number;
  onLeaveOpen: () => void;
}): React.ReactElement {
  const a = row.assignment;
  const actions = useAssignmentClassActions(
    a,
    collections,
    lifecycle ?? NO_LIFECYCLE,
    rosters
  );
  const run = usePeriodRunner('RunAssignedTab.leftOpen');
  const [busy, setBusy] = useState(false);
  const single = row.status.singleLine;
  return (
    <AssignedLeftOpenFlag
      title={title(a)}
      classLabel={single ? null : cls.label}
      busy={busy}
      onClose={() => {
        setBusy(true);
        void run(() => actions.closeClass(single ? null : cls.key)).finally(
          () => setBusy(false)
        );
      }}
      onLeaveOpen={onLeaveOpen}
      tourIndex={index}
      tourWidgetType={tourWidgetType}
    />
  );
}

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
  submits,
  footerLead,
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
  const run = usePeriodRunner('RunAssignedTab.class');
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
  const monitor = onMonitor ?? onResults;

  const onClassAction = (kind: ClassActionKind, key: string | null) => {
    switch (kind) {
      case 'open':
      case 'resume':
        return void exec(() => actions.openClass(key));
      case 'pause':
        return void exec(() => actions.pauseClass(key));
      case 'close':
        // A single-line Close is the whole assignment, so it offers Undo.
        if (key == null)
          return withUndo(
            () => actions.closeAll(),
            viewOnly ? 'Share closed.' : `${title} is closed.`
          );
        return void exec(() => actions.closeClass(key));
      case 'reopen':
        return void exec(() => actions.reopenClass(key));
      case 'monitor':
        return monitor?.(a);
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
          void run(() => restoreRun(prev, uid, collections, lifecycle));
        },
      });
    });
  };

  const allClosed = status.classes.every((c) => c.status === 'closed');
  const [reopening, setReopening] = useState(false);
  const undoFor = (prev: A) => async () => {
    if (user?.uid) await restoreRun(prev, user.uid, collections, lifecycle);
  };
  useAssignedBulkOps({
    close: allClosed
      ? undefined
      : async () => {
          const undo = undoFor(a);
          await actions.closeAll();
          return undo;
        },
    moveToDone:
      status.bucket === 'active' && !viewOnly
        ? async () => {
            const undo = undoFor(a);
            await actions.moveToDone();
            return undo;
          }
        : undefined,
  });
  const replaced = new Set(replacedMenuIds);
  const menuActions = assignedMenu({
    status,
    viewOnly,
    items: menu(a).filter((m) => !replaced.has(m.id)),
    published: row.published,
    onCloseAll: () =>
      withUndo(() => actions.closeAll(), `${title} is closed for all classes.`),
    onMoveToDone: () =>
      withUndo(() => actions.moveToDone(), `${title} moved to Finished.`),
    onReopen: viewOnly
      ? () => onClassAction('reopen', null)
      : () => setReopening(true),
    tourWidgetType,
    busy,
  });

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
  const turnsIn = submits ? submits(a) : true;
  const counts = turnsIn && (classCounts ? classCounts(a) : true);
  const submitted = status.classes.reduce((n, c) => n + c.submitted, 0);
  // Published rows skip the responses listener, so the text reads the doc.
  const detail: string | undefined =
    status.bucket === 'done' && scoresShown(a.scoreVisibility) && !viewOnly
      ? 'Scores published'
      : !counts && (!status.singleLine || !turnsIn) && !viewOnly
        ? [
            ...(turnsIn &&
            submitted > 0 &&
            status.classes.some((c) => c.status !== 'ready')
              ? [`${submitted} turned in`]
              : []),
            detailText(status, now, false),
          ]
            .filter(Boolean)
            .join(' · ')
        : undefined;

  const endsAtBell = Object.values(a.periodAccess ?? {}).some(
    (r) => r.bellPeriodId != null
  );
  const lead = footerLead?.(a);
  const footer = [
    ...(lead ? [lead] : []),
    endsAtBell ? 'Closes at the end of each class' : 'Closes manually',
    `Assigned ${new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
  ];

  return (
    <>
      {reopening && (
        <AssignedReopenDialog
          title={title}
          status={status}
          onReopen={(key) => exec(() => actions.reopenClass(key))}
          onClose={() => setReopening(false)}
        />
      )}
      <AssignedRow
        title={title}
        status={status}
        nowMs={now}
        mainLabel={mainLabel}
        onMain={onMain}
        detail={detail}
        onResults={onResults && !viewOnly ? () => onResults(a) : undefined}
        canPause={!viewOnly && !!lifecycle.pause}
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
        picked={row.picked}
        periodAccess={a.periodAccess}
      />
    </>
  );
}
