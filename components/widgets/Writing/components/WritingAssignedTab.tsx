import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  where,
} from 'firebase/firestore';
import {
  BarChart3,
  CheckCircle2,
  Monitor,
  PowerOff,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import type { ClassRoster, WritingAssignmentRecord } from '@/types';
import {
  AssignedList,
  AssignedRow,
  type ClassActionKind,
  mainActionLabel,
} from '@/components/common/library/assigned';
import type { LibraryMenuAction } from '@/components/common/library/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import { todaysBell } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import {
  undoWritingClose,
  useWritingClassActions,
} from '@/hooks/useWritingClassActions';
import { writingAssignedInput } from '@/utils/assignedAdapters';
import {
  deriveAssignedStatus,
  type AssignedResponse,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import { BELL_CLOSE_CUSHION_MS, type EpochWindow } from '@/utils/periodPlan';
import { logError } from '@/utils/logError';
import {
  WritingAssignedFixture,
  type WritingClassCounts,
  type WritingGradingField,
} from './writingAssignedFixture';

type Grading = WritingGradingField;

export interface WritingAssignedHandlers {
  onMonitor: (r: WritingAssignmentRecord) => void;
  /** Results is also where pieces are graded and returned. */
  onResults: (r: WritingAssignmentRecord) => void;
  onDelete: (r: WritingAssignmentRecord) => void;
}

interface WritingAssignedTabProps extends WritingAssignedHandlers {
  records: WritingAssignmentRecord[];
  loading: boolean;
  rosters: ClassRoster[];
  pinnedId?: string | null;
}

const TICK_MS = 30_000;
const COUNT_MS = 60_000;
const PIN_MS = 15 * 60_000;

/** A row still being worked: anything not ended before the Assigned tab handled it (D20). */
const wantsLiveData = (r: WritingAssignmentRecord) =>
  !(r.status === 'ended' && r.doneAt != null) &&
  (r.status !== 'ended' ||
    r.closedAt != null ||
    Object.values(r.periodAccess ?? {}).some((p) => p.closedAt != null));

const gradingCache = new Map<string, Promise<Grading | null>>();

/** Each session's grading, read once; it is fixed at assign time. */
function useGrading(ids: readonly string[]) {
  const fixture = useContext(WritingAssignedFixture);
  const key = fixture ? '' : ids.join('|');
  const [byId, setById] = useState<Record<string, Grading | null>>({});
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    for (const id of key.split('|')) {
      let pending = gradingCache.get(id);
      if (!pending) {
        pending = getDoc(doc(db, 'writing_assignment_sessions', id))
          .then((snap) => {
            const grading = snap.get('grading') as
              Grading['grading'] | undefined;
            return grading ? { grading } : null;
          })
          .catch((err: unknown) => {
            logError('WritingAssignedTab.grading', err, { sessionId: id });
            return null;
          })
          .then((g) => {
            // A failed read is retried next time, never read as ungraded.
            if (!g) gradingCache.delete(id);
            return g;
          });
        gradingCache.set(id, pending);
      }
      void pending.then((g) => {
        if (!cancelled) setById((prev) => ({ ...prev, [id]: g }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  return fixture?.grading ?? byId;
}

/** Turned-in and returned counts per class, from count queries so no piece's text is downloaded. */
function useCounts(records: readonly WritingAssignmentRecord[]) {
  const fixture = useContext(WritingAssignedFixture);
  const [byId, setById] = useState<
    Record<string, Record<string, WritingClassCounts>>
  >({});
  // When each record was last counted and on which version, so one row's change recounts only that row.
  const [fetched] = useState(
    () => new Map<string, { sig: string; at: number }>()
  );
  const [tick, setTick] = useState(0);
  const active = !fixture && records.length > 0;
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), COUNT_MS);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => {
    if (fixture) return;
    const now = Date.now();
    for (const r of records) {
      // Class keys can hold a colon (classlink:...), so the signature is JSON.
      const sig = JSON.stringify([
        r.updatedAt,
        Object.keys(r.periodAccess ?? {}),
      ]);
      const last = fetched.get(r.id);
      const waiting = Object.values(byId[r.id] ?? {}).some(
        (c) => c.turnedIn > 0
      );
      // An ended run takes no new pieces, so it is recounted only while some wait to be returned.
      const due =
        !last ||
        last.sig !== sig ||
        (now - last.at >= COUNT_MS && (r.status !== 'ended' || waiting));
      if (!due) continue;
      fetched.set(r.id, { sig, at: now });
      const classKeys = Object.keys(r.periodAccess ?? {});
      const responses = collection(
        db,
        'writing_assignment_sessions',
        r.id,
        'responses'
      );
      const count = async (classKey: string, status: string) => {
        const filters = [
          where('status', '==', status),
          ...(classKey ? [where('classId', '==', classKey)] : []),
        ];
        const snap = await getCountFromServer(query(responses, ...filters));
        return snap.data().count;
      };
      void Promise.all(
        (classKeys.length > 0 ? classKeys : ['']).map(async (k) => {
          const [turnedIn, returned] = await Promise.all([
            count(k, 'turned-in'),
            count(k, 'returned'),
          ]);
          return [k, { turnedIn, returned }] as const;
        })
      )
        .then((entries) =>
          setById((prev) => ({ ...prev, [r.id]: Object.fromEntries(entries) }))
        )
        .catch((err: unknown) => {
          fetched.delete(r.id);
          logError('WritingAssignedTab.counts', err, { sessionId: r.id });
        });
    }
    // byId is read only to see which ended rows still wait; tick drives the minute recount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixture, records, tick, fetched]);
  return fixture?.counts ?? byId;
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
  record: WritingAssignmentRecord;
  needsGrading: number | null;
  bells: Record<string, EpochWindow | null>;
}

/** The Writing Assigned tab on the shared row and list (ASSIGNED_TAB.md slice 5). */
export const WritingAssignedTab: React.FC<WritingAssignedTabProps> = ({
  records,
  loading,
  rosters,
  pinnedId,
  ...handlers
}) => {
  const { featurePermissions } = useAuth();
  const now = useNow();
  const live = useMemo(() => records.filter(wantsLiveData), [records]);
  const liveIds = useMemo(() => live.map((r) => r.id), [live]);
  const gradingById = useGrading(liveIds);
  const countsById = useCounts(live);

  const rows: RowModel[] = useMemo(
    () =>
      records.map((r) => {
        const isLive = wantsLiveData(r);
        const counts = isLive ? countsById[r.id] : {};
        const grading = isLive ? (gradingById[r.id] ?? null) : null;
        let responses: AssignedResponse[] | null = null;
        let waiting = 0;
        if (counts) {
          responses = [];
          for (const [k, c] of Object.entries(counts)) {
            waiting += c.turnedIn;
            const piece = {
              ...(k ? { classId: k } : {}),
              started: true,
              submitted: true,
            };
            for (let i = 0; i < c.turnedIn + c.returned; i++)
              responses.push(piece);
          }
        }
        const ungraded = grading?.grading.mode === 'ungraded';
        // Writing has no publish step: a grade reaches the student when the piece is returned.
        const needsGrading =
          responses == null || (isLive && !grading)
            ? null
            : ungraded
              ? 0
              : waiting;
        const bells: Record<string, EpochWindow | null> = {};
        const bellFor = (access: { rosterId?: string }) =>
          todaysBell(access, rosters, featurePermissions, now);
        const sizeOf = (rosterId: string | undefined) => {
          const x = rosters.find((y) => y.id === rosterId);
          return x && x.students.length > 0 ? x.students.length : undefined;
        };
        const classSizes: Record<string, number> = {};
        for (const [k, row] of Object.entries(r.periodAccess ?? {})) {
          bells[k] = bellFor({ rosterId: row.rosterId ?? k });
          const n = sizeOf(row.rosterId ?? k);
          if (n != null) classSizes[k] = n;
        }
        if (r.rosterIds?.length === 1) {
          const n = sizeOf(r.rosterIds[0]);
          if (n != null) classSizes[''] = n;
        }
        const input = writingAssignedInput(
          r,
          isLive ? grading : { grading: { mode: 'ungraded' } },
          {
            responses: isLive ? responses : [],
            needsGrading: isLive ? needsGrading : 0,
            classSizes,
            bellFor: (access) => bellFor({ rosterId: access.rosterId }),
          }
        );
        const status = deriveAssignedStatus(
          { ...input, publishesScores: false },
          now
        );
        return { id: r.id, status, record: r, needsGrading, bells };
      }),
    [records, countsById, gradingById, rosters, featurePermissions, now]
  );

  // D17: only a just-assigned row that nothing has opened yet sits on top.
  const pinned = rows.find((r) => r.id === pinnedId);
  const freshPin =
    pinned &&
    pinned.record.createdAt > now - PIN_MS &&
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
      emptySub="Assign one from the Library."
      tourWidgetType="writing"
      renderRow={(row, index) => (
        <WritingAssignedRowHost
          row={row}
          index={index}
          now={now}
          rosters={rosters}
          {...handlers}
        />
      )}
    />
  );
};

interface RowHostProps extends WritingAssignedHandlers {
  row: RowModel;
  index: number;
  now: number;
  rosters: ClassRoster[];
}

const WritingAssignedRowHost: React.FC<RowHostProps> = ({
  row,
  index,
  now,
  rosters,
  onMonitor,
  onResults,
  onDelete,
}) => {
  const { record: r, status, needsGrading, bells } = row;
  const { addToast } = useDashboard();
  const actions = useWritingClassActions(r, rosters);
  const run = usePeriodRunner(r.periodAccess, 'WritingAssignedTab.class');
  const [busy, setBusy] = useState(false);
  const exec = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run(fn);
    } finally {
      setBusy(false);
    }
  };
  const title = r.title || 'Untitled writing assignment';

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
        return onMonitor(r);
    }
  };

  const withUndo = (act: () => Promise<void>, message: string) => {
    const prev = r;
    void exec(async () => {
      await act();
      addToast(message, 'success', {
        label: 'Undo',
        onClick: () => void run(() => undoWritingClose(prev)),
      });
    });
  };

  const allClosed = status.classes.every((c) => c.status === 'closed');
  // Writing has no run-wide pause, so a single line offers Close and Reopen only.
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
      anchor: tourTypeAttr('library-shell.assigned-close-all', 'writing'),
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
      anchor: tourTypeAttr('library-shell.assigned-move-to-done', 'writing'),
      onClick: () =>
        withUndo(() => actions.moveToDone(), `${title} moved to Done.`),
    });
  for (const item of [...singleLineItems, ...lifecycleItems])
    item.disabled = busy;
  const menuActions: LibraryMenuAction[] = [
    ...singleLineItems,
    {
      id: 'monitor',
      label: 'Monitor',
      icon: Monitor,
      anchor: tourTypeAttr('writing.archive-monitor', 'writing'),
      onClick: () => onMonitor(r),
    },
    {
      id: 'results',
      label: 'Results',
      icon: BarChart3,
      onClick: () => onResults(r),
    },
    ...lifecycleItems,
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: () => onDelete(r),
    },
  ];

  const onMain = () => {
    const { kind, classKey } = status.action;
    switch (kind) {
      case 'open':
      case 'resume':
        return onClassAction(kind, classKey);
      case 'monitor':
        return onMonitor(r);
      default:
        return onResults(r);
    }
  };

  const endsAtBell = Object.values(r.periodAccess ?? {}).some(
    (p) => p.bellPeriodId != null
  );
  const footer = [
    endsAtBell
      ? 'Closes at the end of each class'
      : 'Stays open until you close it',
    `Assigned ${new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
  ];

  return (
    <AssignedRow
      title={title}
      status={status}
      nowMs={now}
      mainLabel={mainActionLabel(status.action, needsGrading)}
      onMain={onMain}
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
      tourWidgetType="writing"
    />
  );
};
