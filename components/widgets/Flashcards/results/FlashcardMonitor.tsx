import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Loader2,
  Mic,
  Square,
} from 'lucide-react';
import type {
  FlashcardAssignment,
  FlashcardSession,
  SpeakLanguage,
} from '@/types';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import {
  buildCheckRows,
  checkCardsDone,
  studentCardsOf,
  buildFlagRows,
  buildStudyRows,
  checkCardAccuracy,
  hardestFlashcards,
  type FlashcardCheckRow,
  type FlashcardFlagRow,
  type FlashcardResultRecord,
  type FlashcardStudyRow,
} from '@/utils/flashcardResults';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { BucketBar, BucketSummary } from './FlashcardStudyResults';
import { FlashcardSpeakResults } from './FlashcardSpeakResults';
import { relativeTime } from './resultsFormat';
import { STUCK_THRESHOLD_MS } from '@/components/widgets/QuizWidget/components/monitor/monitorUtils';
import {
  RosterRowMenu,
  RosterToolbar,
} from '@/components/widgets/QuizWidget/components/monitor/RosterParts';
import type { MonitorRosterPrefs } from '@/components/widgets/QuizWidget/components/monitor/rosterStyles';
import { LIBRARY_HEADER_ACCENTS } from '@/components/common/library/libraryAccents';
import { FlashcardCheckRoster } from './FlashcardCheckRoster';
import {
  FLASHCARD_TOOLBAR_ANCHORS,
  cardLabel,
  flashcardMenuItems,
  orderFlashcardRoster,
  type FlashcardRosterStudent,
} from './flashcardRoster';
import {
  FlashcardCardAccuracyList,
  FlashcardCardDetail,
  FlashcardCardList,
} from './FlashcardCardResults';

const STUDY_BUCKET_LABELS: Partial<Record<BucketKey, string>> = {
  done: 'Mastered',
};

interface FlashcardMonitorProps {
  assignment: FlashcardAssignment;
  session: FlashcardSession;
  /** Already narrowed to the picked class. */
  results: FlashcardResultRecord[];
  tests: Record<string, { at: number; count: number; score: number }[]>;
  nameFor: (studentUid: string) => string;
  now: number;
  speakLanguage: SpeakLanguage | null;
  onBack: () => void;
  onResetStudent: (studentUid: string) => void;
  /** Unlock results for a student locked out of them. */
  unlockFor?: (studentUid: string) => (() => void) | undefined;
  /** Unlock attempt for a submitted student who has none left. */
  unlockAttemptFor?: (studentUid: string) => (() => void) | undefined;
  /** Lowers a raised hand. */
  onClearHand?: (studentUid: string) => void;
  onResolveFlag: (
    studentUid: string,
    cardId: string,
    accept: boolean
  ) => Promise<void>;
  letInFor: (studentUid: string) => (() => void) | undefined;
  /** Confirms, then ends the assignment for every class; `onConfirmed` fires once the teacher agrees. */
  onEnd?: (onConfirmed: () => void) => Promise<void>;
  /** Class picker row, or null with a single class. */
  classControls: React.ReactNode;
  launchedBy: React.ReactNode;
  prefs?: MonitorRosterPrefs;
  onUpdatePrefs?: (updates: Partial<MonitorRosterPrefs>) => void;
}

type Screen = 'home' | 'cards' | 'speaking';

const NO_PREFS: MonitorRosterPrefs = {};
// Same header colour as the Flashcards library, so the widget reads as one piece.
const FLASHCARDS_ACCENT = LIBRARY_HEADER_ACCENTS.flashcards ?? '#be185d';
const noop = () => undefined;

const flagAcceptTourId = 'flashcards.flag-accept' as const;
const flagDismissTourId = 'flashcards.flag-dismiss' as const;

