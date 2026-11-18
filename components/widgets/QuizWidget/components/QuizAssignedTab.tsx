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
  AssignedList,
  AssignedRow,
  type ClassActionKind,
  type LineSegment,
  mainActionLabel,
} from '@/components/common/library/assigned';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import {
  useQuizClassActions,
  type QuizClassActions,
  type QuizLifecycle,
} from '@/hooks/useQuizClassActions';
import {
  deriveAssignedStatus,
  quizAssignedInput,
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
}

const TICK_MS = 30_000;
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
  (a.status !== 'inactive' ||
    a.closedAt != null ||
    Object.values(a.periodAccess ?? {}).some((r) => r.closedAt != null));

function useResponsesById(ids: readonly string[]) {
  const fixture = useContext(AssignedResponsesFixture);
  const key = fixture ? '' : ids.join('|');
  const [byId, setById] = useState<Record<string, QuizResponse[]>>({});
  useEffect(() => {
    if (!key) return undefined;
    const unsubs = key.split('|').map((id) =>
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
    return () => unsubs.forEach((u) => u());
  }, [key]);
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
          .catch(() => null);
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

interface RowModel {
  id: string;
  status: AssignedStatus;
  assignment: QuizAssignment;
  needsGrading: number | null;
  bells: Record<string, EpochWindow | null>;
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
  ...handlers
}) => {
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

  const rows: RowModel[] = useMemo(
    () =>
      assignments.map((a) => {
        const responses = wantsLiveData(a) ? (responsesById[a.id] ?? null) : [];
        let needsGrading: number | null = null;
        if (responses) {
          const completed = responses.filter((r) => r.status === 'completed');
          if (completed.length === 0) needsGrading = 0;
          else if (!quizzes.some((q) => q.id === a.quizId)) needsGrading = 0;
          else if (a.quizId in questionsByQuizId) {
            const qs = questionsByQuizId[a.quizId];
            needsGrading = qs
              ? completed.filter((r) => isResponseAwaitingGrade(r, qs)).length
              : 0;
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
        return { id: a.id, status, assignment: a, needsGrading, bells };
      }),
    [
      assignments,
      responsesById,
      questionsByQuizId,
      quizzes,
      rosters,
      featurePermissions,
      now,
    ]
  );

  return (
    <AssignedList<RowModel>
      items={rows}
      loading={loading}
      pinnedId={pinnedId}
      emptyTitle={emptyTitle}
      emptySub={emptySub}
      tourWidgetType="quiz"
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

interface RowHostProps extends QuizAssignedHandlers {
  row: RowModel;
  index: number;
  now: number;
  rosters: ClassRoster[];
  lifecycle: QuizLifecycle;
}

/** Puts back what Close for all classes or Move to Done changed (D10 Undo). */
async function undoClose(
  prev: QuizAssignment,
  prevStatus: AssignedStatus,
  uid: string,
  actions: QuizClassActions,
  lifecycle: QuizLifecycle
): Promise<void> {
  const assignmentRef = doc(db, 'users', uid, 'quiz_assignments', prev.id);
  const sessionRef = doc(db, 'quiz_sessions', prev.id);
  const rows = prev.periodAccess ?? {};
  let reopened = false;
  for (const c of prevStatus.classes) {
    if (!rows[c.key]) continue;
    if (c.status === 'open' || c.status === 'paused') {
      await actions.reopenClass(c.key);
      if (c.status === 'paused') await actions.pauseClass(c.key);
      reopened = true;
    }
  }
  if (!reopened && prev.status !== 'inactive') {
    await lifecycle.reopenAssignment(prev.id);
    if (
      prev.status === 'active' &&
      prev.mode !== 'view-only' &&
      Object.keys(rows).length === 0
    )
      await lifecycle.resumeAssignment(prev.id);
  }
  const restore = prevStatus.classes.filter(
    (c) => rows[c.key] && (c.status === 'ready' || c.status === 'scheduled')
  );
  if (restore.length > 0) {
    const batch = writeBatch(db);
    for (const ref of [sessionRef, assignmentRef])
      for (const c of restore)
        batch.update(ref, new FieldPath('periodAccess', c.key), rows[c.key]);
    await batch.commit();
  }
  await updateDoc(assignmentRef, {
    doneAt: prev.doneAt ?? null,
    closedAt: prev.closedAt ?? null,
  });
}

const QuizAssignedRowHost: React.FC<RowHostProps> = ({
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
    const prevStatus = status;
    void exec(async () => {
      await act();
      addToast(message, 'success', {
        label: 'Undo',
        onClick: () => {
          if (!user?.uid) return;
          const uid = user.uid;
          void run(() => undoClose(prev, prevStatus, uid, actions, lifecycle));
        },
      });
    });
  };

  const singleLineItems: LibraryMenuAction[] = [];
  if (status.singleLine && !viewOnly) {
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
  if (status.singleLine) {
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
    else if (status.bucket === 'active' || viewOnly)
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
      anchor: tourTypeAttr('library-shell.assigned-close-all', 'quiz'),
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
      anchor: tourTypeAttr('library-shell.assigned-move-to-done', 'quiz'),
      onClick: () =>
        withUndo(() => actions.moveToDone(), `${a.quizTitle} moved to Done.`),
    });
  const today = menu(a).filter((m) => !REPLACED_MENU_IDS.has(m.id));
  // D7: Monitor is always one menu row away, and opening it changes nothing.
  if (!viewOnly && !today.some((m) => m.id === 'monitor'))
    today.unshift({
      id: 'monitor',
      label: 'Monitor',
      icon: Monitor,
      anchor: tourTypeAttr('quiz-library.archive-monitor', 'quiz'),
      onClick: () => onMonitor(a),
    });
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
    : viewOnly
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
  const lineOverride: LineSegment[] | undefined = paper
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
      tourWidgetType="quiz"
    />
  );
};
