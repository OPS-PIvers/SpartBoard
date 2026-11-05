import React from 'react';
import {
  AlertTriangle,
  Timer,
  Hand,
  ImageOff,
  Lock,
  Unlock,
} from 'lucide-react';
import { QuizSession, QuizConfig, StudentOverride } from '@/types';
import {
  AwayNowChip,
  TabExitsPopover,
} from '@/components/common/TabExitsPopover';
import { useServerNow } from '@/hooks/useServerNow';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { studentCanEnter } from '@/utils/periodAccess';
import { canTeacherSubmit } from '@/utils/quizTeacherSubmit';
import { MonitorStudent } from './useMonitorData';
import { BucketKey } from './StatusBuckets';
import { MonitorFilterBy, MonitorSortBy, orderRoster } from './monitorUtils';
import {
  BAND_TINT,
  rosterFieldStyle as fieldStyle,
  rosterIconSize as iconSize,
} from './rosterStyles';
import {
  RosterIdleChip,
  RosterOnQuestion,
  RosterRow,
  RosterRowMenu,
  RosterScorePill,
  RosterToolbar,
  type RosterMenuItem,
} from './RosterParts';
import {
  QUIZ_TIME_LIMIT_WARN_MS,
  formatTimeLeft,
  resolveAttemptDeadline,
  timestampMillis,
} from '@/utils/quizTimeLimit';
import {
  hasReachedTabWarningThreshold,
  resolveStudentTabWarningThreshold,
} from '@/utils/tabWarningThreshold';
import { partsDoneOf } from '@/utils/quizParts';
import { isResponseWaiting } from './openPart';

interface RosterListProps {
  bucket: BucketKey;
  students: MonitorStudent[];
  session: QuizSession;
  config: QuizConfig;
  isGamified: boolean;
  onUpdateConfig: (updates: Partial<QuizConfig>) => void;
  onRemove?: (key: string) => void;
  onUnlockAttempt?: (key: string) => void;
  /** Turns in a student's saved answers for them. */
  onSubmitForStudent?: (key: string) => void;
  onUnlockResults?: (key: string) => void;
  onClearHand?: (key: string) => void;
  /** Per-period sessions: unlock one student past their period's state. */
  onLetIn?: (studentUid: string) => void;
  /** Quizzes with a Stop: open the next part for one waiting student. */
  onOpenPart?: (key: string, part: number) => void;
  /** M17 E2 F2: the active assignment's per-student overrides, keyed by
   *  `StudentTargetRef` key. */
  overridesBySourcedId?: Record<string, StudentOverride> | null;
  /** M17 E2 F2: `studentUid` -> `StudentTargetRef` key, for resolving the row
   *  above against `overridesBySourcedId`. */
  targetRefKeyByStudentUid?: Map<string, string> | null;
}

