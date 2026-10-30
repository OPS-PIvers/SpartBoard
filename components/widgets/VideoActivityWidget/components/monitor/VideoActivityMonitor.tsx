import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Square,
} from 'lucide-react';
import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import { useDialog } from '@/context/useDialog';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  useAssignmentPseudonymsMulti,
  formatStudentName,
} from '@/hooks/useAssignmentPseudonyms';
import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import { ltiSectionsKey } from '@/utils/ltiSectionsKey';
import { logError } from '@/utils/logError';
import { useVideoActivityKeyQuestions } from '@/hooks/useVideoActivityKeyQuestions';
import { EXTEND_MS, usePeriodAccess } from '@/hooks/usePeriodAccess';
import { hasPeriodAccess } from '@/utils/periodAccess';
import { useViewAsOutward, VIEW_AS_WRITES } from '@/hooks/useViewAsOutward';
import { deriveRunState } from '@/utils/sessionLifecycle';
import { buildDistribution } from '@/utils/answerDistribution';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import { AnswerDistributionBars } from '@/components/common/AnswerDistributionBars';
import { tourAttr, tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import {
  ClassPicker,
  PeriodBar,
} from '@/components/widgets/QuizWidget/components/monitor/PeriodBar';
import { PeriodAccessStrip } from '@/components/widgets/QuizWidget/components/monitor/PeriodAccessStrip';
import type {
  MonitorFilterBy,
  MonitorSortBy,
} from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import type { VideoActivityLiveMonitorProps } from '../VideoActivityLiveMonitor';
import { VaRosterList } from './VaRosterList';
import {
  buildVaStudent,
  vaResponsePeriod,
  type VaMonitorStudent,
} from './vaMonitorData';

const TYPE = 'video-activity';

type Screen =
  | { name: 'home' }
  | { name: 'questions' }
  | { name: 'question'; index: number };

const footerButton =
  'inline-flex items-center whitespace-nowrap font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
const footerButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};
const footerIcon = {
  width: 'min(14px, 4.5cqmin)',
  height: 'min(14px, 4.5cqmin)',
};

const formatTimestamp = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Roster name, then the self-typed name, then the PIN. */
const pickDisplayLabel = (
  r: VideoActivityResponse,
  byStudentUid: Map<string, { givenName: string; familyName: string }>
): string =>
  [formatStudentName(byStudentUid.get(r.studentUid)), r.name, r.pin].find(
    (s): s is string => typeof s === 'string' && s.length > 0
  ) ?? '—';