const text = {
  name: { fontSize: 'min(13px, 4.5cqmin)' },
  sub: { fontSize: 'min(11px, 3.8cqmin)' },
};
const icon = { width: 'min(14px, 4.5cqmin)', height: 'min(14px, 4.5cqmin)' };
const footerButton =
  'inline-flex items-center whitespace-nowrap font-sans font-semibold rounded-md transition-colors disabled:opacity-60';
const footerButtonStyle = {
  gap: 'min(6px, 1.5cqmin)',
  padding: 'min(8px, 2cqmin) min(14px, 3cqmin)',
  fontSize: 'min(13px, 4.5cqmin)',
};
const rowClass =
  'flex items-center justify-between rounded-lg border border-brand-gray-lightest bg-white';
const rowStyle = {
  padding: 'min(7px, 1.8cqmin) min(10px, 2.5cqmin)',
  gap: 'min(8px, 2cqmin)',
};

const studyBucket = (row: FlashcardStudyRow): BucketKey =>
  !row.started
    ? 'notStarted'
    : row.total > 0 && row.mastered === row.total
      ? 'done'
      : 'inProgress';

const checkBucket = (
  row: FlashcardCheckRow,
  result: FlashcardResultRecord | undefined
): BucketKey =>
  row.submittedAt !== null
    ? 'done'
    : (result?.studyMs ?? 0) > 0
      ? 'inProgress'
      : 'notStarted';

const emptyBuckets = <T,>(): Record<BucketKey, T[]> => ({
  notStarted: [],
  inProgress: [],
  done: [],
});

