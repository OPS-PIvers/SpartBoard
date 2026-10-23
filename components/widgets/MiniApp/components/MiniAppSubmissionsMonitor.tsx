// Older Mini App submissions laid out like the Quiz monitor, behind `monitor-parity`.
import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Inbox, Loader2 } from 'lucide-react';
import type { MiniAppSession } from '@/types';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useDashboard } from '@/context/useDashboard';
import {
  formatStudentName,
  useAssignmentPseudonymsMulti,
  type StudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { EXTEND_MS, type PeriodAccessActions } from '@/hooks/usePeriodAccess';
import { usePeriodRunner } from '@/hooks/usePeriodRunner';
import { periodKeyForRoster } from '@/utils/periodPlan';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  ClassPicker,
  PeriodBar,
} from '@/components/widgets/QuizWidget/components/monitor/PeriodBar';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';

export interface MonitorSubmission {
  id: string;
  submittedAt: number;
  payload: unknown;
}

const NAME_TEXT = { fontSize: 'min(13px, 4.5cqmin)' } as const;
const SMALL_TEXT = { fontSize: 'min(11px, 3.8cqmin)' } as const;
const ROW_STYLE = {
  padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
  gap: 'min(8px, 2cqmin)',
} as const;

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

const byLastName = (a: StudentName, b: StudentName): number =>
  collator.compare(a.familyName, b.familyName) ||
  collator.compare(a.givenName, b.givenName);

// LMS sections carry no ClassLink roster, so no names resolve for them.
const resolvable = (key: string): boolean =>
  !!key &&
  !key.startsWith('roster:') &&
  !key.startsWith('schoology:') &&
  !key.startsWith('classroom:');

const formatTime = (ms: number): string =>
  ms > 0
    ? new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

function formatPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export const MiniAppSubmissionsMonitor: React.FC<{
  session: MiniAppSession;
  assignmentName: string;
  submissions: MonitorSubmission[];
  loading: boolean;
  error: string | null;
  /** Every targeted student, keyed by their submission id. */
  names: Map<string, StudentName>;
  namesLoading: boolean;
  namesError: boolean;
  /** Per-period sessions only: Start, Pause and More time for each class. */
  periodActions?: PeriodAccessActions;
  orgId: string | null | undefined;
  onClose: () => void;
}> = ({
  session,
  assignmentName,
  submissions,
  loading,
  error,
  names,
  namesLoading,
  namesError,
  periodActions,
  orgId,
  onClose,
}) => {
  const { rosters } = useDashboard();
  const [selected, setSelected] = useState('');
  const [openBucket, setOpenBucket] = useState<BucketKey | null>('done');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const runPeriod = usePeriodRunner(
    session.periodAccess,
    'MiniAppSubmissionsMonitor.periodAccess'
  );

  const periodAccess =
    periodActions && session.periodAccess ? session.periodAccess : null;
  const classes: { key: string; label: string }[] = periodAccess
    ? Object.entries(periodAccess).map(([key, a]) => ({ key, label: a.label }))
    : rosters
        .filter((r) => session.rosterIds?.includes(r.id))
        .map((r) => ({ key: periodKeyForRoster(r), label: r.name }))
        // Only classes the name lookup can filter, one per label.
        .filter(
          (c, i, all) =>
            resolvable(c.key) &&
            all.findIndex((o) => o.key === c.key || o.label === c.label) === i
        )
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true })
        );
  // Drop a picked class that is no longer listed.
  if (selected && !classes.some((c) => c.key === selected)) setSelected('');

  const classFilter = resolvable(selected) ? selected : '';
  const classNames = useAssignmentPseudonymsMulti(
    classFilter ? session.id : null,
    classFilter ? [classFilter] : null,
    orgId
  );
  const members = classFilter ? classNames.byAssignmentPseudonym : names;
  const membersLoading = classFilter ? classNames.loading : namesLoading;
  // A picked class whose students can't be looked up can't be filtered, so its counts stay hidden.
  const cantFilter = !!selected && (!classFilter || !!classNames.error);
  // Per-student assignments target part of a class, so the class roster can't say who hasn't started.
  // On All classes, a section the lookup can't reach (LMS, PIN roster) would be missing from Not started.
  const everyClassKnown = (
    periodAccess
      ? Object.keys(periodAccess)
      : [
          ...(session.classIds ?? []),
          ...rosters
            .filter((r) => session.rosterIds?.includes(r.id))
            .map(periodKeyForRoster),
        ]
  ).every(resolvable);
  const knowRoster =
    (!!classFilter || everyClassKnown) &&
    !membersLoading &&
    !(classFilter ? classNames.error : namesError) &&
    !session.individualTargeting &&
    members.size > 0;

  // Shared-link launches carry no name; number them by id so a resubmit doesn't renumber them.
  const unnamed = new Map(
    submissions
      .filter((s) => !formatStudentName(names.get(s.id)))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((s, i) => [s.id, `Student ${i + 1}`])
  );
  const nameOf = (id: string): string =>
    formatStudentName(names.get(id)) || (unnamed.get(id) ?? 'Student');
  const done = classFilter
    ? submissions.filter((s) => members.has(s.id))
    : submissions;
  const submitted = new Set(submissions.map((s) => s.id));
  const notStarted = knowRoster
    ? [...members]
        .filter(([id]) => !submitted.has(id))
        .sort(([, a], [, b]) => byLastName(a, b))
    : [];
  const counts = {
    notStarted: notStarted.length,
    inProgress: 0,
    done: done.length,
  };

  const statusPill =
    session.status === 'ended'
      ? { label: 'Ended', cls: 'bg-white/20 text-white' }
      : { label: 'Live', cls: 'bg-white text-brand-blue-primary' };

  const classRow =
    classes.length < 2 && !periodAccess ? null : periodAccess &&
      periodActions ? (
      <PeriodBar
        periodAccess={periodAccess}
        selected={selected}
        onSelect={setSelected}
        onStart={(key) => runPeriod(() => periodActions.startPeriod(key))}
        onPause={(key) => runPeriod(() => periodActions.pausePeriod(key))}
        onExtend={(key, by) =>
          runPeriod(() => periodActions.extendPeriod(key, by))
        }
        extendMs={EXTEND_MS}
        anchors={{
          select: tourTypeAttr('quiz-monitor.period-class-picker', 'miniApp'),
          moreTime: tourTypeAttr('quiz-monitor.period-more-time', 'miniApp'),
          start: tourTypeAttr('quiz-monitor.period-start', 'miniApp'),
          pause: tourTypeAttr('quiz-monitor.period-pause', 'miniApp'),
          extend: tourTypeAttr('quiz-monitor.period-extend', 'miniApp'),
        }}
      />
    ) : (
      <ClassPicker
        names={classes.map((c) => c.label)}
        selected={classes.find((c) => c.key === selected)?.label ?? ''}
        onSelect={(label) =>
          setSelected(classes.find((c) => c.label === label)?.key ?? '')
        }
        status={session.status === 'ended' ? 'ended' : 'active'}
        selectAnchor={tourTypeAttr(
          'quiz-monitor.period-class-picker',
          'miniApp'
        )}
      />
    );

  return (
    <div className="absolute inset-0 z-overlay flex flex-col font-sans bg-white text-brand-gray-dark">
      <div
        className="flex items-center bg-brand-blue-primary text-white shrink-0"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Back"
          {...tourTypeAttr('mini-app.submissions-close', 'miniApp')}
          className="touch-target-expand rounded-md hover:bg-white/15 transition-colors"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft
            style={{ width: 'min(16px, 5cqmin)', height: 'min(16px, 5cqmin)' }}
          />
        </button>
        <p
          className="font-sans font-semibold truncate flex-1"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
        >
          {assignmentName}
        </p>
        <span
          className={`shrink-0 rounded-full font-sans font-semibold uppercase tracking-wider ${statusPill.cls}`}
          style={{
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          {statusPill.label}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        {error ? (
          <p className="text-brand-red-primary font-medium" style={NAME_TEXT}>
            {error}
          </p>
        ) : loading || namesLoading ? (
          <div className="h-full flex items-center justify-center text-brand-blue-primary">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : submissions.length === 0 && !knowRoster && !classRow ? (
          <ScaledEmptyState
            icon={Inbox}
            title="No submissions yet"
            subtitle="Submissions appear here as students finish the activity."
          />
        ) : (
          <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
            {classRow}
            {cantFilter ? null : membersLoading ? (
              <div className="flex justify-center text-brand-blue-primary">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <>
                <StatusBuckets
                  counts={counts}
                  handCount={0}
                  idleCount={0}
                  openBucket={openBucket}
                  onToggle={(key) =>
                    setOpenBucket((cur) => (cur === key ? null : key))
                  }
                  keys={knowRoster ? ['notStarted', 'done'] : ['done']}
                  anchor={(key) =>
                    tourFieldAttr('quiz-monitor.status-bucket', 'miniApp', key)
                  }
                />
                {openBucket === 'notStarted' && knowRoster && (
                  <div
                    className="flex flex-col"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    {notStarted.length === 0 ? (
                      <EmptyLine text="No students here yet." />
                    ) : (
                      notStarted.map(([id, name]) => (
                        <div
                          key={id}
                          className="flex items-center rounded-lg border border-brand-gray-lightest bg-white"
                          style={ROW_STYLE}
                        >
                          <p
                            className="font-sans font-medium text-brand-gray-dark truncate"
                            style={NAME_TEXT}
                          >
                            {formatStudentName(name)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {openBucket === 'done' && (
                  <div
                    className="flex flex-col"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    {done.length === 0 ? (
                      <EmptyLine text="No students here yet." />
                    ) : (
                      done.map((s, i) => {
                        const open = expandedId === s.id;
                        return (
                          <div
                            key={s.id}
                            className={`rounded-lg border bg-white ${open ? 'border-brand-blue-light' : 'border-brand-gray-lightest'}`}
                            style={{
                              padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId((cur) =>
                                  cur === s.id ? null : s.id
                                )
                              }
                              aria-expanded={open}
                              {...tourFieldAttr(
                                'mini-app.submission-row',
                                'miniApp',
                                `row-${i + 1}`
                              )}
                              className="flex w-full items-center justify-between text-left"
                              style={{ gap: 'min(8px, 2cqmin)' }}
                            >
                              <span
                                className="flex items-center min-w-0"
                                style={{ gap: 'min(4px, 1cqmin)' }}
                              >
                                <ChevronRight
                                  aria-hidden
                                  className={`shrink-0 text-brand-gray-primary transition-transform ${open ? 'rotate-90' : ''}`}
                                  style={{
                                    width: 'min(12px, 3.8cqmin)',
                                    height: 'min(12px, 3.8cqmin)',
                                  }}
                                />
                                <span
                                  className="font-sans font-medium text-brand-gray-dark truncate"
                                  style={NAME_TEXT}
                                >
                                  {nameOf(s.id)}
                                </span>
                              </span>
                              <span
                                className="shrink-0 text-brand-gray-primary tabular-nums"
                                style={SMALL_TEXT}
                              >
                                {formatTime(s.submittedAt)}
                              </span>
                            </button>
                            {open && (
                              <pre
                                className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-900 p-2 text-slate-100"
                                style={{
                                  marginTop: 'min(8px, 2cqmin)',
                                  fontSize: 'min(11px, 3.5cqmin)',
                                }}
                              >
                                {formatPayload(s.payload)}
                              </pre>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
  <p
    className="text-brand-gray-primary text-center"
    style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
  >
    {text}
  </p>
);
