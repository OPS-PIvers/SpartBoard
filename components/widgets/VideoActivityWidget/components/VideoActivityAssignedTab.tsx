import { scoresShown } from '@/utils/assignedStatus';
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  FieldPath,
  getDoc,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type {
  ClassRoster,
  VideoActivityAssignment,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import {
  AssignedLeftOpenFlag,
  AssignedList,
  AssignedReopenDialog,
  AssignedRow,
  assignedMenu,
  useAssignedBulkOps,
  type ClassActionKind,
  mainActionLabel,
} from '@/components/common/library/assigned';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { useAssignmentClassActions } from '@/hooks/useAssignmentClassActions';
import {
  deriveAssignedStatus,
  type AssignedClass,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import {
  videoActivityAssignedInput,
  videoActivityAssignedResponse,
} from '@/utils/assignedAdapters';
import { BELL_CLOSE_CUSHION_MS, type EpochWindow } from '@/utils/periodPlan';
import {
  pickedClassSizes,
  pickedStudents,
  type PickedStudents,
} from '@/utils/assignedStudents';
import { logError } from '@/utils/logError';
import { isVideoActivityResponseAwaitingGrade } from '@/utils/videoActivityGrading';
import { scoredVideoActivityQuestions } from '@/utils/videoActivityLive';
import { normalizeVideoActivityQuestions } from '@/utils/videoActivityNormalize';
import {
  hasEmbeddedAnswerKey,
  VA_KEY_DOC_ID,
  VA_KEY_SUBCOLLECTION,
  type VideoActivitySessionKeyDoc,
} from '@/utils/videoActivityPublicQuestions';
import {
  LIVE_PAUSE_REASON,
  LIVE_REOPEN_REASON,
  VIDEO_ACTIVITY_RUN_COLLECTIONS,
  type VideoActivityLifecycle,
} from '../videoActivityLifecycle';
import { VaAssignedFixture } from './vaAssignedFixture';
import { finalizeRunVideoResponses } from '../videoClassTurnIn';
import { END_TURN_IN_DELAY_MS } from '@/utils/quizFinalizeOpenResponses';

/** The D24 and D5 marks the Assigned tab writes on a VA assignment doc. */
type MarkedAssignment = VideoActivityAssignment & {
  closedAt?: number | null;
  doneAt?: number | null;
};

/** What the row's main button does beyond the class actions. */
export interface VideoActivityAssignedHandlers {
  onMonitor: (a: VideoActivityAssignment) => void;
  onResults: (a: VideoActivityAssignment) => void;
  onPublish?: (a: VideoActivityAssignment) => void;
  /** A view-only share keeps Copy link as its main button while it runs. */
  onCopyLink?: (a: VideoActivityAssignment) => void;
  /** Today's flat overflow items; `assignedMenu` keeps what fits the row (R6). */
  menu: (a: VideoActivityAssignment) => LibraryMenuAction[];
}

interface VideoActivityAssignedTabProps extends VideoActivityAssignedHandlers {
  assignments: VideoActivityAssignment[];
  loading: boolean;
  rosters: ClassRoster[];
  lifecycle: VideoActivityLifecycle;
  pinnedId?: string | null;
  emptyTitle: string;
  emptySub: string;
  /** Deletes without asking; resolves to how many failed. Turns on bulk select. */
  onBulkDelete?: (assignments: VideoActivityAssignment[]) => Promise<number>;
  /** Opens the publish dialog once for the picked closed rows. */
  onBulkPublish?: (assignments: VideoActivityAssignment[]) => void;
}

const TICK_MS = 30_000;
const PIN_MS = 15 * 60_000;
const COLLECTIONS = { ...VIDEO_ACTIVITY_RUN_COLLECTIONS, refreshIdle: false };
const LIVE_REASONS = new Set([LIVE_PAUSE_REASON, LIVE_REOPEN_REASON]);

const isLive = (a: VideoActivityAssignment) => a.sessionMode === 'teacher';
const gradingKey = (a: VideoActivityAssignment) =>
  isLive(a) ? `${a.id}:${a.status}` : a.id;

/** A closed single line whose open attempts its own turn-in still owes (D6). */
const closedSingleLine = (a: MarkedAssignment) =>
  a.closedAt != null && Object.keys(a.periodAccess ?? {}).length === 0;

/** Work the teacher may owe a grade on: turned in, any answer in a live run, or answered work a Close is still turning in. */
const toGrade = (
  a: MarkedAssignment,
  r: Pick<VideoActivityResponse, 'completedAt' | 'answers'>
) =>
  r.completedAt != null ||
  ((isLive(a) || closedSingleLine(a)) && (r.answers ?? []).length > 0);

/** A row still being worked: anything not ended before the Assigned tab handled it (D20). */
const wantsLiveData = (a: MarkedAssignment) =>
  a.mode !== 'view-only' &&
  !(
    a.status === 'inactive' &&
    (a.doneAt != null || (!!a.scoreVisibility && a.scoreVisibility !== 'none'))
  ) &&
  (a.status !== 'inactive' ||
    a.closedAt != null ||
    Object.values(a.periodAccess ?? {}).some((r) => r.closedAt != null));

function useResponsesById(ids: readonly string[]) {
  const fixture = useContext(VaAssignedFixture);
  const key = fixture ? '' : ids.join('|');
  const [byId, setById] = useState<Record<string, VideoActivityResponse[]>>({});
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
          collection(
            db,
            VIDEO_ACTIVITY_RUN_COLLECTIONS.sessionCollection,
            id,
            'responses'
          ),
          (snap) =>
            setById((prev) => ({
              ...prev,
              [id]: snap.docs.map((d) => d.data() as VideoActivityResponse),
            })),
          (err) => {
            logError('VideoActivityAssignedTab.responses', err, {
              assignmentId: id,
            });
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
  return fixture?.responses ?? byId;
}

const questionCache = new Map<
  string,
  Promise<VideoActivityQuestion[] | null>
>();

/** The scored questions a session grades over: its embedded key, else the teacher-only key doc. */
async function loadScoredQuestions(
  sessionId: string
): Promise<VideoActivityQuestion[] | null> {
  const sessionCollection = VIDEO_ACTIVITY_RUN_COLLECTIONS.sessionCollection;
  const snap = await getDoc(doc(db, sessionCollection, sessionId));
  if (!snap.exists()) return null;
  const session = snap.data() as VideoActivitySession;
  let questions = session.questions;
  if (!hasEmbeddedAnswerKey(session.questions)) {
    if (!session.publicQuestions) return null;
    const key = await getDoc(
      doc(db, sessionCollection, sessionId, VA_KEY_SUBCOLLECTION, VA_KEY_DOC_ID)
    );
    if (!key.exists()) return null;
    questions = normalizeVideoActivityQuestions(
      (key.data() as VideoActivitySessionKeyDoc).questions
    );
  }
  return scoredVideoActivityQuestions(session, questions);
}

/** Keyed questions for grading counts, loaded once per session and run state; a failed load retries each tick. */
function useQuestionsById(ids: readonly string[], tick: number) {
  const fixture = useContext(VaAssignedFixture);
  const [byId, setById] = useState<
    Record<string, VideoActivityQuestion[] | null>
  >({});
  const key = fixture ? '' : ids.join('|');
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    for (const cacheKey of key.split('|')) {
      const id = cacheKey.split(':')[0];
      let pending = questionCache.get(cacheKey);
      if (!pending) {
        pending = loadScoredQuestions(id)
          .catch((err: unknown) => {
            logError('VideoActivityAssignedTab.questions', err, {
              assignmentId: id,
            });
            return null;
          })
          .then((qs) => {
            // A failed load is retried next tick, never read as nothing to grade.
            if (!qs) questionCache.delete(cacheKey);
            return qs;
          });
        questionCache.set(cacheKey, pending);
      }
      void pending.then((qs) => {
        if (!cancelled) setById((prev) => ({ ...prev, [cacheKey]: qs }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return fixture?.questions ?? byId;
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
  assignment: MarkedAssignment;
  needsGrading: number | null;
  bells: Record<string, EpochWindow | null>;
  /** A closed self-paced single line still holds answered, unfinished attempts. */
  owesTurnIn: boolean;
  viewOnly: boolean;
  published: boolean;
  picked: PickedStudents | null;
}

/** The Video Activity Assigned tab: one row per assignment, one status per class (ASSIGNED_TAB.md slice 5). */
export const VideoActivityAssignedTab: React.FC<
  VideoActivityAssignedTabProps
> = ({
  assignments,
  loading,
  rosters,
  lifecycle,
  pinnedId,
  emptyTitle,
  emptySub,
  onBulkDelete,
  onBulkPublish,
  ...handlers
}) => {
  const { featurePermissions } = useAuth();
  const now = useNow();
  const liveIds = useMemo(
    () => assignments.filter(wantsLiveData).map((a) => a.id),
    [assignments]
  );
  const responsesById = useResponsesById(liveIds);

  // A live run's asked questions grow while it runs, so its key is read again once it ends.
  const gradingKeys = useMemo(
    () =>
      assignments
        .filter(
          (a) =>
            wantsLiveData(a) &&
            (responsesById[a.id] ?? []).some((r) => toGrade(a, r))
        )
        .map(gradingKey),
    [assignments, responsesById]
  );
  const questionsByKey = useQuestionsById(gradingKeys, now);

  const rows: RowModel[] = useMemo(
    () =>
      assignments.map((a: MarkedAssignment) => {
        const responses = wantsLiveData(a) ? (responsesById[a.id] ?? null) : [];
        let needsGrading: number | null = null;
        if (responses) {
          const completed = responses.filter((r) => toGrade(a, r));
          if (completed.length === 0) needsGrading = 0;
          else {
            // Unknown (row stays Active) until the answer key loads.
            const qs = questionsByKey[gradingKey(a)];
            if (qs)
              needsGrading = completed.filter((r) =>
                isVideoActivityResponseAwaitingGrade(qs, r)
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
        const picked = pickedStudents(a, rosters);
        const sizes = picked
          ? pickedClassSizes(picked, a.periodAccess)
          : classSizes;
        const status = deriveAssignedStatus(
          videoActivityAssignedInput(a, {
            responses: responses?.map(videoActivityAssignedResponse) ?? null,
            needsGrading,
            classSizes: sizes,
            bellFor: (access) => bellFor({ rosterId: access.rosterId }),
          }),
          now
        );
        const owesTurnIn =
          !isLive(a) &&
          closedSingleLine(a) &&
          (responses ?? []).some(
            (r) => r.completedAt == null && (r.answers ?? []).length > 0
          );
        return {
          id: a.id,
          status,
          assignment: a,
          needsGrading,
          bells,
          owesTurnIn,
          viewOnly: a.mode === 'view-only',
          published: scoresShown(a.scoreVisibility),
          picked,
        };
      }),
    [
      assignments,
      responsesById,
      questionsByKey,
      rosters,
      featurePermissions,
      now,
    ]
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
      titleOf={(r) => r.assignment.activityTitle}
      loading={loading}
      pinnedId={freshPin}
      emptyTitle={emptyTitle}
      emptySub={emptySub}
      tourWidgetType="video-activity"
      bulk={
        onBulkDelete
          ? {
              remove: (rs) => onBulkDelete(rs.map((r) => r.assignment)),
              publish: onBulkPublish
                ? (rs) => onBulkPublish(rs.map((r) => r.assignment))
                : undefined,
            }
          : undefined
      }
      renderLeftOpen={(row, cls, index, leaveOpen) => (
        <VideoActivityLeftOpenHost
          row={row}
          cls={cls}
          index={index}
          rosters={rosters}
          lifecycle={lifecycle}
          onLeaveOpen={leaveOpen}
        />
      )}
      renderRow={(row, index) => (
        <VideoActivityAssignedRowHost
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
const VideoActivityLeftOpenHost: React.FC<{
  row: RowModel;
  cls: AssignedClass;
  index: number;
  rosters: ClassRoster[];
  lifecycle: VideoActivityLifecycle;
  onLeaveOpen: () => void;
}> = ({ row, cls, index, rosters, lifecycle, onLeaveOpen }) => {
  const a = row.assignment;
  const actions = useAssignmentClassActions(a, COLLECTIONS, lifecycle, rosters);
  const run = usePeriodRunner('VideoActivityAssignedTab.leftOpen');
  const [busy, setBusy] = useState(false);
  const single = row.status.singleLine;
  return (
    <AssignedLeftOpenFlag
      title={a.activityTitle}
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
      tourWidgetType="video-activity"
    />
  );
};

interface RowHostProps extends VideoActivityAssignedHandlers {
  row: RowModel;
  index: number;
  now: number;
  rosters: ClassRoster[];
  lifecycle: VideoActivityLifecycle;
}

/** Turns a closed single line's open attempts in once the save grace after its close mark passes (D6); returns a cancel. */
function scheduleRunTurnIn(
  assignmentId: string,
  uid: string,
  closedAt: number
): () => void {
  const timer = setTimeout(
    () => {
      finalizeRunVideoResponses(assignmentId, uid, closedAt).catch(
        (err: unknown) =>
          logError('VideoActivityAssignedTab.turnIn', err, { assignmentId })
      );
    },
    Math.max(0, closedAt + END_TURN_IN_DELAY_MS - Date.now())
  );
  return () => clearTimeout(timer);
}

/** Puts back what Close for all classes or Move to Finished changed (D10 Undo). */
async function undoClose(
  prev: MarkedAssignment,
  uid: string,
  lifecycle: VideoActivityLifecycle
): Promise<void> {
  const { sessionCollection, assignmentCollection } =
    VIDEO_ACTIVITY_RUN_COLLECTIONS;
  const assignmentRef = doc(db, 'users', uid, assignmentCollection, prev.id);
  const sessionRef = doc(db, sessionCollection, prev.id);
  if (prev.status !== 'inactive') {
    await lifecycle.reopen(prev.id);
    if (prev.status === 'paused') await lifecycle.pause(prev.id);
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

const VideoActivityAssignedRowHost: React.FC<RowHostProps> = ({
  row,
  index,
  now,
  rosters,
  lifecycle,
  onMonitor,
  onResults,
  onPublish,
  onCopyLink,
  menu,
}) => {
  const { assignment: a, status, needsGrading, bells } = row;
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const actions = useAssignmentClassActions(a, COLLECTIONS, lifecycle, rosters);
  const run = usePeriodRunner('VideoActivityAssignedTab.class');
  const [busy, setBusy] = useState(false);
  // A live run's own limits read as themselves, not as a failed write.
  const guarded = async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Error && LIVE_REASONS.has(err.message)) {
        addToast(err.message, 'info');
        return undefined;
      }
      throw err;
    }
  };
  const exec = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run(() => guarded(fn));
    } finally {
      setBusy(false);
    }
  };

  const viewOnly = a.mode === 'view-only';
  const live = isLive(a);
  // D6: a self-paced single line has no class turn-in, so its Close turns open attempts in itself.
  // Re-armed whenever the tab shows the row, so a reload or a monitor End never strands the turn-in.
  const uid = user?.uid;
  const turnInAt = row.owesTurnIn && !viewOnly ? a.closedAt : null;
  useEffect(() => {
    if (!uid || turnInAt == null) return undefined;
    return scheduleRunTurnIn(a.id, uid, turnInAt);
  }, [a.id, uid, turnInAt]);
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
            viewOnly ? 'Share closed.' : `${a.activityTitle} is closed.`
          );
        return void exec(() => actions.closeClass(key));
      case 'reopen':
        return void exec(() => actions.reopenClass(key));
      case 'monitor':
        return onMonitor(a);
    }
  };

  // A live run that ends stays ended, so ending one has no Undo.
  const withUndo = (act: () => Promise<void>, message: string) => {
    const prev = a;
    void exec(async () => {
      await act();
      addToast(
        message,
        'success',
        live && prev.status !== 'inactive'
          ? undefined
          : {
              label: 'Undo',
              onClick: () => {
                if (!user?.uid) return;
                const uid = user.uid;
                void run(() => guarded(() => undoClose(prev, uid, lifecycle)));
              },
            }
      );
    });
  };

  const allClosed = status.classes.every((c) => c.status === 'closed');
  const [reopening, setReopening] = useState(false);
  const bulkUndo = (prev: VideoActivityAssignment) =>
    live && prev.status !== 'inactive'
      ? null
      : async () => {
          if (uid) await guarded(() => undoClose(prev, uid, lifecycle));
        };
  useAssignedBulkOps({
    close: allClosed
      ? undefined
      : async () => {
          const undo = bulkUndo(a);
          await guarded(() => actions.closeAll());
          return undo;
        },
    moveToDone:
      status.bucket === 'active' && !viewOnly
        ? async () => {
            const undo = bulkUndo(a);
            await guarded(() => actions.moveToDone());
            return undo;
          }
        : undefined,
  });
  const menuActions = assignedMenu({
    status,
    viewOnly,
    items: menu(a),
    published: row.published,
    onCloseAll: () =>
      withUndo(
        () => actions.closeAll(),
        `${a.activityTitle} is closed for all classes.`
      ),
    onMoveToDone: () =>
      withUndo(
        () => actions.moveToDone(),
        `${a.activityTitle} moved to Finished.`
      ),
    // A live run that ended stays ended (no per-class reopen).
    onReopen: live
      ? undefined
      : viewOnly
        ? () => onClassAction('reopen', null)
        : () => setReopening(true),
    tourWidgetType: 'video-activity',
    busy,
  });

  // D16: the link is still the thing to do while a share runs.
  const copyMain = viewOnly && !allClosed && onCopyLink;
  const mainLabel = copyMain
    ? 'Copy link'
    : viewOnly
      ? null
      : mainActionLabel(status.action, needsGrading);
  const onMain = () => {
    if (copyMain) return onCopyLink(a);
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

  // Published rows skip the responses listener, so the line reads the doc.
  const published = !!a.scoreVisibility && a.scoreVisibility !== 'none';
  const detail =
    status.bucket === 'done' && published && !viewOnly
      ? 'Scores published'
      : undefined;

  const endsAtBell = Object.values(a.periodAccess ?? {}).some(
    (r) => r.bellPeriodId != null
  );
  const footer = [
    endsAtBell ? 'Closes at the end of each class' : 'Closes manually',
    `Assigned ${new Date(a.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
  ];

  return (
    <>
      {reopening && (
        <AssignedReopenDialog
          title={a.activityTitle}
          status={status}
          onReopen={(key) => exec(() => actions.reopenClass(key))}
          onClose={() => setReopening(false)}
        />
      )}
      <AssignedRow
        title={a.activityTitle}
        status={status}
        nowMs={now}
        mainLabel={mainLabel}
        onMain={onMain}
        detail={detail}
        onResults={viewOnly ? undefined : () => onResults(a)}
        canPause={!viewOnly}
        onClassAction={onClassAction}
        mainTone={copyMain ? 'monitor' : undefined}
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
        tourWidgetType="video-activity"
        picked={row.picked}
        periodAccess={a.periodAccess}
      />
    </>
  );
};