/** Self-paced Video Activity monitor in the Quiz monitor's layout (monitor-parity). */
export const VideoActivityMonitor: React.FC<VideoActivityLiveMonitorProps> = ({
  session,
  responses,
  onEnd,
  onPause,
  onResume,
  onUnlockStudent,
  onBack,
}) => {
  const { showConfirm } = useDialog();
  const outward = useViewAsOutward();
  const { addToast, rosters } = useDashboard();
  const { orgId } = useAuth();

  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [showTabs, setShowTabs] = useState(false);
  const [sortBy, setSortBy] = useState<MonitorSortBy>('first');
  const [filterBy, setFilterBy] = useState<MonitorFilterBy>('all');
  const [ending, setEnding] = useState(false);
  const [toggling, setToggling] = useState(false);

  const periodNames = useMemo(
    () => [...new Set(session.periodNames ?? [])],
    [session.periodNames]
  );
  // '' is All classes, so the shared Pause and every class show on open.
  const [selected, setSelected] = useState<string>('');

  // Reset local navigation when the monitored session changes.
  const [prevSessionId, setPrevSessionId] = useState(session.id);
  if (session.id !== prevSessionId) {
    setPrevSessionId(session.id);
    setScreen({ name: 'home' });
    setOpenBucket(null);
    setSelected('');
  } else if (selected && !periodNames.includes(selected)) setSelected('');

  // Per-period sessions get each class's own Start and Pause.
  const perPeriod = hasPeriodAccess(session) && session.status !== 'ended';
  const periodActions = usePeriodAccess(
    perPeriod ? session : null,
    {
      sessionCollection: 'video_activity_sessions',
      assignmentCollection: 'video_activity_assignments',
      refreshIdle: false,
    },
    rosters
  );
  const runPeriod = async (fn: () => Promise<unknown>) => {
    try {
      const untimed = await fn();
      const labels = (Array.isArray(untimed) ? (untimed as string[]) : [])
        .map((key) => session.periodAccess?.[key]?.label)
        .filter(Boolean);
      if (labels.length > 0)
        addToast(
          `${labels.join(', ')} stays open until you pause it. Tag the class with its bell period in My Classes so it closes at the bell.`,
          'info'
        );
    } catch (err) {
      logError('VideoActivityMonitor.periodAccess', err);
      addToast('Could not update the period. Try again.', 'error');
    }
  };
  const periodNameFor = (key: string): string =>
    session.classPeriodByClassId?.[key] ??
    session.periodAccess?.[key]?.label ??
    key;
  const chipNames = new Set(
    Object.keys(session.periodAccess ?? {}).map(periodNameFor)
  );
  const periodBar = perPeriod && periodNames.every((p) => chipNames.has(p));
  const classPicker = periodNames.length > 1 && !perPeriod;

  // SSO students carry no PIN or typed name, so resolve roster and LTI names.
  const sessionClassIds = useMemo(() => {
    if (session.classIds && session.classIds.length > 0)
      return session.classIds;
    return session.classId ? [session.classId] : [];
  }, [session.classIds, session.classId]);
  const { byStudentUid: classLinkNames } = useAssignmentPseudonymsMulti(
    session.id,
    sessionClassIds,
    orgId
  );
  const ltiNames = useLtiSessionNames(
    session.id,
    session.ltiNrps === true,
    'va',
    ltiSectionsKey(session)
  );
  const byStudentUid = useMemo(() => {
    if (ltiNames.size === 0) return classLinkNames;
    const merged = new Map(classLinkNames);
    for (const [uid, name] of ltiNames) {
      if (!merged.has(uid)) merged.set(uid, name);
    }
    return merged;
  }, [classLinkNames, ltiNames]);

  const {
    questions,
    loading: keyLoading,
    failed: keyFailed,
  } = useVideoActivityKeyQuestions(session);

  const filteredResponses = useMemo(() => {
    // Filter only while a class control shows, so no class can be stuck hidden.
    if (periodNames.length <= 1 || !selected || !(periodBar || classPicker))
      return responses;
    return responses.filter(
      (r) => vaResponsePeriod(r, session.classPeriodByClassId) === selected
    );
  }, [
    responses,
    periodNames,
    selected,
    periodBar,
    classPicker,
    session.classPeriodByClassId,
  ]);

  const students = useMemo(
    () =>
      filteredResponses.map((r) =>
        buildVaStudent(r, questions, pickDisplayLabel(r, byStudentUid))
      ),
    [filteredResponses, questions, byStudentUid]
  );
  const byBucket = useMemo(() => {
    const out: Record<BucketKey, VaMonitorStudent[]> = {
      notStarted: [],
      inProgress: [],
      done: [],
    };
    for (const s of students) out[s.bucket].push(s);
    return out;
  }, [students]);

  // A paused run is stored as ended; the parent's pause and resume handlers tell them apart.
  const run = deriveRunState('videoActivity', { status: session.status });
  const isLive = run?.phase === 'active';
  const isStopped = run?.phase === 'ended';
  const canToggle = (onPause ?? onResume) != null;

  const handleTogglePause = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      if (isStopped) await onResume?.();
      else await onPause?.();
    } finally {
      setToggling(false);
    }
  };

  const handleEnd = async () => {
    if (outward.locked) return;
    const ok = await showConfirm(
      'Close this assignment for every class? Students lose access, and all responses are kept in the archive.',
      {
        title: 'Close for all classes',
        variant: 'warning',
        confirmLabel: 'Close all',
      }
    );
    if (!ok) return;
    outward.audit('End assignment', VIEW_AS_WRITES.end);
    setEnding(true);
    try {
      await onEnd();
    } finally {
      setEnding(false);
    }
  };

  const handleUnlock = useCallback(
    async (responseKey: string, displayName: string) => {
      if (!onUnlockStudent) return;
      const ok = await showConfirm(
        `Reopen ${displayName}'s attempt so they can resume? Their previous answers will be kept. The next time they leave the activity tab, their work will be submitted automatically.`,
        {
          title: 'Unlock attempt?',
          variant: 'warning',
          confirmLabel: 'Unlock',
          cancelLabel: 'Cancel',
        }
      );
      if (!ok) return;
      try {
        await onUnlockStudent(session.id, responseKey);
        addToast(
          `${displayName}'s attempt is unlocked — they can resume now.`,
          'success'
        );
      } catch (err) {
        logError('VideoActivityMonitor.unlockStudent', err);
        addToast(
          `Could not unlock ${displayName}'s attempt — try again or check your connection.`,
          'error'
        );
      }
    },
    [onUnlockStudent, session.id, showConfirm, addToast]
  );

  const onHome = screen.name === 'home';
  const headerTitle = onHome
    ? session.assignmentName
    : screen.name === 'question'
      ? `Q${screen.index + 1} results`
      : 'Question results';
  const statusPill = isLive
    ? { label: 'Live', cls: 'bg-white text-brand-blue-primary' }
    : run?.phase === 'waiting'
      ? { label: 'Not started', cls: 'bg-white/20 text-white' }
      : { label: 'Paused', cls: 'bg-white/20 text-white' };

  const periodControls = periodBar ? (
    <PeriodBar
      periodAccess={session.periodAccess ?? {}}
      selected={
        Object.keys(session.periodAccess ?? {}).find(
          (key) => periodNameFor(key) === selected
        ) ?? ''
      }
      onSelect={(key) => setSelected(key ? periodNameFor(key) : '')}
      onStart={(key) => runPeriod(() => periodActions.startPeriod(key))}
      onPause={(key) => runPeriod(() => periodActions.pausePeriod(key))}
      onExtend={(key, by) =>
        runPeriod(() => periodActions.extendPeriod(key, by))
      }
      extendMs={EXTEND_MS}
      anchors={{
        select: tourTypeAttr('video-activity.monitor-class-picker', TYPE),
        start: tourTypeAttr('video-activity.monitor-period-start', TYPE),
        pause: tourTypeAttr('video-activity.monitor-period-pause', TYPE),
        moreTime: tourTypeAttr('video-activity.monitor-period-more-time', TYPE),
        extend: tourTypeAttr('video-activity.monitor-period-extend', TYPE),
      }}
    />
  ) : classPicker ? (
    <ClassPicker
      names={periodNames}
      selected={selected}
      onSelect={setSelected}
      status={
        isLive ? 'active' : session.status === 'waiting' ? 'waiting' : 'paused'
      }
      onToggle={
        // One Pause stops every class, so it shows only beside All classes.
        canToggle && !selected ? handleTogglePause : undefined
      }
      toggleAnchor={tourAttr('video-activity.monitor-pause-toggle')}
      selectAnchor={tourTypeAttr('video-activity.monitor-class-picker', TYPE)}
    />
  ) : null;

  const detailQuestion: VideoActivityQuestion | undefined =
    screen.name === 'question' ? questions[screen.index] : undefined;

  return (
    <div className="h-full w-full flex flex-col bg-white text-brand-gray-dark relative font-sans">
      <div
        className="flex items-center bg-brand-blue-primary text-white shrink-0"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        {(onBack != null || !onHome) && (
          <button
            type="button"
            onClick={() =>
              onHome
                ? onBack?.()
                : setScreen(
                    screen.name === 'question'
                      ? { name: 'questions' }
                      : { name: 'home' }
                  )
            }
            aria-label="Back"
            {...tourTypeAttr('video-activity.monitor-back', TYPE)}
            className="rounded-md hover:bg-white/15 transition-colors"
            style={{ padding: 'min(4px, 1cqmin)' }}
          >
            <ArrowLeft
              style={{
                width: 'min(16px, 5cqmin)',
                height: 'min(16px, 5cqmin)',
              }}
            />
          </button>
        )}
        <p
          className="font-semibold truncate flex-1"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
        >
          {headerTitle}
        </p>
        <span
          className={`shrink-0 rounded-full font-semibold uppercase tracking-wider ${statusPill.cls}`}
          style={{
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          {statusPill.label}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        {onHome && (
          <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
            {perPeriod && !periodBar && (
              <PeriodAccessStrip
                periodAccess={session.periodAccess}
                extendMs={EXTEND_MS}
                onStart={(key) =>
                  runPeriod(() => periodActions.startPeriod(key))
                }
                onPause={(key) =>
                  runPeriod(() => periodActions.pausePeriod(key))
                }
                onExtend={(key, by) =>
                  runPeriod(() => periodActions.extendPeriod(key, by))
                }
              />
            )}
            {periodControls && (
              <div
                className="border-b border-brand-gray-lightest"
                style={{ paddingBottom: 'min(10px, 2.5cqmin)' }}
              >
                {periodControls}
              </div>
            )}
            <StatusBuckets
              counts={{
                notStarted: byBucket.notStarted.length,
                inProgress: byBucket.inProgress.length,
                done: byBucket.done.length,
              }}
              handCount={0}
              idleCount={0}
              openBucket={openBucket}
              onToggle={(key) =>
                setOpenBucket((cur) => (cur === key ? null : key))
              }
              anchor={(key) =>
                tourFieldAttr('video-activity.monitor-status-bucket', TYPE, key)
              }
            />
            {openBucket && (
              <VaRosterList
                bucket={openBucket}
                students={byBucket[openBucket]}
                session={session}
                showTabs={showTabs}
                onToggleTabs={() => setShowTabs((v) => !v)}
                sortBy={sortBy}
                onSortBy={setSortBy}
                filterBy={filterBy}
                onFilterBy={setFilterBy}
                onUnlock={
                  onUnlockStudent
                    ? (key, name) => void handleUnlock(key, name)
                    : undefined
                }
                onLetIn={
                  perPeriod
                    ? (uid) => void runPeriod(() => periodActions.letIn(uid))
                    : undefined
                }
              />
            )}
          </div>
        )}

        {screen.name === 'questions' && questions.length === 0 && (
          <div className="flex flex-col" style={{ gap: 'min(4px, 1cqmin)' }}>
            <p
              className="font-semibold text-brand-gray-dark"
              style={{ fontSize: 'min(13px, 4.5cqmin)' }}
            >
              {keyLoading
                ? 'Loading questions…'
                : keyFailed
                  ? "Couldn't load the answer key"
                  : 'No questions'}
            </p>
            {keyFailed && !keyLoading && (
              <p
                className="text-brand-gray-primary"
                style={{ fontSize: 'min(12px, 4cqmin)' }}
              >
                Reload to try again. Scores stay hidden until it loads.
              </p>
            )}
          </div>
        )}

        {screen.name === 'questions' && questions.length > 0 && (
          <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
            {questions.map((q, i) => {
              const answered = filteredResponses.filter((r) =>
                r.answers.some((a) => a.questionId === q.id)
              ).length;
              return (
                <button
                  type="button"
                  key={q.id}
                  onClick={() => setScreen({ name: 'question', index: i })}
                  {...tourFieldAttr(
                    'video-activity.monitor-question-result',
                    TYPE,
                    q.id
                  )}
                  className="flex items-center justify-between bg-white border border-brand-gray-lighter rounded-lg hover:border-brand-blue-light transition-colors text-left"
                  style={{
                    padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
                    gap: 'min(8px, 2cqmin)',
                  }}
                >
                  <div className="min-w-0">
                    <p
                      className="font-semibold text-brand-blue-primary uppercase tracking-wider tabular-nums"
                      style={{ fontSize: 'min(10px, 3.5cqmin)' }}
                    >
                      Q{i + 1} · {formatTimestamp(q.timestamp)}
                    </p>
                    <p
                      className="text-brand-gray-dark truncate"
                      style={{ fontSize: 'min(13px, 4.5cqmin)' }}
                    >
                      {q.text}
                    </p>
                  </div>
                  <div
                    className="flex items-center shrink-0"
                    style={{ gap: 'min(6px, 1.5cqmin)' }}
                  >
                    <span
                      className="text-brand-gray-primary tabular-nums"
                      style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                    >
                      {answered} answered
                    </span>
                    <ChevronRight
                      className="text-brand-gray-light"
                      aria-hidden
                      style={footerIcon}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {detailQuestion && screen.name === 'question' && (
          <QuestionDetail
            question={detailQuestion}
            index={screen.index}
            responses={filteredResponses}
          />
        )}
      </div>

      {onHome && (
        <div
          className="flex flex-wrap items-center border-t border-brand-gray-lightest shrink-0"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          {canToggle && !perPeriod && !classPicker && (
            <button
              type="button"
              onClick={() => void handleTogglePause()}
              disabled={toggling}
              {...tourAttr('video-activity.monitor-pause-toggle')}
              className={`${footerButton} bg-brand-blue-primary hover:bg-brand-blue-light text-white`}
              style={footerButtonStyle}
            >
              {toggling ? (
                <Loader2 className="animate-spin" style={footerIcon} />
              ) : isStopped ? (
                <Play style={footerIcon} />
              ) : (
                <Pause style={footerIcon} />
              )}
              {isStopped ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleEnd()}
            disabled={ending || outward.locked}
            title={outward.lockedTitle}
            {...tourAttr('video-activity.monitor-end')}
            className={`${footerButton} bg-white border border-brand-gray-lighter hover:border-brand-red-light text-brand-red-primary`}
            style={footerButtonStyle}
          >
            {ending ? (
              <Loader2 className="animate-spin" style={footerIcon} />
            ) : (
              <Square style={footerIcon} />
            )}
            Close all
          </button>
          <button
            type="button"
            onClick={() => setScreen({ name: 'questions' })}
            {...tourTypeAttr('video-activity.monitor-question-results', TYPE)}
            className={`${footerButton} ml-auto bg-white border border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light`}
            style={footerButtonStyle}
          >
            <BarChart3
              className="text-brand-blue-primary"
              style={footerIcon}
              aria-hidden
            />
            Question results
          </button>
        </div>
      )}
    </div>
  );
};

/** One question's answer spread, with the correct answers marked as the old monitor's ticks were. */
const QuestionDetail: React.FC<{
  question: VideoActivityQuestion;
  index: number;
  responses: VideoActivityResponse[];
}> = ({ question, index, responses }) => {
  const { totalAnswered, rows } = buildDistribution(
    question,
    responses,
    gradeVideoActivityAnswer
  );
  return (
    <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
      <div>
        <p
          className="font-semibold text-brand-blue-primary uppercase tracking-wider tabular-nums"
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          Question {index + 1} · {formatTimestamp(question.timestamp)} ·{' '}
          {totalAnswered} answered
        </p>
        <p
          className="font-semibold text-brand-blue-dark"
          style={{ fontSize: 'min(15px, 5.5cqmin)', lineHeight: 1.3 }}
        >
          {question.text}
        </p>
      </div>
      {rows.length > 0 ? (
        <AnswerDistributionBars
          rows={rows}
          total={totalAnswered}
          showCorrect
          correctLabel="Correct"
        />
      ) : (
        <p
          className="text-brand-gray-primary"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          No answers yet.
        </p>
      )}
    </div>
  );
};
