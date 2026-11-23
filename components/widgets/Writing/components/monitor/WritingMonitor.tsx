// The Writing monitor (D15) in the Quiz monitor's shell: header, class picker, status counts and roster rows, with Live view and Nudge.
import React, {
  Suspense,
  lazy,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Eye, Loader2, NotebookPen } from 'lucide-react';
import type {
  WritingAssignmentRecord,
  WritingAssignmentSession,
  WritingResponse,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { AuthContext } from '@/context/AuthContextValue';
import { QUIZ_LIVE_VIEW_FEATURE } from '@/utils/quizLiveView';
import { useDashboard } from '@/context/useDashboard';
import { useWritingMonitor } from '@/hooks/useWritingMonitor';
import {
  useAssignmentPseudonymsMulti,
  type StudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useServerNow } from '@/hooks/useServerNow';
import {
  EXTEND_MS,
  usePeriodAccess,
  type PeriodAccessPatch,
} from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { updateWritingSession } from '@/hooks/useWritingAssignmentSessions';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import {
  MonitorHeader,
  type MonitorHeaderStatus,
} from '@/components/widgets/QuizWidget/components/monitor/MonitorHeader';
import {
  ClassPicker,
  PeriodBar,
  type PeriodBarProps,
} from '@/components/widgets/QuizWidget/components/monitor/PeriodBar';
import {
  RosterIdleChip,
  RosterRow,
  ToggleChip,
} from '@/components/widgets/QuizWidget/components/monitor/RosterParts';
import { hasPeriodAccess } from '@/utils/periodAccess';
import {
  buildWritingMonitorRows,
  countWritingBuckets,
  type WritingMonitorRow,
} from '@/utils/writingMonitor';
import { formatAwayDuration } from '@/utils/tabAwayLimit';
import { studentTargetRefKey } from '@/utils/studentTargetRef';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { logError } from '@/utils/logError';
import { peerStudentList, type PeerGroup } from '@/utils/writingPeerReview';
import { PeerPairingModal } from '../peerReview/PeerPairingModal';

// Lazy, as in the Quiz monitor: Live view's module carries the Quiz player.
const WatchPanel = lazy(() =>
  import('./WritingLiveViewPanel').then((m) => ({
    default: m.WritingLiveViewPanel,
  }))
);

const TYPE = 'writing';
const PEER_FEATURE = 'writing-peer-review';
const PEER_ACCESS_WORD = {
  view: 'View only',
  comment: 'Comment only',
  edit: 'Edit',
} as const;
const setPeerReview = httpsCallable<Record<string, unknown>, unknown>(
  functions,
  'setWritingPeerReviewV1'
);
const BUCKET_LABELS: Partial<Record<BucketKey, string>> = {
  done: 'Turned in',
};
const fact = { fontSize: 'min(11px, 3.8cqmin)' };

/** Start, Pause and More time for per-class access, as the Quiz and Video Activity monitors pass them. */
export type WritingPeriodBar = Pick<
  PeriodBarProps,
  'periodAccess' | 'onStart' | 'onPause' | 'onExtend' | 'extendMs' | 'dueAt'
>;

export const WritingMonitor: React.FC<{
  sessionId: string;
  record: WritingAssignmentRecord | undefined;
  showWordCounts?: boolean;
  onShowWordCounts?: (on: boolean) => void;
  onBack: () => void;
}> = ({ sessionId, record, showWordCounts, onShowWordCounts, onBack }) => {
  const { orgId } = useAuth();
  const { session, responses, loading, missing, seenAt } =
    useWritingMonitor(sessionId);
  const [classId, setClassId] = useState('');
  const classIds = useMemo(
    () => session?.classIds ?? record?.classIds ?? [],
    [session?.classIds, record?.classIds]
  );
  // Older records name picked students with targetMode; Writing's picks keep mode 'class' and list their classes.
  const legacyPicked =
    record?.targetMode === 'students' ? record.targetStudents : undefined;
  // Names for everyone the session reaches; the per-class lookups list who hasn't opened it.
  const all = useAssignmentPseudonymsMulti(
    sessionId,
    classIds,
    orgId,
    legacyPicked
  );
  const targetStudents = record?.targetStudents;
  const narrowedIds = record?.studentTargetClassIds;
  const targeted = useMemo(
    () =>
      targetStudents?.length
        ? new Set(targetStudents.map(studentTargetRefKey))
        : null,
    [targetStudents]
  );
  const narrowed = useMemo(
    () => new Set(legacyPicked ? classIds : targeted ? narrowedIds : []),
    [legacyPicked, classIds, targeted, narrowedIds]
  );
  const picked = useMemo(
    () => (classId ? [classId] : classIds),
    [classId, classIds]
  );
  const wholePicked = useMemo(
    () => picked.filter((id) => !narrowed.has(id)),
    [picked, narrowed]
  );
  const narrowedPicked = useMemo(
    () => picked.filter((id) => narrowed.has(id)),
    [picked, narrowed]
  );
  const whole = useAssignmentPseudonymsMulti(sessionId, wholePicked, orgId);
  const part = useAssignmentPseudonymsMulti(
    sessionId,
    narrowedPicked,
    orgId,
    legacyPicked
  );
  const excluded = useMemo(
    () => new Set((record?.excludedTargets ?? []).map(studentTargetRefKey)),
    [record?.excludedTargets]
  );
  // Without the targeting record, or a class filter on old picks (refs carry no class), rows would list the wrong students.
  const rosterKnown =
    !!record && !whole.loading && !part.loading && !(classId && legacyPicked);
  const rosterUids = useMemo(() => {
    const out: string[] = [];
    if (!rosterKnown) return out;
    for (const uid of whole.byStudentUid.keys()) {
      const ref = whole.targetRefKeyByStudentUid.get(uid);
      if (!ref || !excluded.has(ref)) out.push(uid);
    }
    // In a class narrowed to picked students, only the picks belong.
    for (const uid of part.byStudentUid.keys()) {
      const ref = part.targetRefKeyByStudentUid.get(uid);
      if (ref && targeted?.has(ref) && !excluded.has(ref)) out.push(uid);
    }
    return out;
  }, [
    rosterKnown,
    whole.byStudentUid,
    whole.targetRefKeyByStudentUid,
    part.byStudentUid,
    part.targetRefKeyByStudentUid,
    targeted,
    excluded,
  ]);
  const { rosters } = useDashboard();
  const perPeriod = hasPeriodAccess(record);
  const commit = useCallback(
    (patch: PeriodAccessPatch) => updateWritingSession({ sessionId, ...patch }),
    [sessionId]
  );
  const periods = usePeriodAccess(
    perPeriod ? (record ?? null) : null,
    {
      sessionCollection: 'writing_assignment_sessions',
      assignmentCollection: 'writing_assignment_records',
      refreshIdle: false,
      commit,
    },
    rosters
  );
  const runPeriod = usePeriodRunner('WritingMonitor.periodAccess');
  const periodBar: WritingPeriodBar | null =
    perPeriod && record?.periodAccess && session?.status !== 'ended'
      ? {
          periodAccess: record.periodAccess,
          onStart: (key) => runPeriod(() => periods.startPeriod(key)),
          onPause: (key) => runPeriod(() => periods.pausePeriod(key)),
          onExtend: (key, by) => runPeriod(() => periods.extendPeriod(key, by)),
          extendMs: EXTEND_MS,
          dueAt: typeof record.dueAt === 'number' ? record.dueAt : null,
        }
      : null;
  // Peer review: the assigning teacher pairs students while the assignment runs.
  const auth = useContext(AuthContext);
  const canPeer =
    auth?.canAccessFeature?.(PEER_FEATURE) === true &&
    session?.status === 'active' &&
    auth.user?.uid === session.teacherUid;
  const [peerOpen, setPeerOpen] = useState(false);
  const peerRunning =
    !!session?.peerReview && session.peerReview.endedAt == null;
  const peerStudents = useMemo(
    () => peerStudentList(rosterUids, all.byStudentUid),
    [rosterUids, all.byStudentUid]
  );
  const peerGroups = useMemo<PeerGroup[]>(
    () => (record?.peerGroups ?? []).map((g) => g.members),
    [record?.peerGroups]
  );
  const savePeer = async (
    patch: Record<string, unknown>,
    what: string
  ): Promise<boolean> => {
    try {
      await setPeerReview({ sessionId, ...patch });
      return true;
    } catch (err) {
      logError(`WritingMonitor.peerReview.${what}`, err);
      return false;
    }
  };
  const peerControl = canPeer ? (
    <div
      className="flex flex-wrap items-center"
      style={{ gap: 'min(6px, 1.5cqmin)' }}
    >
      <ToggleChip
        label={
          peerRunning && session?.peerReview
            ? `Peer review: ${PEER_ACCESS_WORD[session.peerReview.access]}`
            : 'Peer review'
        }
        anchor={tourTypeAttr('writing-monitor.peer-review', TYPE)}
        on={peerRunning}
        onToggle={() => setPeerOpen(true)}
      />
      {peerOpen && session && (
        <PeerPairingModal
          isOpen
          onClose={() => setPeerOpen(false)}
          students={peerStudents}
          initialGroups={peerGroups}
          initialAccess={session.peerReview?.access ?? 'comment'}
          running={peerRunning}
          onSave={(groups, access) => {
            // Groups in classes not shown right now stay as they are.
            const shown = new Set(peerStudents.map((p) => p.uid));
            const kept = peerGroups.filter((g) =>
              g.every((u) => !shown.has(u))
            );
            return savePeer({ access, groups: [...kept, ...groups] }, 'save');
          }}
          onEnd={() => savePeer({ end: true }, 'end')}
        />
      )}
    </div>
  ) : null;
  return (
    <WritingMonitorView
      session={session}
      peerControl={peerControl}
      periodBar={periodBar}
      showWordCounts={showWordCounts}
      onShowWordCounts={onShowWordCounts}
      fallbackTitle={record?.title}
      fallbackClasses={{
        classIds,
        periodNames: record?.periodNames ?? [],
      }}
      responses={responses}
      names={all.byStudentUid}
      rosterUids={rosterUids}
      seenAt={seenAt}
      loading={loading}
      missing={missing}
      classId={classId}
      onClassChange={setClassId}
      onBack={onBack}
    />
  );
};

/** The monitor drawn from data, so the dev page can show it without Firestore. */
export const WritingMonitorView: React.FC<{
  session: WritingAssignmentSession | null;
  /** Peer review's button and setup, for the assigning teacher. */
  peerControl?: React.ReactNode;
  /** Per-class access; null shows the plain class picker. */
  periodBar?: WritingPeriodBar | null;
  showWordCounts?: boolean;
  onShowWordCounts?: (on: boolean) => void;
  fallbackTitle?: string;
  fallbackClasses: { classIds: string[]; periodNames: string[] };
  responses: WritingResponse[];
  names: Map<string, StudentName>;
  rosterUids: string[];
  seenAt?: Record<string, number>;
  loading: boolean;
  missing: boolean;
  classId: string;
  onClassChange: (classId: string) => void;
  onBack: () => void;
}> = ({
  session,
  periodBar = null,
  showWordCounts = false,
  onShowWordCounts,
  fallbackTitle,
  fallbackClasses,
  responses,
  names,
  rosterUids,
  seenAt,
  loading,
  missing,
  classId,
  onClassChange,
  onBack,
  peerControl,
}) => {
  const now = useServerNow(15_000);
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  // Gated like the Quiz Live view: the admin flag, and only the assigning teacher.
  const auth = useContext(AuthContext);
  const canLiveView =
    auth?.canAccessFeature?.(QUIZ_LIVE_VIEW_FEATURE) === true &&
    !!session?.teacherUid &&
    auth.user?.uid === session.teacherUid;
  const classIds = session?.classIds ?? fallbackClasses.classIds;
  const periodNames = session?.periodNames ?? fallbackClasses.periodNames;
  const classLabel = (id: string): string =>
    periodNames[classIds.indexOf(id)] || 'Class';

  const rows = useMemo(
    () =>
      buildWritingMonitorRows({
        responses,
        names,
        rosterUids,
        classId,
        now,
        seenAt,
      }),
    [responses, names, rosterUids, classId, now, seenAt]
  );
  const counts = countWritingBuckets(rows);
  const idleCount = rows.filter((r) => r.idleMs != null).length;
  // Live view steps through students who can still write, in list order.
  const watchable = rows.filter(
    (r) => r.response && (r.status === 'draft' || r.status === 'revising')
  );
  const title = (session?.title ?? fallbackTitle ?? '') || 'Writing assignment';

  const status: MonitorHeaderStatus =
    session?.status === 'ended'
      ? 'ended'
      : periodBar &&
          Object.values(periodBar.periodAccess).every((p) => p.state !== 'open')
        ? 'paused'
        : 'live';

  const periodControls = periodBar ? (
    <PeriodBar
      {...periodBar}
      selected={classId}
      onSelect={onClassChange}
      anchors={{
        select: tourTypeAttr('writing-monitor.class-picker', TYPE),
        start: tourTypeAttr('writing-monitor.period-start', TYPE),
        pause: tourTypeAttr('writing-monitor.period-pause', TYPE),
        moreTime: tourTypeAttr('writing-monitor.period-more-time', TYPE),
        extend: tourTypeAttr('writing-monitor.period-extend', TYPE),
      }}
    />
  ) : classIds.length > 1 ? (
    <ClassPicker
      names={classIds}
      labelFor={classLabel}
      selected={classId}
      onSelect={onClassChange}
      status={session?.status === 'ended' ? 'ended' : 'active'}
      selectAnchor={tourTypeAttr('writing-monitor.class-picker', TYPE)}
    />
  ) : null;

  const body = (() => {
    if (loading)
      return (
        <div className="flex flex-1 items-center justify-center">
          <Loader2
            className="animate-spin text-brand-gray-light"
            style={{ width: 'min(28px, 8cqmin)', height: 'min(28px, 8cqmin)' }}
            aria-label="Loading"
          />
        </div>
      );
    if (missing || !session)
      return (
        <ScaledEmptyState
          icon={NotebookPen}
          title="This assignment is gone"
          subtitle="It may have been deleted."
        />
      );
    return (
      <div
        className="flex-1 overflow-y-auto"
        style={{
          padding: 'min(12px, 3cqmin)',
          paddingBottom: 'min(24px, 6cqmin)',
        }}
      >
        <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
          {periodControls && (
            <div
              className="border-b border-brand-gray-lightest"
              style={{ paddingBottom: 'min(10px, 2.5cqmin)' }}
            >
              {periodControls}
            </div>
          )}
          <StatusBuckets
            counts={counts}
            handCount={0}
            idleCount={idleCount}
            openBucket={openBucket}
            onToggle={(key) =>
              setOpenBucket((prev) => (prev === key ? null : key))
            }
            anchor={(key) =>
              tourFieldAttr('writing-monitor.status-bucket', TYPE, key)
            }
            labels={BUCKET_LABELS}
          />
          {peerControl}
          {openBucket && onShowWordCounts && (
            <div
              className="flex flex-wrap items-center"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <ToggleChip
                label="Word counts"
                anchor={tourTypeAttr('writing-monitor.word-counts', TYPE)}
                on={showWordCounts}
                onToggle={() => onShowWordCounts(!showWordCounts)}
              />
            </div>
          )}
          {openBucket && (
            <WritingRosterList
              showWordCounts={showWordCounts}
              rows={rows.filter((r) => r.bucket === openBucket)}
              watchable={watchable}
              onLiveView={canLiveView ? setWatching : undefined}
            />
          )}
        </div>
      </div>
    );
  })();

  return (
    <div className="h-full w-full flex flex-col bg-white text-brand-gray-dark relative">
      <MonitorHeader
        title={title}
        status={status}
        accent={LIBRARY_HEADER_ACCENTS.writing}
        onBack={onBack}
        backAnchor={tourTypeAttr('writing-monitor.back', TYPE)}
      />
      {body}
      {session && canLiveView && watching && (
        <Suspense fallback={null}>
          <WatchPanel
            session={session}
            students={watchable}
            studentKey={watching}
            onSelect={setWatching}
            onClose={() => setWatching(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

/** One open bucket's students in the Quiz roster rows, with the Live view eye on anyone still writing. */
const WritingRosterList: React.FC<{
  rows: WritingMonitorRow[];
  watchable: WritingMonitorRow[];
  onLiveView?: (key: string) => void;
  showWordCounts: boolean;
}> = ({ rows, watchable, onLiveView, showWordCounts }) => {
  if (rows.length === 0)
    return (
      <p
        className="text-center font-sans text-brand-gray-primary"
        style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(12px, 3cqmin)' }}
      >
        No students here.
      </p>
    );
  return (
    <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
      {rows.map((row, index) => {
        const canWatch =
          !!onLiveView && watchable.some((w) => w.key === row.key);
        return (
          <RosterRow key={row.key} name={row.name} muted={!row.response}>
            {row.status === 'revising' && (
              <span className="font-sans text-brand-gray-primary" style={fact}>
                Revising
              </span>
            )}
            {row.status === 'returned' && (
              <span className="font-sans text-brand-gray-primary" style={fact}>
                Returned
              </span>
            )}
            {row.idleMs != null && (
              <RosterIdleChip minutes={Math.floor(row.idleMs / 60_000)} />
            )}
            {row.awayCount > 0 && (
              <span
                className="font-sans tabular-nums text-amber-700"
                title={`Left the page ${row.awayCount} time${row.awayCount === 1 ? '' : 's'}`}
                style={fact}
              >
                Away {formatAwayDuration(row.awayMs)}
              </span>
            )}
            {showWordCounts && row.bucket !== 'notStarted' && (
              <span
                className="font-sans tabular-nums text-brand-gray-primary"
                style={fact}
              >
                {row.wordCount} {row.wordCount === 1 ? 'word' : 'words'}
              </span>
            )}
            {canWatch && (
              <button
                type="button"
                {...tourFieldAttr(
                  'writing-monitor.live-view',
                  TYPE,
                  `row-${index + 1}`
                )}
                onClick={() => onLiveView?.(row.key)}
                title="Live view"
                aria-label={`Live view of ${row.name}`}
                className="touch-target-expand relative inline-flex shrink-0 items-center rounded-md text-brand-blue-primary hover:bg-brand-blue-lighter"
                style={{ padding: 'min(3px, 1cqmin)' }}
              >
                <Eye
                  aria-hidden
                  style={{
                    width: 'min(14px, 4.5cqmin)',
                    height: 'min(14px, 4.5cqmin)',
                  }}
                />
              </button>
            )}
          </RosterRow>
        );
      })}
    </div>
  );
};
