import { scoresShown } from '@/utils/assignedStatus';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  FieldPath,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type {
  ClassRoster,
  QuizAssignment,
  QuizData,
  QuizMetadata,
  QuizQuestion,
  QuizResponse,
} from '@/types';
import {
  AssignedLeftOpenFlag,
  AssignedList,
  AssignedRow,
  useAssignedBulkOps,
  type ClassActionKind,
  type LineSegment,
  mainActionLabel,
} from '@/components/common/library/assigned';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { tourTypeAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import {
  useQuizClassActions,
  type QuizLifecycle,
} from '@/hooks/useQuizClassActions';
import {
  deriveAssignedStatus,
  quizAssignedInput,
  type AssignedClass,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import { BELL_CLOSE_CUSHION_MS, type EpochWindow } from '@/utils/periodPlan';
import { logError } from '@/utils/logError';
import { isResponseAwaitingGrade } from '../utils/quizScoreboard';
import { AssignedResponsesFixture } from './assignedResponsesFixture';
import {
  CheckCircle2,
  Monitor,
  Pause,
  Play,
  PowerOff,
  RotateCcw,
} from 'lucide-react';

/** What the row's main button does beyond the class actions. */
export interface QuizAssignedHandlers {
  onMonitor: (a: QuizAssignment) => void;
  onResults: (a: QuizAssignment) => void;
  onPublish?: (a: QuizAssignment) => void;
  /** View-only shares and paper quizzes keep today's main button (Copy link, Import responses). */
  legacyPrimary: (
    a: QuizAssignment
  ) => { label: string; onClick: () => void } | null;
  /** Today's overflow items for the row; class lifecycle items are dropped here. */
  menu: (a: QuizAssignment) => LibraryMenuAction[];
  monitorBadge?: (a: QuizAssignment) => { count: number; label: string } | null;
}

interface QuizAssignedTabProps extends QuizAssignedHandlers {
  assignments: QuizAssignment[];
  loading: boolean;
  quizzes: QuizMetadata[];
  loadQuizData?: (quiz: QuizMetadata) => Promise<QuizData | null>;
  rosters: ClassRoster[];
  lifecycle: QuizLifecycle;
  pinnedId?: string | null;
  emptyTitle: string;
  emptySub: string;
  /** Deletes without asking; resolves to how many failed. Turns on bulk select. */
  onBulkDelete?: (assignments: QuizAssignment[]) => Promise<number>;
  /** Opens the publish dialog once for the picked closed rows. */
  onBulkPublish?: (assignments: QuizAssignment[]) => void;
}

const TICK_MS = 30_000;
const PIN_MS = 15 * 60_000;
/** Today's overflow items the Assigned row replaces with per-class actions (D6, D16). */
const REPLACED_MENU_IDS = new Set([
  'deactivate',
  'pause',
  'reopen',
  'reactivate',
]);

/** A row still being worked: anything not ended before the Assigned tab handled it (D20). */
const wantsLiveData = (a: QuizAssignment) =>
  a.mode !== 'view-only' &&
  // Done for good: moved there by hand, or closed with scores published.
  !(
    a.status === 'inactive' &&
    (a.doneAt != null || (!!a.scoreVisibility && a.scoreVisibility !== 'none'))
  ) &&
  (a.status !== 'inactive' ||
    a.closedAt != null ||
    Object.values(a.periodAccess ?? {}).some((r) => r.closedAt != null));

function useResponsesById(ids: readonly string[]) {
  const fixture = useContext(AssignedResponsesFixture);
  const key = fixture ? '' : ids.join('|');
  const [byId, setById] = useState<Record<string, QuizResponse[]>>({});
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
          collection(db, 'quiz_sessions', id, 'responses'),
          (snap) =>
            setById((prev) => ({
              ...prev,
              [id]: snap.docs.map((d) => d.data() as QuizResponse),
            })),
          (err) => {
            logError('QuizAssignedTab.responses', err, { assignmentId: id });
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

const questionCache = new Map<string, Promise<QuizQuestion[] | null>>();

/** Questions for grading counts, loaded once per quiz version. */
function useQuestionsByQuizId(
  metas: readonly QuizMetadata[],
  load: ((quiz: QuizMetadata) => Promise<QuizData | null>) | undefined
) {
  const [byId, setById] = useState<Record<string, QuizQuestion[] | null>>({});
  const key = metas.map((m) => `${m.id}:${m.updatedAt ?? 0}`).join('|');
  useEffect(() => {
    if (!load || !key) return undefined;
    let cancelled = false;
    for (const meta of metas) {
      const cacheKey = `${meta.id}:${meta.updatedAt ?? 0}`;
      let pending = questionCache.get(cacheKey);
      if (!pending) {
        pending = load(meta)
          .then((d) => d?.questions ?? null)
          .catch(() => null)
          .then((qs) => {
            // A failed load is retried next time, never read as nothing to grade.
            if (!qs) questionCache.delete(cacheKey);
            return qs;
          });
        questionCache.set(cacheKey, pending);
      }
      void pending.then((qs) => {
        if (!cancelled) setById((prev) => ({ ...prev, [meta.id]: qs }));
      });
    }
    return () => {
      cancelled = true;
    };
    // `key` names every meta's id and version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);
  return byId;
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

export interface QuizAssignedRowModel {
  id: string;
  status: AssignedStatus;
  assignment: QuizAssignment;
  needsGrading: number | null;
  bells: Record<string, EpochWindow | null>;
  viewOnly: boolean;
  published: boolean;
}

/** Quiz rows for any Assigned list: the widget tab and the Assignments hub (D18). */
// eslint-disable-next-line react-refresh/only-export-components -- kept beside the tab so parallel slices touch one file
export function useQuizAssignedRows(
  assignments: QuizAssignment[],
  quizzes: QuizMetadata[],
  loadQuizData: ((quiz: QuizMetadata) => Promise<QuizData | null>) | undefined,
  rosters: ClassRoster[]
): { rows: QuizAssignedRowModel[]; now: number } {
  const { featurePermissions } = useAuth();
  const now = useNow();
  const liveIds = useMemo(
    () => assignments.filter(wantsLiveData).map((a) => a.id),
    [assignments]
  );
  const responsesById = useResponsesById(liveIds);

  const gradingMetas = useMemo(() => {
    const wanted = new Set(
      assignments
        .filter((a) =>
          (responsesById[a.id] ?? []).some((r) => r.status === 'completed')
        )
        .map((a) => a.quizId)
    );
    return quizzes.filter((q) => wanted.has(q.id));
  }, [assignments, responsesById, quizzes]);
  const questionsByQuizId = useQuestionsByQuizId(gradingMetas, loadQuizData);

  const rows: QuizAssignedRowModel[] = useMemo(
    () =>
      assignments.map((a) => {
        const responses = wantsLiveData(a) ? (responsesById[a.id] ?? null) : [];
        let needsGrading: number | null = null;
        if (responses) {
          const completed = responses.filter((r) => r.status === 'completed');
          if (completed.length === 0) needsGrading = 0;
          else {
            // Unknown (row stays Active) until the questions load; a quiz no longer in the library stays unknown.
            const qs = questionsByQuizId[a.quizId];
            if (qs)
              needsGrading = completed.filter((r) =>
                isResponseAwaitingGrade(r, qs)
              ).length;
          }
        }
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
          quizAssignedInput(a, {
            responses,
            needsGrading,
            classSizes,
            bellFor: (access) => bellFor({ rosterId: access.rosterId }),
          }),
          now
        );
        return {
          id: a.id,
          status,
          assignment: a,
          needsGrading,
          bells,
          viewOnly: a.mode === 'view-only',
          published: scoresShown(a.scoreVisibility),
        };
      }),
    [
      assignments,
      responsesById,
      questionsByQuizId,
      rosters,
      featurePermissions,
      now,
    ]
  );
  return { rows, now };
}

/** The Quiz Assigned tab: one row per assignment, one status per class (ASSIGNED_TAB.md slice 2). */
export const QuizAssignedTab: React.FC<QuizAssignedTabProps> = ({
  assignments,
  loading,
  quizzes,
  loadQuizData,
  rosters,
  lifecycle,
  pinnedId,
  emptyTitle,
  emptySub,
  onBulkDelete,
  onBulkPublish,
  ...handlers
}) => {
  const { rows, now } = useQuizAssignedRows(
    assignments,
    quizzes,
    loadQuizData,
    rosters
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
    <AssignedList<QuizAssignedRowModel>
      items={rows}
      loading={loading}
      pinnedId={freshPin}
      emptyTitle={emptyTitle}
      emptySub={emptySub}
      tourWidgetType="quiz"
      bulk={
        onBulkDelete
          ? {
              remove: (rows) => onBulkDelete(rows.map((r) => r.assignment)),
              publish: onBulkPublish
                ? (rows) => onBulkPublish(rows.map((r) => r.assignment))
                : undefined,
            }
          : undefined
      }
      renderLeftOpen={(row, cls, index, leaveOpen) =>
        row.assignment.paper ? null : (
          <QuizLeftOpenHost
            row={row}
            cls={cls}
            index={index}
            rosters={rosters}
            lifecycle={lifecycle}
            onLeaveOpen={leaveOpen}
          />
        )
      }
      renderRow={(row, index) => (
        <QuizAssignedRowHost
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

/** D11: Close or Leave open for one class left open, with the row's own class actions. */
const QuizLeftOpenHost: React.FC<{
  row: QuizAssignedRowModel;
  cls: AssignedClass;
  index: number;
  rosters: ClassRoster[];
  lifecycle: QuizLifecycle;
  onLeaveOpen: () => void;
}> = ({ row, cls, index, rosters, lifecycle, onLeaveOpen }) => {
  const a = row.assignment;
  const actions = useQuizClassActions(a, lifecycle, rosters);
  const run = usePeriodRunner(a.periodAccess, 'QuizAssignedTab.leftOpen');
  const [busy, setBusy] = useState(false);
  const single = row.status.singleLine;
  return (
    <AssignedLeftOpenFlag
      title={a.quizTitle}
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
      tourWidgetType="quiz"
    />
  );
};

export interface QuizAssignedRowHostProps extends QuizAssignedHandlers {
  row: QuizAssignedRowModel;
  index: number;
  now: number;
  rosters: ClassRoster[];
  lifecycle: QuizLifecycle;
  /** The Assignments hub tags its rows as its own (D18). */
  tourWidgetType?: string;
  /** Main-button kinds this list can act on; others show no button. */
  mainKinds?: readonly AssignedStatus['action']['kind'][];
  /** Extra inline items after the status line, such as the hub's kind label. */
  meta?: React.ReactNode;
  /** Hub selection, passed through to the row. */
  selected?: boolean;
  onSelect?: () => void;
  selectAnchor?: TourAnchorAttrs;
}

/** Puts back what Close for all classes or Move to Done changed (D10 Undo). */
async function undoClose(
  prev: QuizAssignment,
  uid: string,
  lifecycle: QuizLifecycle
): Promise<void> {
  const assignmentRef = doc(db, 'users', uid, 'quiz_assignments', prev.id);
  const sessionRef = doc(db, 'quiz_sessions', prev.id);
  if (prev.status !== 'inactive') {
    await lifecycle.reopenAssignment(prev.id);
    if (prev.status === 'active') await lifecycle.resumeAssignment(prev.id);
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

export const QuizAssignedRowHost: React.FC<QuizAssignedRowHostProps> = ({
  row,
  index,
  now,
  rosters,
  lifecycle,
  onMonitor,
  onResults,
  onPublish,
  legacyPrimary,
  menu,
  monitorBadge,
  tourWidgetType = 'quiz',
  mainKinds,
  meta,
  selected,
  onSelect,
  selectAnchor,
}) => {
  const { assignment: a, status, needsGrading, bells } = row;
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const actions = useQuizClassActions(a, lifecycle, rosters);
  const run = usePeriodRunner(a.periodAccess, 'QuizAssignedTab.class');
  const [busy, setBusy] = useState(false);
  const exec = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run(fn);
    } finally {
      setBusy(false);
    }
  };

  const viewOnly = a.mode === 'view-only';
  const paper = !!a.paper && a.status !== 'inactive';

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

  // Paper quizzes are never opened online, so they get no class controls.
  const onPaper = !!a.paper;
  const singleLine = status.singleLine || onPaper;
  const singleLineItems: LibraryMenuAction[] = [];
  if (status.singleLine && !viewOnly && !onPaper) {
    const only = status.classes[0];
    if (only?.status === 'open')
      singleLineItems.push({
        id: 'assigned-pause',
        label: 'Pause',
        icon: Pause,
        onClick: () => onClassAction('pause', null),
      });
    if (only?.status === 'paused' && status.action.kind !== 'resume')
      singleLineItems.push({
        id: 'assigned-resume',
        label: 'Resume',
        icon: Play,
        onClick: () => onClassAction('resume', null),
      });
  }
  const allClosed = status.classes.every((c) => c.status === 'closed');
  if (singleLine) {
    if (!allClosed)
      singleLineItems.push({
        id: 'assigned-close',
        label: 'Close',
        icon: PowerOff,
        onClick: () =>
          withUndo(
            () => actions.closeAll(),
            viewOnly ? 'Share closed.' : `${a.quizTitle} is closed.`
          ),
      });
    else if ((status.bucket === 'active' || viewOnly) && !onPaper)
      singleLineItems.push({
        id: 'assigned-reopen',
        label: 'Reopen',
        icon: RotateCcw,
        onClick: () => onClassAction('reopen', null),
      });
  }
  const lifecycleItems: LibraryMenuAction[] = [];
  if (!singleLine && !allClosed)
    lifecycleItems.push({
      id: 'assigned-close-all',
      label: 'Close for all classes',
      icon: PowerOff,
      anchor: tourTypeAttr('library-shell.assigned-close-all', tourWidgetType),
      onClick: () =>
        withUndo(
          () => actions.closeAll(),
          `${a.quizTitle} is closed for all classes.`
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
        withUndo(() => actions.moveToDone(), `${a.quizTitle} moved to Done.`),
    });
  useAssignedBulkOps({
    close: allClosed
      ? undefined
      : async () => {
          const prev = a;
          const uid = user?.uid;
          await actions.closeAll();
          return async () => {
            if (uid) await undoClose(prev, uid, lifecycle);
          };
        },
    moveToDone:
      status.bucket === 'active' && !viewOnly
        ? async () => {
            const prev = a;
            const uid = user?.uid;
            await actions.moveToDone();
            return async () => {
              if (uid) await undoClose(prev, uid, lifecycle);
            };
          }
        : undefined,
  });
  const built = menu(a);
  const today = built.filter((m) => !REPLACED_MENU_IDS.has(m.id));
  // Reopen for chosen students outlives the whole-assignment Reopen it sat under.
  const pickStudents = built
    .find((m) => m.id === 'reopen')
    ?.submenu?.find((m) => m.id === 'reopen-students');
  if (pickStudents)
    today.push({ ...pickStudents, label: 'Reopen for selected students' });
  // D7: Monitor is always one menu row away, and opening it changes nothing.
  if (!viewOnly && !today.some((m) => m.id === 'monitor'))
    today.unshift({
      id: 'monitor',
      label: 'Monitor',
      icon: Monitor,
      anchor: tourTypeAttr('quiz-library.archive-monitor', 'quiz'),
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

  // D16 and paper: the link or the scan is still the thing to do while it runs.
  const legacy = (viewOnly && !allClosed) || paper ? legacyPrimary(a) : null;
  const badge = status.action.kind === 'monitor' ? monitorBadge?.(a) : null;
  const mainLabel = legacy
    ? legacy.label
    : viewOnly ||
        (mainKinds && paper) ||
        (mainKinds && !mainKinds.includes(status.action.kind))
      ? null
      : mainActionLabel(status.action, needsGrading);
  const onMain = () => {
    if (legacy) return legacy.onClick();
    const { kind, classKey } = status.action;
    switch (kind) {
      case 'open':
      case 'resume':
        return onClassAction(kind, classKey);
      case 'monitor':
        return onMonitor(a);
      case 'publish':
        return (onPublish ?? onResults)(a);
      default:
        return onResults(a);
    }
  };

  const submitted = status.classes.reduce((n, c) => n + c.submitted, 0);
  // Published rows skip the responses listener, so the line reads the doc.
  const published = !!a.scoreVisibility && a.scoreVisibility !== 'none';
  const lineOverride: LineSegment[] | undefined =
    status.bucket === 'done' && published && !viewOnly
      ? [{ text: 'Scores published', tone: 'plain' }]
      : paper
        ? [
            { text: 'On paper', tone: 'plain' },
            ...(submitted > 0
              ? [{ text: `${submitted} turned in`, tone: 'plain' as const }]
              : []),
          ]
        : undefined;

  const endsAtBell = Object.values(a.periodAccess ?? {}).some(
    (r) => r.bellPeriodId != null
  );
  const footer = [
    endsAtBell
      ? 'Closes at the end of each class'
      : 'Stays open until you close it',
    `Assigned ${new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
    ...(a.code && a.status !== 'inactive' && !a.paper ? [a.code] : []),
  ];

  return (
    <AssignedRow
      title={a.quizTitle}
      status={status}
      nowMs={now}
      mainLabel={mainLabel}
      onMain={onMain}
      mainBadgeCount={badge?.count}
      mainBadgeAriaLabel={badge?.label}
      lineOverride={lineOverride}
      onClassAction={onClassAction}
      classControls={!onPaper}
      mainTone={legacy ? 'monitor' : undefined}
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
      meta={meta}
      selected={selected}
      onSelect={onSelect}
      selectAnchor={selectAnchor}
    />
  );
};