const PercentPill: React.FC<{ percent: number }> = ({ percent }) => (
  <span
    className="rounded-full bg-brand-blue-lighter font-sans font-semibold tabular-nums text-brand-blue-dark"
    style={{ ...text.sub, padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)' }}
  >
    {Math.round(percent)}%
  </span>
);

const EmptyLine: React.FC<{ message: string }> = ({ message }) => (
  <p
    className="text-center font-sans text-brand-gray-primary"
    style={{ fontSize: 'min(12px, 4cqmin)', padding: 'min(8px, 2cqmin)' }}
  >
    {message}
  </p>
);

export const FlashcardMonitor: React.FC<FlashcardMonitorProps> = ({
  assignment,
  session,
  results,
  tests,
  nameFor,
  now,
  speakLanguage,
  onBack,
  onResetStudent,
  unlockFor,
  unlockAttemptFor,
  onClearHand,
  onResolveFlag,
  letInFor,
  onEnd,
  classControls,
  launchedBy,
  prefs = NO_PREFS,
  onUpdatePrefs = noop,
}) => {
  const [screen, setScreen] = useState<Screen>('home');
  const [cardIndex, setCardIndex] = useState<number | null>(null);
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const isCheck = session.kind === 'check';
  const handOn =
    isCheck && session.rules?.sessionOptions.handRaiseEnabled === true;
  // Speak answers have no typed text, so Speak checks keep the per-card pass rates.
  const quizCards = isCheck && session.checkMode !== 'speak';
  const ended = session.status === 'ended' || assignment.status === 'ended';

  const studyRows = useMemo(
    () =>
      isCheck
        ? []
        : buildStudyRows(session, results).sort(
            (a, b) =>
              b.masteredPercent - a.masteredPercent ||
              nameFor(a.studentUid).localeCompare(nameFor(b.studentUid))
          ),
    [isCheck, nameFor, results, session]
  );
  const checkRows = useMemo(
    () =>
      isCheck
        ? buildCheckRows(session, results).sort(
            (a, b) =>
              b.openFlags - a.openFlags ||
              nameFor(a.studentUid).localeCompare(nameFor(b.studentUid))
          )
        : [],
    [isCheck, nameFor, results, session]
  );
  const flagsByStudent = useMemo(() => {
    const map = new Map<string, FlashcardFlagRow[]>();
    if (!isCheck) return map;
    for (const flag of buildFlagRows(session, results))
      map.set(flag.studentUid, [...(map.get(flag.studentUid) ?? []), flag]);
    return map;
  }, [isCheck, results, session]);

  const studyByBucket = useMemo(() => {
    const out = emptyBuckets<FlashcardStudyRow>();
    for (const row of studyRows) out[studyBucket(row)].push(row);
    return out;
  }, [studyRows]);
  const checkByBucket = useMemo(() => {
    const byUid = new Map(results.map((r) => [r.studentUid, r]));
    const out = emptyBuckets<FlashcardCheckRow>();
    for (const row of checkRows)
      out[checkBucket(row, byUid.get(row.studentUid))].push(row);
    return out;
  }, [checkRows, results]);
  const byBucket = isCheck ? checkByBucket : studyByBucket;
  // As in Quiz: an In progress Check student with no saved answer for 2 minutes.
  const idleCount = useMemo(() => {
    if (!isCheck) return 0;
    const inProgress = new Set(
      checkByBucket.inProgress.map((row) => row.studentUid)
    );
    return results.filter(
      (r) =>
        inProgress.has(r.studentUid) &&
        typeof r.lastActiveAt === 'number' &&
        now - r.lastActiveAt > STUCK_THRESHOLD_MS
    ).length;
  }, [checkByBucket, isCheck, now, results]);
  const counts = {
    notStarted: byBucket.notStarted.length,
    inProgress: byBucket.inProgress.length,
    done: byBucket.done.length,
  };
  const openFlagCount = checkRows.reduce((sum, row) => sum + row.openFlags, 0);

  const hardest = useMemo(
    () => (isCheck ? [] : hardestFlashcards(session, results)),
    [isCheck, results, session]
  );
  const accuracy = useMemo(
    () => (isCheck ? checkCardAccuracy(session, results) : []),
    [isCheck, results, session]
  );

  const resolve = async (
    studentUid: string,
    cardId: string,
    accept: boolean
  ): Promise<void> => {
    const key = `${studentUid}:${cardId}`;
    setBusyFlag(key);
    try {
      await onResolveFlag(studentUid, cardId, accept);
    } finally {
      setBusyFlag(null);
    }
  };

  const handleEnd = async (): Promise<void> => {
    if (!onEnd) return;
    try {
      await onEnd(() => setEnding(true));
    } finally {
      setEnding(false);
    }
  };

  const title =
    screen === 'cards' && cardIndex !== null
      ? `${cardLabel(cardIndex)} results`
      : screen === 'cards'
        ? 'Card results'
        : screen === 'speaking'
          ? 'Speaking'
          : assignment.setTitle || 'Untitled set';

  const renderStudyRow = (row: FlashcardStudyRow, rowIndex: number) => {
    const open = openStudent === row.studentUid;
    const name = nameFor(row.studentUid);
    const studentTests = (tests[row.studentUid] ?? [])
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, 10);
    return (
      <div
        key={row.studentUid}
        className="flex flex-col rounded-lg border border-brand-gray-lightest bg-white"
      >
        <div className="flex items-center" style={rowStyle}>
          <button
            type="button"
            onClick={() => setOpenStudent(open ? null : row.studentUid)}
            aria-expanded={open}
            {...tourFieldAttr(
              'flashcards.student-row',
              'flashcards',
              `row-${rowIndex + 1}`
            )}
            className="flex min-w-0 flex-1 flex-col text-left"
            style={{ gap: 'min(3px, 0.8cqmin)' }}
          >
            <span className="flex w-full items-center justify-between">
              <span
                className="truncate font-sans font-medium text-brand-gray-dark"
                style={text.name}
              >
                {name}
              </span>
              <ChevronDown
                aria-hidden
                className={`shrink-0 text-brand-gray-light transition-transform ${open ? 'rotate-180' : ''}`}
                style={icon}
              />
            </span>
            <BucketBar buckets={row.buckets} />
            <span
              className="wrap-break-word font-sans text-brand-gray-primary"
              style={text.sub}
            >
              {row.mastered}/{row.total} mastered · {row.studyMinutes} min ·{' '}
              {relativeTime(row.lastActiveAt, now)}
            </span>
          </button>
          <div
            className="flex shrink-0 items-center"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            <PercentPill percent={row.masteredPercent} />
            <RosterRowMenu
              ariaLabel={`Actions for ${name}`}
              triggerAnchor={tourFieldAttr(
                'flashcards.student-actions',
                'flashcards',
                `row-${rowIndex + 1}`
              )}
              items={flashcardMenuItems(letInFor(row.studentUid), () =>
                onResetStudent(row.studentUid)
              )}
            />
          </div>
        </div>
        {open && (
          <div
            className="flex flex-col border-t border-brand-gray-lightest font-sans text-brand-gray-dark"
            style={{
              gap: 'min(6px, 1.5cqmin)',
              padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
              ...text.sub,
            }}
          >
            <p className="text-brand-gray-primary">
              <BucketSummary buckets={row.buckets} />
            </p>
            <p className="text-brand-gray-primary">
              {row.modesUsed.length > 0
                ? `Modes used: ${row.modesUsed.join(', ')}`
                : 'No mode recorded yet.'}
            </p>
            <p className="font-semibold">Practice tests</p>
            {studentTests.length === 0 ? (
              <p className="text-brand-gray-primary">
                No practice test taken yet.
              </p>
            ) : (
              <ul>
                {studentTests.map((test, index) => (
                  <li
                    key={`${test.at}-${index}`}
                    className="flex justify-between text-brand-gray-primary"
                  >
                    <span>{new Date(test.at).toLocaleString()}</span>
                    <span className="font-semibold tabular-nums">
                      {test.score}/{test.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFlag = (flag: FlashcardFlagRow, flagIndex: number) => {
    const key = `${flag.studentUid}:${flag.cardId}`;
    return (
      <div
        key={key}
        className="flex items-center justify-between border-t border-brand-gray-lightest"
        style={rowStyle}
      >
        <div className="min-w-0">
          <p
            className="wrap-break-word font-sans font-medium text-brand-gray-dark"
            style={text.sub}
          >
            {flag.card?.term ?? flag.cardId}
          </p>
          <p
            className="wrap-break-word font-sans text-brand-gray-primary"
            style={text.sub}
          >
            Wrote “{flag.response}” · expected “{flag.expected}”
          </p>
        </div>
        {busyFlag === key ? (
          <Loader2
            className="shrink-0 animate-spin text-brand-gray-light"
            aria-label="Saving"
            style={icon}
          />
        ) : (
          <div
            className="flex shrink-0 items-center"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {(
              [
                ['Accept', true, flagAcceptTourId],
                ['Dismiss', false, flagDismissTourId],
              ] as const
            ).map(([label, accept, anchorId]) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  void resolve(flag.studentUid, flag.cardId, accept)
                }
                disabled={flag.accepted === accept}
                {...tourFieldAttr(
                  anchorId,
                  'flashcards',
                  `row-${flagIndex + 1}`
                )}
                className={`touch-target-expand relative rounded-md border font-sans font-medium transition-colors disabled:opacity-40 ${
                  accept
                    ? 'border-brand-blue-primary text-brand-blue-primary hover:bg-brand-blue-primary hover:text-white'
                    : 'border-brand-gray-lighter text-brand-gray-dark hover:border-brand-blue-light'
                }`}
                style={{
                  ...text.sub,
                  padding: 'min(3px, 0.8cqmin) min(10px, 2.5cqmin)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const openList = openBucket ? byBucket[openBucket] : [];

  const checkRoster = useMemo(() => {
    const byUid = new Map(results.map((r) => [r.studentUid, r]));
    const out = emptyBuckets<FlashcardRosterStudent>();
    for (const key of ['notStarted', 'inProgress', 'done'] as const)
      for (const row of checkByBucket[key]) {
        const result = byUid.get(row.studentUid);
        out[key].push({
          studentUid: row.studentUid,
          bucket: key,
          score: row.percent,
          cardsDone: result ? checkCardsDone(result) : 0,
          cardTotal: studentCardsOf(session, result).length,
          openFlags: row.openFlags,
          hand: handOn && key === 'inProgress' && result?.handRaisedAt != null,
        });
      }
    return out;
  }, [checkByBucket, handOn, results, session]);

  const openStudyRows =
    !isCheck && openBucket
      ? orderFlashcardRoster(
          studyByBucket[openBucket].map((row) => ({
            ...row,
            bucket: openBucket,
            score: row.masteredPercent,
            cardsDone: row.mastered,
          })),
          nameFor,
          prefs,
          openBucket !== 'notStarted'
        )
      : [];

  const flagCountFor = (studentUid: string): number =>
    flagsByStudent.get(studentUid)?.length ?? 0;
  const renderFlagsFor = (
    studentUid: string,
    firstIndex: number
  ): React.ReactNode => {
    const flags = flagsByStudent.get(studentUid) ?? [];
    if (flags.length === 0) return null;
    return flags.map((flag, i) => renderFlag(flag, firstIndex + i));
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-white text-brand-gray-dark">
      <div
        className="flex shrink-0 items-center text-white"
        style={{
          backgroundColor: FLASHCARDS_ACCENT,
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          type="button"
          onClick={() =>
            screen === 'home'
              ? onBack()
              : screen === 'cards' && cardIndex !== null
                ? setCardIndex(null)
                : setScreen('home')
          }
          aria-label="Back"
          {...tourTypeAttr('flashcards.results-back', 'flashcards')}
          className="touch-target-expand relative rounded-md transition-colors hover:bg-white/15"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <ArrowLeft
            style={{ width: 'min(16px, 5cqmin)', height: 'min(16px, 5cqmin)' }}
          />
        </button>
        <p
          className="flex-1 truncate font-sans font-semibold"
          style={{ fontSize: 'min(14px, 5cqmin)' }}
        >
          {title}
        </p>
        <span
          className={`shrink-0 rounded-full font-sans font-semibold uppercase tracking-wider ${
            ended ? 'bg-white/20 text-white' : 'bg-white'
          }`}
          style={{
            color: ended ? undefined : FLASHCARDS_ACCENT,
            fontSize: 'min(10px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(8px, 2cqmin)',
          }}
        >
          {ended ? 'Ended' : 'Live'}
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: 'min(12px, 3cqmin)' }}
      >
        {screen === 'home' && (
          <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
            {launchedBy}
            {classControls}
            <StatusBuckets
              counts={counts}
              handCount={checkRoster.inProgress.filter((s) => s.hand).length}
              idleCount={idleCount}
              openBucket={openBucket}
              onToggle={(key) =>
                setOpenBucket((cur) => (cur === key ? null : key))
              }
              labels={isCheck ? undefined : STUDY_BUCKET_LABELS}
              notes={
                isCheck && openFlagCount > 0
                  ? {
                      done: (
                        <span
                          className="font-sans font-semibold tabular-nums text-amber-700"
                          style={{
                            fontSize: 'min(10px, 3.5cqmin)',
                            marginTop: 'min(2px, 0.5cqmin)',
                          }}
                        >
                          {openFlagCount} flagged
                        </span>
                      ),
                    }
                  : undefined
              }
              anchor={(key) =>
                tourFieldAttr('flashcards.status-bucket', 'flashcards', key)
              }
            />
            {openBucket && isCheck && (
              <FlashcardCheckRoster
                bucket={openBucket}
                students={checkRoster[openBucket]}
                session={session}
                nameFor={nameFor}
                prefs={prefs}
                onUpdatePrefs={onUpdatePrefs}
                letInFor={letInFor}
                onRemove={onResetStudent}
                unlockFor={unlockFor}
                unlockAttemptFor={unlockAttemptFor}
                onClearHand={onClearHand}
                belowCount={flagCountFor}
                renderBelow={renderFlagsFor}
              />
            )}
            {openBucket && !isCheck && (
              <div
                className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {openBucket !== 'notStarted' && (
                  <RosterToolbar
                    bucket={openBucket}
                    prefs={prefs}
                    onUpdate={onUpdatePrefs}
                    tabWarningsAllowed={false}
                    tabsFilter={false}
                    scoreSwitches={false}
                    anchors={FLASHCARD_TOOLBAR_ANCHORS}
                  />
                )}
                {openStudyRows.length === 0 ? (
                  <EmptyLine
                    message={
                      openList.length === 0
                        ? 'No students here yet.'
                        : 'No students match this filter.'
                    }
                  />
                ) : (
                  openStudyRows.map(renderStudyRow)
                )}
              </div>
            )}
          </div>
        )}

        {screen === 'cards' && quizCards && cardIndex === null && (
          <FlashcardCardList
            session={session}
            results={results}
            ended={ended}
            onOpen={setCardIndex}
          />
        )}
        {screen === 'cards' && quizCards && cardIndex !== null && (
          <FlashcardCardDetail
            session={session}
            results={results}
            index={cardIndex}
            ended={ended}
          />
        )}

        {screen === 'cards' && !quizCards && (
          <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
            {isCheck ? (
              <FlashcardCardAccuracyList accuracy={accuracy} />
            ) : hardest.length === 0 ? (
              <EmptyLine message="No misses recorded yet." />
            ) : (
              hardest.map((hard) => (
                <div key={hard.card.id} className={rowClass} style={rowStyle}>
                  <div className="min-w-0">
                    <p
                      className="truncate font-sans font-medium text-brand-gray-dark"
                      style={text.name}
                    >
                      {hard.card.term}
                    </p>
                    <p
                      className="wrap-break-word font-sans text-brand-gray-primary"
                      style={text.sub}
                    >
                      {hard.card.definition} · {hard.strugglingStudents} still
                      working on it
                    </p>
                  </div>
                  <span
                    className="shrink-0 font-sans font-semibold tabular-nums text-brand-red-primary"
                    style={text.sub}
                  >
                    {hard.wrong} miss{hard.wrong === 1 ? '' : 'es'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {screen === 'speaking' && speakLanguage && (
          <FlashcardSpeakResults
            session={session}
            results={results}
            language={speakLanguage}
            nameFor={nameFor}
          />
        )}
      </div>

      {screen === 'home' && (
        <div
          className="flex shrink-0 flex-wrap items-center border-t border-brand-gray-lightest"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
          }}
        >
          {onEnd && !ended && (
            <button
              type="button"
              onClick={() => void handleEnd()}
              disabled={ending}
              {...tourTypeAttr('flashcards.close-all', 'flashcards')}
              className={`${footerButton} border border-brand-gray-lighter bg-white text-brand-red-primary hover:border-brand-red-light`}
              style={footerButtonStyle}
            >
              {ending ? (
                <Loader2 className="animate-spin" style={icon} />
              ) : (
                <Square aria-hidden style={icon} />
              )}
              Close all
            </button>
          )}
          <div
            className="ml-auto flex flex-wrap items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {speakLanguage && (
              <button
                type="button"
                onClick={() => setScreen('speaking')}
                {...tourFieldAttr(
                  'flashcards.results-view',
                  'flashcards',
                  'speaking'
                )}
                className={`${footerButton} border border-brand-gray-lighter bg-white text-brand-gray-dark hover:border-brand-blue-light`}
                style={footerButtonStyle}
              >
                <Mic
                  className="text-brand-blue-primary"
                  aria-hidden
                  style={icon}
                />
                Speaking
              </button>
            )}
            <button
              type="button"
              onClick={() => setScreen('cards')}
              {...tourTypeAttr('flashcards.card-results', 'flashcards')}
              className={`${footerButton} border border-brand-gray-lighter bg-white text-brand-gray-dark hover:border-brand-blue-light`}
              style={footerButtonStyle}
            >
              <BarChart3
                className="text-brand-blue-primary"
                aria-hidden
                style={icon}
              />
              Card results
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