/** Time left on a student's overall quiz time limit; ticks on its own so the list doesn't. */
const TimeLeft: React.FC<{ deadline: number }> = ({ deadline }) => {
  const now = useServerNow(1000);
  const left = Math.max(0, deadline - now);
  const text = formatTimeLeft(left);
  return (
    <span
      className={`inline-flex items-center font-sans tabular-nums ${
        left <= QUIZ_TIME_LIMIT_WARN_MS
          ? 'text-amber-700 font-semibold'
          : 'text-brand-gray-primary'
      }`}
      title="Time left"
      aria-label={`Time left ${text}`}
      style={{ gap: 'min(2px, 0.5cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
    >
      <Timer aria-hidden style={iconSize} />
      {text}
    </span>
  );
};

const RowMenu: React.FC<{
  student: MonitorStudent;
  session: QuizSession;
  now: number;
  onRemove?: (key: string) => void;
  onUnlockAttempt?: (key: string) => void;
  onSubmitForStudent?: (key: string) => void;
  onUnlockResults?: (key: string) => void;
  onLetIn?: (studentUid: string) => void;
  onOpenPart?: (key: string, part: number) => void;
  overridesBySourcedId?: Record<string, StudentOverride> | null;
  targetRefKeyByStudentUid?: Map<string, string> | null;
}> = ({
  student,
  session,
  now,
  onRemove,
  onUnlockAttempt,
  onSubmitForStudent,
  onUnlockResults,
  onLetIn,
  onOpenPart,
  overridesBySourcedId,
  targetRefKeyByStudentUid,
}) => {
  const r = student.response;
  const attemptLimit = session.attemptLimit;
  const tabThreshold = resolveStudentTabWarningThreshold(
    session.tabWarningThreshold,
    r.studentUid,
    overridesBySourcedId,
    targetRefKeyByStudentUid
  );
  const locked =
    !r.unlocked &&
    ((r.status === 'completed' &&
      hasReachedTabWarningThreshold(r.tabSwitchWarnings ?? 0, tabThreshold)) ||
      (typeof attemptLimit === 'number' &&
        attemptLimit > 0 &&
        (r.completedAttempts ?? 0) >= attemptLimit));

  const items: RosterMenuItem[] = [];
  if (
    onLetIn &&
    r.studentUid &&
    r.status !== 'completed' &&
    !studentCanEnter(session, r.classId ? [r.classId] : [], r.studentUid, now)
  )
    items.push({
      label: 'Let in now',
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-let-in', 'quiz'),
      onClick: () => onLetIn(r.studentUid),
    });
  if (onOpenPart && isResponseWaiting(session, r)) {
    const part = partsDoneOf(r) + 1;
    items.push({
      label: `Open Part ${part}`,
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-open-part', 'quiz'),
      onClick: () => onOpenPart(student.key, part),
    });
  }
  if (locked && onUnlockAttempt)
    items.push({
      label: 'Unlock attempt',
      tour: tourTypeAttr('quiz-monitor.student-unlock-attempt', 'quiz'),
      onClick: () => onUnlockAttempt(student.key),
    });
  if (onSubmitForStudent && canTeacherSubmit(r))
    items.push({
      label: 'Submit for student',
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-submit', 'quiz'),
      onClick: () => onSubmitForStudent(student.key),
    });
  if (r.resultsLockedOut && onUnlockResults)
    items.push({
      label: 'Unlock results',
      tour: tourTypeAttr('quiz-monitor.student-unlock-results', 'quiz'),
      onClick: () => onUnlockResults(student.key),
    });
  if (onRemove)
    items.push({
      label: 'Remove student',
      confirmLabel: 'Confirm remove',
      danger: true,
      tour: tourTypeAttr('quiz-monitor.student-remove', 'quiz'),
      onClick: () => onRemove(student.key),
    });

  return (
    <RosterRowMenu
      ariaLabel={`Actions for ${student.name}`}
      triggerAnchor={tourFieldAttr(
        'quiz-monitor.roster-row-actions',
        'quiz',
        student.key
      )}
      items={items}
    />
  );
};

export const RosterList: React.FC<RosterListProps> = ({
  bucket,
  students,
  session,
  config,
  isGamified,
  onUpdateConfig,
  onRemove,
  onUnlockAttempt,
  onSubmitForStudent,
  onUnlockResults,
  onClearHand,
  onLetIn,
  onOpenPart,
  overridesBySourcedId = null,
  targetRefKeyByStudentUid = null,
}) => {
  const now = useServerNow(onLetIn ? 30_000 : null);
  const showToolbar = bucket !== 'notStarted';
  const showScores = (config.monitorShowScores ?? false) && bucket === 'done';
  const tabWarningsAllowed = session.tabWarningsEnabled !== false;
  const showTabs =
    (config.monitorShowTabWarnings ?? false) && tabWarningsAllowed;
  const showProf =
    (config.monitorShowProficiency ?? false) && bucket === 'done';
  const sortBy: MonitorSortBy = config.monitorSortBy ?? 'first';
  const filterBy: MonitorFilterBy = config.monitorFilterBy ?? 'all';

  // Board view (default): per-student hand/idle flags stay off the projected face; counts live in StatusBuckets.
  const showFlags =
    bucket === 'inProgress' && !(config.monitorBoardView ?? true);
  const handRaiseOn = session.handRaiseEnabled === true;
  const hands =
    showFlags && handRaiseOn ? students.filter((s) => s.hand != null) : [];
  const handKeys = new Set(hands.map((s) => s.key));
  const rest = orderRoster(
    students.filter((s) => !handKeys.has(s.key)),
    (s) => ({
      name: s.name,
      status: s.response.status,
      score: s.bandScore,
      tabWarnings: s.tabWarnings,
    }),
    sortBy,
    filterBy,
    showToolbar
  );

  return (
    <div
      className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
      style={{ gap: 'min(8px, 2cqmin)' }}
    >
      {showToolbar && (
        <RosterToolbar
          bucket={bucket}
          prefs={config}
          onUpdate={onUpdateConfig}
          tabWarningsAllowed={tabWarningsAllowed}
        />
      )}

      {hands.map((s) => (
        <div
          key={s.key}
          data-testid="hand-row"
          className="flex items-center justify-between bg-brand-blue-lighter rounded-lg"
          style={{
            padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
            gap: 'min(8px, 2cqmin)',
          }}
        >
          <div
            className="flex items-center min-w-0"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <Hand
              className="text-brand-blue-primary shrink-0"
              aria-hidden
              style={{
                width: 'min(14px, 4.5cqmin)',
                height: 'min(14px, 4.5cqmin)',
              }}
            />
            <div className="min-w-0">
              <p
                className="font-sans font-semibold text-brand-gray-dark truncate"
                style={{ fontSize: 'min(13px, 4.5cqmin)' }}
              >
                {s.name}
              </p>
              <p
                className="text-brand-blue-dark"
                style={{ fontSize: 'min(10px, 3.5cqmin)' }}
              >
                {`Raised hand${(s.hand ?? 0) >= 1 ? ` ${s.hand} min ago` : ''} · Q${s.onQuestion}`}
              </p>
            </div>
          </div>
          {onClearHand && (
            <button
              onClick={() => onClearHand(s.key)}
              {...tourFieldAttr('quiz-monitor.clear-hand', 'quiz', s.key)}
              className="shrink-0 rounded-md border border-brand-blue-primary text-brand-blue-primary hover:bg-brand-blue-primary hover:text-white font-sans font-medium transition-colors"
              style={fieldStyle}
            >
              Clear
            </button>
          )}
        </div>
      ))}

      {rest.length === 0 && hands.length === 0 && (
        <p
          className="text-brand-gray-primary text-center"
          style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
        >
          {students.length === 0
            ? 'No students here yet.'
            : 'No students match this filter.'}
        </p>
      )}

      {rest.map((s) => {
        const r = s.response;
        const tint = showProf && s.band ? BAND_TINT[s.band] : 'bg-white';
        const tabThreshold = resolveStudentTabWarningThreshold(
          session.tabWarningThreshold,
          r.studentUid,
          overridesBySourcedId,
          targetRefKeyByStudentUid
        );
        const refKey = targetRefKeyByStudentUid?.get(r.studentUid);
        const deadline =
          session.sessionMode === 'student'
            ? resolveAttemptDeadline(
                timestampMillis(r.attemptStartedAt),
                session.timeLimitMinutes,
                refKey
                  ? overridesBySourcedId?.[refKey]?.timeMultiplier
                  : undefined
              )
            : null;
        const locked =
          !r.unlocked &&
          ((r.status === 'completed' &&
            hasReachedTabWarningThreshold(
              r.tabSwitchWarnings ?? 0,
              tabThreshold
            )) ||
            (typeof session.attemptLimit === 'number' &&
              session.attemptLimit > 0 &&
              (r.completedAttempts ?? 0) >= session.attemptLimit));
        return (
          <RosterRow
            key={s.key}
            name={s.name}
            tint={tint}
            nameNote={
              s.duplicate && (
                <span
                  className="shrink-0 text-brand-red-primary font-sans"
                  title="Possible duplicate identity"
                  style={{ fontSize: 'min(9px, 3cqmin)' }}
                >
                  duplicate?
                </span>
              )
            }
          >
            {bucket === 'inProgress' && (
              <RosterOnQuestion index={s.onQuestion} />
            )}
            {r.status !== 'completed' && deadline != null && (
              <TimeLeft deadline={deadline} />
            )}
            {bucket === 'done' && r.timeUp && (
              <span
                className="inline-flex items-center text-brand-gray-primary font-sans"
                title="Submitted when time ran out"
                style={{
                  gap: 'min(2px, 0.5cqmin)',
                  fontSize: 'min(11px, 3.8cqmin)',
                }}
              >
                <Timer aria-hidden style={iconSize} />
                Time up
              </span>
            )}
            {showFlags && s.idle != null && <RosterIdleChip minutes={s.idle} />}
            {Object.keys(r.stimulusErrors ?? {}).length > 0 && (
              <ImageOff
                className="text-amber-600"
                aria-label="Stimulus failed to load for this student"
                style={{
                  width: 'min(12px, 4cqmin)',
                  height: 'min(12px, 4cqmin)',
                }}
              />
            )}
            {showTabs && (
              <AwayNowChip
                exits={r.tabExits}
                completed={r.status === 'completed'}
                sessionActive={session.status === 'active'}
                style={{ fontSize: 'min(11px, 3.8cqmin)' }}
              />
            )}
            {showTabs && s.tabWarnings > 0 && (
              <TabExitsPopover
                exits={r.tabExits}
                warnings={s.tabWarnings}
                studentName={s.name}
                completed={r.status === 'completed'}
                sessionEnded={session.status === 'ended'}
              >
                <span
                  className="inline-flex items-center text-brand-red-primary font-sans font-semibold tabular-nums"
                  title={`${s.tabWarnings} tab-switch warning${s.tabWarnings === 1 ? '' : 's'}`}
                  style={{
                    gap: 'min(2px, 0.5cqmin)',
                    fontSize: 'min(11px, 3.8cqmin)',
                  }}
                >
                  <AlertTriangle
                    aria-hidden
                    style={{
                      width: 'min(12px, 4cqmin)',
                      height: 'min(12px, 4cqmin)',
                    }}
                  />
                  {s.tabWarnings}
                </span>
              </TabExitsPopover>
            )}
            {locked && (
              <Lock
                className="text-brand-gray-primary"
                aria-label="Locked"
                style={{
                  width: 'min(12px, 4cqmin)',
                  height: 'min(12px, 4cqmin)',
                }}
              />
            )}
            {r.unlocked && r.status !== 'completed' && (
              <Unlock
                className="text-emerald-600"
                aria-label="Resumed after unlock"
                style={{
                  width: 'min(12px, 4cqmin)',
                  height: 'min(12px, 4cqmin)',
                }}
              />
            )}
            {showScores && (
              <RosterScorePill
                score={s.displayScore}
                suffix={isGamified ? ' pts' : '%'}
                awaitingGrade={s.awaitingGrade}
              />
            )}
            <RowMenu
              student={s}
              session={session}
              now={now}
              onLetIn={onLetIn}
              onOpenPart={onOpenPart}
              onRemove={onRemove}
              onUnlockAttempt={onUnlockAttempt}
              onSubmitForStudent={onSubmitForStudent}
              onUnlockResults={onUnlockResults}
              overridesBySourcedId={overridesBySourcedId}
              targetRefKeyByStudentUid={targetRefKeyByStudentUid}
            />
          </RosterRow>
        );
      })}
    </div>
  );
};
