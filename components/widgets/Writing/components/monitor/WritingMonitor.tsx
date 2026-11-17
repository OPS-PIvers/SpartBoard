// The Writing monitor (D15): who has started, word counts and time away, with Live view and Nudge.
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Eye, Loader2, NotebookPen } from 'lucide-react';
import type {
  WritingAssignmentRecord,
  WritingAssignmentSession,
  WritingResponse,
  WritingResponseStatus,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useWritingMonitor } from '@/hooks/useWritingMonitor';
import {
  useAssignmentPseudonymsMulti,
  type StudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useServerNow } from '@/hooks/useServerNow';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import {
  buildWritingMonitorRows,
  countWritingBuckets,
  savedAgo,
  type WritingMonitorRow,
} from '@/utils/writingMonitor';
import { formatAwayDuration } from '@/utils/tabAwayLimit';
import { studentTargetRefKey } from '@/utils/studentTargetRef';
import { WritingLiveViewPanel } from './WritingLiveViewPanel';

const ACCENT = LIBRARY_HEADER_ACCENTS.writing ?? '#0f766e';
const BUCKET_LABELS: Partial<Record<BucketKey, string>> = {
  done: 'Turned in',
};
const DONE_LABEL: Partial<Record<WritingResponseStatus, string>> = {
  'turned-in': 'Turned in',
  returned: 'Returned',
};
const text = {
  name: { fontSize: 'min(14px, 4.8cqmin)' },
  sub: { fontSize: 'min(12px, 4cqmin)' },
};
const icon = { width: 'min(14px, 4.5cqmin)', height: 'min(14px, 4.5cqmin)' };

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

/** The row's second line: the facts a teacher scans for. */
const rowFacts = (row: WritingMonitorRow, now: number): string[] => {
  if (!row.response) return ['Not opened'];
  const facts: string[] = [];
  if (row.status === 'revising') facts.push('Revising');
  if (row.bucket === 'notStarted') facts.push('Opened');
  else facts.push(plural(row.wordCount, 'word'));
  if (row.bucket !== 'done') {
    const saved = savedAgo(row.savedAt, now);
    if (saved) facts.push(saved);
  }
  if (row.awayCount > 0)
    facts.push(
      `Away ${formatAwayDuration(row.awayMs)}, ${plural(row.awayCount, 'time')}`
    );
  return facts;
};

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
  return (
    <WritingMonitorView
      session={session}
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
  const shown = openBucket ? rows.filter((r) => r.bucket === openBucket) : rows;
  // Live view steps through students who can still write, in list order.
  const watchable = rows.filter(
    (r) => r.response && (r.status === 'draft' || r.status === 'revising')
  );
  const title = (session?.title ?? fallbackTitle ?? '') || 'Writing assignment';

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
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        style={{
          gap: 'min(10px, 2.5cqmin)',
          padding: 'min(12px, 3cqmin)',
          paddingBottom: 'min(24px, 6cqmin)',
        }}
      >
        {classIds.length > 1 && (
          <select
            aria-label="Class"
            {...tourTypeAttr('writing-monitor.class-picker', 'writing')}
            value={classId}
            onChange={(e) => onClassChange(e.target.value)}
            className="self-start rounded-md border border-brand-gray-lighter bg-white font-sans font-bold text-brand-blue-dark"
            style={{
              fontSize: 'min(15px, 5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
            }}
          >
            <option value="">All classes</option>
            {classIds.map((id) => (
              <option key={id} value={id}>
                {classLabel(id)}
              </option>
            ))}
          </select>
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
            tourFieldAttr('writing-monitor.status-bucket', 'writing', key)
          }
          labels={BUCKET_LABELS}
        />
        {shown.length === 0 ? (
          <p
            className="text-center font-sans text-brand-gray-primary"
            style={{ ...text.sub, padding: 'min(12px, 3cqmin)' }}
          >
            {rows.length === 0 ? 'No students yet.' : 'No students here.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-brand-gray-lightest border-y border-brand-gray-lightest bg-white">
            {shown.map((row, index) => {
              const canWatch = watchable.some((w) => w.key === row.key);
              const doneLabel = row.status ? DONE_LABEL[row.status] : null;
              return (
                <li
                  key={row.key}
                  className="flex items-center justify-between"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    padding: 'min(8px, 2cqmin) min(6px, 1.5cqmin)',
                  }}
                >
                  <div className="flex min-w-0 flex-col">
                    <span
                      className={`truncate font-sans font-medium ${row.response ? 'text-brand-gray-dark' : 'text-brand-gray-primary'}`}
                      style={text.name}
                    >
                      {row.name}
                    </span>
                    <span
                      className="font-sans text-brand-gray-primary tabular-nums"
                      style={text.sub}
                    >
                      {rowFacts(row, now).join(' · ')}
                    </span>
                  </div>
                  <div
                    className="flex shrink-0 items-center"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    {row.idleMs != null && (
                      <span
                        className="font-sans tabular-nums text-amber-700"
                        style={text.sub}
                      >
                        Idle {Math.floor(row.idleMs / 60_000)} min
                      </span>
                    )}
                    {doneLabel && (
                      <span
                        className="font-sans font-semibold text-emerald-700"
                        style={text.sub}
                      >
                        {doneLabel}
                      </span>
                    )}
                    {canWatch && (
                      <button
                        type="button"
                        onClick={() => setWatching(row.key)}
                        {...tourFieldAttr(
                          'writing-monitor.live-view',
                          'writing',
                          `row-${index + 1}`
                        )}
                        className="inline-flex items-center rounded-md border border-brand-gray-lighter bg-white font-sans font-semibold text-brand-gray-dark transition-colors hover:bg-brand-gray-lightest"
                        style={{
                          gap: 'min(4px, 1cqmin)',
                          padding: 'min(5px, 1.2cqmin) min(8px, 2cqmin)',
                          ...text.sub,
                        }}
                      >
                        <Eye aria-hidden style={icon} />
                        Live view
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div
        className="flex shrink-0 items-center text-white"
        style={{
          backgroundColor: ACCENT,
          gap: 'min(8px, 2cqmin)',
          padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          {...tourTypeAttr('writing-monitor.back', 'writing')}
          className="rounded-md p-1 transition-colors hover:bg-white/15"
        >
          <ArrowLeft aria-hidden style={icon} />
        </button>
        <h2
          className="min-w-0 truncate font-sans font-bold"
          style={{ fontSize: 'min(15px, 5cqmin)' }}
        >
          {title}
        </h2>
      </div>
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
