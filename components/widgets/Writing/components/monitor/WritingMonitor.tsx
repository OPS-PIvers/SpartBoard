// The Writing monitor (D15) in the Quiz monitor's shell: header, class picker, status counts and roster rows, with Live view and Nudge.
import React, { useCallback, useMemo, useState } from 'react';
import { Eye, Loader2, NotebookPen } from 'lucide-react';
import type {
  WritingAssignmentRecord,
  WritingAssignmentSession,
  WritingResponse,
} from '@/types';
import { useAuth } from '@/context/useAuth';
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
} from '@/components/widgets/QuizWidget/components/monitor/RosterParts';
import { hasPeriodAccess } from '@/utils/periodAccess';
import {
  buildWritingMonitorRows,
  countWritingBuckets,
  type WritingMonitorRow,
} from '@/utils/writingMonitor';
import { formatAwayDuration } from '@/utils/tabAwayLimit';
import { studentTargetRefKey } from '@/utils/studentTargetRef';
import { WritingLiveViewPanel } from './WritingLiveViewPanel';

const TYPE = 'writing';
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
  onBack: () => void;
}> = ({ sessionId, record, onBack }) => {
  const { orgId } = useAuth();
  const { session, responses, loading, missing, seenAt } =
    useWritingMonitor(sessionId);
  const [classId, setClassId] = useState('');
  const classIds = useMemo(
    () => session?.classIds ?? record?.classIds ?? [],
    [session?.classIds, record?.classIds]
  );
  const targetStudents =
    record?.targetMode === 'students' ? record.targetStudents : undefined;
  // Names for everyone the session reaches; the per-class lookup lists who hasn't opened it.
  const all = useAssignmentPseudonymsMulti(
    sessionId,
    classIds,
    orgId,
    targetStudents
  );
  const picked = useMemo(
    () => (classId ? [classId] : classIds),
    [classId, classIds]
  );
  const roster = useAssignmentPseudonymsMulti(
    sessionId,
    picked,
    orgId,
    targetStudents
  );
  const excluded = useMemo(
    () => new Set((record?.excludedTargets ?? []).map(studentTargetRefKey)),
    [record?.excludedTargets]
  );
  // Without the targeting record, or with picked students (refs carry no class), roster rows would list the wrong students.
  const rosterKnown =
    !!record && !roster.loading && !(classId && targetStudents);
  const rosterUids = useMemo(() => {
    const out: string[] = [];
    if (!rosterKnown) return out;
    for (const uid of roster.byStudentUid.keys()) {
      const ref = roster.targetRefKeyByStudentUid.get(uid);
      if (!ref || !excluded.has(ref)) out.push(uid);
    }
    return out;
  }, [
    rosterKnown,
    roster.byStudentUid,
    roster.targetRefKeyByStudentUid,
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
  const runPeriod = usePeriodRunner(
    record?.periodAccess,
    'WritingMonitor.periodAccess'
  );
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
  return (
    <WritingMonitorView
      session={session}
      periodBar={periodBar}
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
  /** Per-class access; null shows the plain class picker. */
  periodBar?: WritingPeriodBar | null;
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
}) => {
  const now = useServerNow(15_000);
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
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
          {openBucket && (
            <WritingRosterList
              rows={rows.filter((r) => r.bucket === openBucket)}
              watchable={watchable}
              onLiveView={setWatching}
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
        onBack={onBack}
        backAnchor={tourTypeAttr('writing-monitor.back', TYPE)}
      />
      {body}
      {session && watching && (
        <WritingLiveViewPanel
          session={session}
          students={watchable}
          studentKey={watching}
          onSelect={setWatching}
          onClose={() => setWatching(null)}
        />
      )}
    </div>
  );
};

/** One open bucket's students in the Quiz roster rows, with the Live view eye on anyone still writing. */
const WritingRosterList: React.FC<{
  rows: WritingMonitorRow[];
  watchable: WritingMonitorRow[];
  onLiveView: (key: string) => void;
}> = ({ rows, watchable, onLiveView }) => {
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
        const canWatch = watchable.some((w) => w.key === row.key);
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
            {row.bucket !== 'notStarted' && (
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
                onClick={() => onLiveView(row.key)}
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
