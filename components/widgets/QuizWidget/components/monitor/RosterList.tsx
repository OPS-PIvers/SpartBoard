import React from 'react';
import {
  AlertTriangle,
  Eye,
  Timer,
  Hand,
  ImageOff,
  Lock,
  Monitor,
  MousePointerClick,
  Unlock,
  FileScan,
  CalendarClock,
} from 'lucide-react';
import { QuizSession, QuizConfig, StudentOverride } from '@/types';
import {
  AwayNowChip,
  TabExitsPopover,
} from '@/components/common/TabExitsPopover';
import { InputSignalsBadge } from '@/components/common/InputSignalsPopover';
import { useServerNow } from '@/hooks/useServerNow';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { studentSetTime } from '@/utils/periodAccess';
import { studentCanEnterAnyGate } from '@/utils/perClassConversion';
import { formatStudentTime, formatStudentTimeStart } from './studentTimeFormat';
import { canTeacherSubmit, isTabLockedOut } from '@/utils/quizTeacherSubmit';
import { MonitorStudent } from './useMonitorData';
import { BucketKey } from './StatusBuckets';
import {
  MonitorFilterBy,
  MonitorSortBy,
  isClaimedPaperRow,
  orderRoster,
} from './monitorUtils';
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
  ToggleChip,
  type RosterMenuItem,
} from './RosterParts';
import {
  QUIZ_TIME_LIMIT_WARN_MS,
  classPauses,
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
import type { NotJoinedStudent } from './rosterNotJoined';

interface RosterListProps {
  bucket: BucketKey;
  students: MonitorStudent[];
  /** Not started only: roster students who haven't opened the quiz, listed after the joined ones. */
  notJoined?: NotJoinedStudent[];
  /** Marks a student who hasn't joined absent for today, or present again. */
  onSetAbsent?: (student: NotJoinedStudent, absent: boolean) => void;
  /** Printed group stacks; a response scanned from one shows a Paper badge. */
  paperBatchIds?: ReadonlySet<string>;
  session: QuizSession;
  config: QuizConfig;
  isGamified: boolean;
  onUpdateConfig: (updates: Partial<QuizConfig>) => void;
  onRemove?: (key: string) => void;
  onUnlockAttempt?: (key: string) => void;
  /** Reopens a turned-in attempt with its answers kept. */
  onReopen?: (key: string) => void;
  /** Turns in a student's saved answers for them. */
  onSubmitForStudent?: (key: string) => void;
  /** Hands a claimed scanned row back to its PIN so another device can join. */
  onReleasePaperRow?: (key: string) => void;
  onUnlockResults?: (key: string) => void;
  onClearHand?: (key: string) => void;
  /** Per-period sessions: unlock one student past their period's state. */
  onLetIn?: (studentUid: string) => void;
  /** Per-period sessions: opens the dialog that sets one student's own time. */
  onSetTime?: (studentUid: string, name: string) => void;
  /** Quizzes with a Stop: open the next part for one waiting student. */
  onOpenPart?: (key: string, part: number) => void;
  /** M17 E2 F2: the active assignment's per-student overrides, keyed by
   *  `StudentTargetRef` key. */
  overridesBySourcedId?: Record<string, StudentOverride> | null;
  /** M17 E2 F2: `studentUid` -> `StudentTargetRef` key, for resolving the row
   *  above against `overridesBySourcedId`. */
  targetRefKeyByStudentUid?: Map<string, string> | null;
  /** Shows the Board view chip here because the settings screen holds the assignment's steps. */
  boardViewChip?: boolean;
  /** Opens Live view on an in-progress student; absent when this teacher can't use it. */
  onLiveView?: (key: string) => void;
  /** Prints a paper copy for one student; offered only on rows in `printCopyKeys`. */
  onPrintCopy?: (key: string) => void;
  printCopyKeys?: ReadonlySet<string>;
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

const PRINT_COPY_LABEL = 'Print paper copy';

const StudentSetTimeText: React.FC<{
  session: QuizSession;
  uid: string | undefined;
}> = ({ session, uid }) => {
  const time = studentSetTime(session, uid);
  return time ? <SetTimeText time={time} /> : null;
};

/** The time a teacher set for one student, on their roster row. */
const SetTimeText: React.FC<{ time: { from: number; until: number } }> = ({
  time,
}) => (
  <span
    className="inline-flex shrink-0 items-center whitespace-nowrap font-sans text-brand-blue-primary"
    title={formatStudentTime(time)}
    style={{ gap: 'min(3px, 0.8cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
  >
    <CalendarClock aria-hidden className="shrink-0" style={iconSize} />
    {formatStudentTimeStart(time.from)}
  </span>
);

const RowMenu: React.FC<{
  student: MonitorStudent;
  session: QuizSession;
  now: number;
  onRemove?: (key: string) => void;
  onUnlockAttempt?: (key: string) => void;
  onReopen?: (key: string) => void;
  onSubmitForStudent?: (key: string) => void;
  onReleasePaperRow?: (key: string) => void;
  onUnlockResults?: (key: string) => void;
  onLetIn?: (studentUid: string) => void;
  onSetTime?: (studentUid: string, name: string) => void;
  onOpenPart?: (key: string, part: number) => void;
  onPrintCopy?: (key: string) => void;
  overridesBySourcedId?: Record<string, StudentOverride> | null;
  targetRefKeyByStudentUid?: Map<string, string> | null;
  /** 1-based position in the roster, for the tour anchor. */
  tourRow: number;
}> = ({
  student,
  tourRow,
  session,
  now,
  onRemove,
  onUnlockAttempt,
  onReopen,
  onSubmitForStudent,
  onReleasePaperRow,
  onUnlockResults,
  onLetIn,
  onSetTime,
  onOpenPart,
  onPrintCopy,
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
  const tabLocked = isTabLockedOut(r, tabThreshold);
  const locked =
    !r.unlocked &&
    (tabLocked ||
      (typeof attemptLimit === 'number' &&
        attemptLimit > 0 &&
        (r.completedAttempts ?? 0) >= attemptLimit));
  // A turned-in attempt reopens without the one-exit rule; a tab lockout still unlocks with it.
  const canReopen = !!onReopen && r.status === 'completed' && !tabLocked;

  const items: RosterMenuItem[] = [];
  if (
    onLetIn &&
    r.studentUid &&
    r.status !== 'completed' &&
    !studentCanEnterAnyGate(
      session,
      r.classId ? [r.classId] : [],
      r.studentUid,
      now
    )
  )
    items.push({
      label: 'Let in now',
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-let-in', 'quiz'),
      onClick: () => onLetIn(r.studentUid),
    });
  if (onSetTime && r.studentUid && r.status !== 'completed') {
    const uid = r.studentUid;
    items.push({
      label: 'Schedule for later',
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-set-time', 'quiz'),
      onClick: () => onSetTime(uid, student.name),
    });
  }
  if (onOpenPart && isResponseWaiting(session, r)) {
    const part = partsDoneOf(r) + 1;
    items.push({
      label: `Open Part ${part}`,
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-open-part', 'quiz'),
      onClick: () => onOpenPart(student.key, part),
    });
  }
  if (canReopen)
    items.push({
      label: 'Reopen',
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-reopen', 'quiz'),
      onClick: () => onReopen?.(student.key),
    });
  else if (locked && onUnlockAttempt)
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
  if (onReleasePaperRow && isClaimedPaperRow(student.key, r))
    items.push({
      label: 'Let student rejoin',
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-release-paper', 'quiz'),
      onClick: () => onReleasePaperRow(student.key),
    });
  if (r.resultsLockedOut && onUnlockResults)
    items.push({
      label: 'Unlock results',
      tour: tourTypeAttr('quiz-monitor.student-unlock-results', 'quiz'),
      onClick: () => onUnlockResults(student.key),
    });
  if (onPrintCopy)
    items.push({
      label: PRINT_COPY_LABEL,
      closes: true,
      tour: tourTypeAttr('quiz-monitor.student-print-copy', 'quiz'),
      onClick: () => onPrintCopy(student.key),
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
        `row-${tourRow}`
      )}
      items={items}
    />
  );
};

export const RosterList: React.FC<RosterListProps> = ({
  bucket,
  students,
  notJoined = [],
  onSetAbsent,
  paperBatchIds,
  session,
  config,
  isGamified,
  onUpdateConfig,
  onRemove,
  onUnlockAttempt,
  onReopen,
  onSubmitForStudent,
  onReleasePaperRow,
  onUnlockResults,
  onClearHand,
  onLetIn,
  onSetTime,
  onOpenPart,
  overridesBySourcedId = null,
  targetRefKeyByStudentUid = null,
  boardViewChip = false,
  onLiveView,
  onPrintCopy,
  printCopyKeys,
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
  // Matches the joined rows above, which Not started always sorts by first name.
  const absent = [...notJoined].sort(
    (a, b) =>
      Number(a.absent) - Number(b.absent) || a.name.localeCompare(b.name)
  );
  const showJoined = absent.length > 0;
  // Tour row numbers ignore the absent sort, so marking a student absent keeps their number.
  const absentTourOrder = new Map(
    [...notJoined]
      .sort((x, y) => x.name.localeCompare(y.name))
      .map((s, i) => [s.key, i] as const)
  );

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
          leading={
            boardViewChip && bucket === 'inProgress' ? (
              <ToggleChip
                label="Board view"
                anchor={tourTypeAttr('quiz-monitor.roster-board-view', 'quiz')}
                on={config.monitorBoardView ?? true}
                onToggle={() =>
                  onUpdateConfig({
                    monitorBoardView: !(config.monitorBoardView ?? true),
                  })
                }
              />
            ) : undefined
          }
        />
      )}

      {hands.map((s, rowIndex) => (
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
              {...tourFieldAttr(
                'quiz-monitor.clear-hand',
                'quiz',
                `row-${rowIndex + 1}`
              )}
              className="shrink-0 rounded-md border border-brand-blue-primary text-brand-blue-primary hover:bg-brand-blue-primary hover:text-white font-sans font-medium transition-colors"
              style={fieldStyle}
            >
              Clear
            </button>
          )}
        </div>
      ))}

      {rest.length === 0 && hands.length === 0 && absent.length === 0 && (
        <p
          className="text-brand-gray-primary text-center"
          style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
        >
          {students.length === 0
            ? 'No students here yet.'
            : 'No students match this filter.'}
        </p>
      )}

      {rest.map((s, restIndex) => {
        const r = s.response;
        const tint = showProf && s.band ? BAND_TINT[s.band] : 'bg-white';
        const tabThreshold = resolveStudentTabWarningThreshold(
          session.tabWarningThreshold,
          r.studentUid,
          overridesBySourcedId,
          targetRefKeyByStudentUid
        );
        const refKey = targetRefKeyByStudentUid?.get(r.studentUid);
        const pauses = classPauses(session, r.classId);
        const deadline =
          session.sessionMode === 'student' && !pauses.paused
            ? resolveAttemptDeadline(
                timestampMillis(r.attemptStartedAt),
                session.timeLimitMinutes,
                refKey
                  ? overridesBySourcedId?.[refKey]?.timeMultiplier
                  : undefined,
                pauses.pauseSpans
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
            {bucket !== 'done' && onSetTime && (
              <StudentSetTimeText session={session} uid={r.studentUid} />
            )}
            {bucket === 'inProgress' && (
              <RosterOnQuestion index={s.onQuestion} />
            )}
            {showJoined && bucket === 'notStarted' && (
              <span
                className="font-sans font-medium text-emerald-700"
                style={{ fontSize: 'min(11px, 3.8cqmin)' }}
              >
                Joined
              </span>
            )}
            {r.status !== 'completed' && deadline != null && (
              <TimeLeft deadline={deadline} />
            )}
            {r.paperBatchId && paperBatchIds?.has(r.paperBatchId) && (
              <span
                className="inline-flex items-center text-brand-gray-primary font-sans"
                style={{
                  gap: 'min(2px, 0.5cqmin)',
                  fontSize: 'min(11px, 3.8cqmin)',
                }}
              >
                <FileScan aria-hidden style={iconSize} />
                Paper
              </span>
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
            <InputSignalsBadge
              signals={r.inputSignals}
              completedAttempts={r.completedAttempts}
              completed={r.status === 'completed'}
              answers={
                session.sessionMode === 'student' ? r.answers : undefined
              }
              studentName={s.name}
            >
              {(count, deviceOnly) => {
                const SignIcon = deviceOnly ? Monitor : MousePointerClick;
                return (
                  <span
                    className={`inline-flex items-center font-sans font-semibold tabular-nums ${deviceOnly ? 'text-brand-gray-primary' : 'text-amber-700'}`}
                    title={
                      deviceOnly
                        ? `${count} device ${count === 1 ? 'detail' : 'details'}`
                        : `${count} unusual input ${count === 1 ? 'sign' : 'signs'}`
                    }
                    style={{
                      gap: 'min(2px, 0.5cqmin)',
                      fontSize: 'min(11px, 3.8cqmin)',
                    }}
                  >
                    <SignIcon
                      aria-hidden
                      style={{
                        width: 'min(12px, 4cqmin)',
                        height: 'min(12px, 4cqmin)',
                      }}
                    />
                    {count}
                  </span>
                );
              }}
            </InputSignalsBadge>
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
            {onLiveView && bucket === 'inProgress' && (
              <button
                type="button"
                {...tourFieldAttr(
                  'quiz-monitor.live-view',
                  'quiz',
                  `row-${restIndex + 1}`
                )}
                onClick={() => onLiveView(s.key)}
                title="Live view"
                aria-label={`Live view of ${s.name}`}
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
            <RowMenu
              student={s}
              tourRow={restIndex + 1}
              session={session}
              now={now}
              onLetIn={onLetIn}
              onSetTime={onSetTime}
              onOpenPart={onOpenPart}
              onPrintCopy={
                onPrintCopy && printCopyKeys?.has(s.key)
                  ? onPrintCopy
                  : undefined
              }
              onRemove={onRemove}
              onUnlockAttempt={onUnlockAttempt}
              onReopen={onReopen}
              onSubmitForStudent={onSubmitForStudent}
              onReleasePaperRow={onReleasePaperRow}
              onUnlockResults={onUnlockResults}
              overridesBySourcedId={overridesBySourcedId}
              targetRefKeyByStudentUid={targetRefKeyByStudentUid}
            />
          </RosterRow>
        );
      })}

      {absent.map((s) => {
        const items: RosterMenuItem[] = [];
        if (
          onLetIn &&
          s.studentUid &&
          !studentCanEnterAnyGate(
            session,
            s.periodKey ? [s.periodKey] : [],
            s.studentUid,
            now
          )
        ) {
          const uid = s.studentUid;
          items.push({
            label: 'Let in now',
            closes: true,
            tour: tourTypeAttr('quiz-monitor.student-let-in', 'quiz'),
            onClick: () => onLetIn(uid),
          });
        }
        const setTime = studentSetTime(session, s.studentUid);
        if (onSetTime && s.studentUid) {
          const uid = s.studentUid;
          items.push({
            label: 'Schedule for later',
            closes: true,
            tour: tourTypeAttr('quiz-monitor.student-set-time', 'quiz'),
            onClick: () => onSetTime(uid, s.name),
          });
        }
        if (onPrintCopy && printCopyKeys?.has(s.key))
          items.push({
            label: PRINT_COPY_LABEL,
            closes: true,
            tour: tourTypeAttr('quiz-monitor.student-print-copy', 'quiz'),
            onClick: () => onPrintCopy(s.key),
          });
        const canMark = !!onSetAbsent && !!s.rosterId && !!s.studentId;
        const tourRowKey = `row-${rest.length + (absentTourOrder.get(s.key) ?? 0) + 1}`;
        return (
          <RosterRow key={s.key} name={s.name} muted>
            {setTime ? (
              <SetTimeText time={setTime} />
            ) : s.absent && onSetTime && s.studentUid ? (
              <button
                type="button"
                {...tourFieldAttr(
                  'quiz-monitor.student-schedule',
                  'quiz',
                  tourRowKey
                )}
                onClick={() => s.studentUid && onSetTime(s.studentUid, s.name)}
                aria-label={`Schedule ${s.name}`}
                className="touch-target-expand relative inline-flex items-center rounded-md border border-brand-gray-lighter bg-white font-sans font-medium text-brand-blue-primary transition-colors hover:border-brand-blue-light"
                style={{ ...fieldStyle, gap: 'min(3px, 0.8cqmin)' }}
              >
                <CalendarClock
                  aria-hidden
                  className="shrink-0"
                  style={iconSize}
                />
                Schedule
              </button>
            ) : (
              !s.absent && (
                <span
                  className="font-sans text-brand-gray-primary"
                  style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                >
                  {s.onPaper ? 'On paper' : 'Not joined'}
                </span>
              )
            )}
            {canMark ? (
              <ToggleChip
                label="Absent"
                on={s.absent}
                onToggle={() => onSetAbsent?.(s, !s.absent)}
                anchor={tourFieldAttr(
                  'quiz-monitor.student-mark-absent',
                  'quiz',
                  tourRowKey
                )}
              />
            ) : (
              s.absent && (
                <span
                  className="font-sans text-brand-gray-primary"
                  style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                >
                  Absent
                </span>
              )
            )}
            <RosterRowMenu
              ariaLabel={`Actions for ${s.name}`}
              triggerAnchor={tourFieldAttr(
                'quiz-monitor.roster-row-actions',
                'quiz',
                tourRowKey
              )}
              items={items}
            />
          </RosterRow>
        );
      })}
    </div>
  );
};
