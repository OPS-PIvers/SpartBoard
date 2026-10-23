import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  EyeOff,
  Loader2,
  Mic,
  Send,
  Square,
} from 'lucide-react';
import type {
  FlashcardAssignment,
  FlashcardSession,
  SpeakLanguage,
} from '@/types';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';
import {
  StatusBuckets,
  type BucketKey,
} from '@/components/widgets/QuizWidget/components/monitor/StatusBuckets';
import {
  buildCheckRows,
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

const STUDY_BUCKET_LABELS: Partial<Record<BucketKey, string>> = {
  done: 'Mastered',
};
const CHECK_BUCKET_LABELS: Partial<Record<BucketKey, string>> = {
  done: 'Submitted',
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
  published: boolean;
  onBack: () => void;
  onResetStudent: (studentUid: string) => void;
  onResolveFlag: (
    studentUid: string,
    cardId: string,
    accept: boolean
  ) => Promise<void>;
  letInFor: (studentUid: string) => (() => void) | undefined;
  onPublish: () => void;
  /** Ends the assignment for every class; omitted when it can't be ended here. */
  onEnd?: () => Promise<void>;
  /** Class picker row, or null with a single class. */
  classControls: React.ReactNode;
  launchedBy: React.ReactNode;
}

type Screen = 'home' | 'cards' | 'speaking';

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

const RowMenu: React.FC<{
  name: string;
  anchor: Record<string, string>;
  letIn?: () => void;
  onReset: () => void;
}> = ({ name, anchor, letIn, onReset }) => (
  <OverflowMenu
    ariaLabel={`Actions for ${name}`}
    tourId="flashcards.student-menu-item"
    tourScope="flashcards"
    triggerProps={anchor}
    triggerClassName="rounded-md text-brand-gray-primary hover:bg-brand-gray-lightest hover:text-brand-blue-dark"
    items={[
      ...(letIn ? [{ id: 'let-in', label: 'Let in now', onClick: letIn }] : []),
      {
        id: 'reset',
        label: 'Reset this student',
        destructive: true,
        onClick: onReset,
      },
    ]}
  />
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
  published,
  onBack,
  onResetStudent,
  onResolveFlag,
  letInFor,
  onPublish,
  onEnd,
  classControls,
  launchedBy,
}) => {
  const [screen, setScreen] = useState<Screen>('home');
  const [openBucket, setOpenBucket] = useState<BucketKey | null>(null);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [busyFlag, setBusyFlag] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const isCheck = session.kind === 'check';
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
    setEnding(true);
    try {
      await onEnd();
    } finally {
      setEnding(false);
    }
  };

  const title =
    screen === 'cards'
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
              className="break-words font-sans text-brand-gray-primary"
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
            <RowMenu
              name={name}
              anchor={tourFieldAttr(
                'flashcards.student-actions',
                'flashcards',
                `row-${rowIndex + 1}`
              )}
              letIn={letInFor(row.studentUid)}
              onReset={() => onResetStudent(row.studentUid)}
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
                {studentTests.map((test) => (
                  <li
                    key={`${test.at}`}
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
            className="break-words font-sans font-medium text-brand-gray-dark"
            style={text.sub}
          >
            {flag.card?.term ?? flag.cardId}
          </p>
          <p
            className="break-words font-sans text-brand-gray-primary"
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
                ['Accept', true, 'flashcards.flag-accept'],
                ['Dismiss', false, 'flashcards.flag-dismiss'],
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
                className={`rounded-md border font-sans font-medium transition-colors disabled:opacity-40 ${
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

  let flagIndex = 0;
  const renderCheckRow = (row: FlashcardCheckRow, rowIndex: number) => {
    const name = nameFor(row.studentUid);
    const flags = flagsByStudent.get(row.studentUid) ?? [];
    return (
      <div
        key={row.studentUid}
        className="flex flex-col rounded-lg border border-brand-gray-lightest bg-white"
      >
        <div
          className="flex items-center justify-between"
          style={rowStyle}
          {...tourFieldAttr(
            'flashcards.score-row',
            'flashcards',
            `row-${rowIndex + 1}`
          )}
        >
          <div className="min-w-0">
            <p
              className="truncate font-sans font-medium text-brand-gray-dark"
              style={text.name}
            >
              {name}
            </p>
            {row.submittedAt !== null && (
              <p
                className="break-words font-sans text-brand-gray-primary"
                style={text.sub}
              >
                {row.score}/{row.total} · submitted{' '}
                {new Date(row.submittedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div
            className="flex shrink-0 items-center"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {row.submittedAt !== null && (
              <PercentPill percent={row.percent ?? 0} />
            )}
            <RowMenu
              name={name}
              anchor={tourFieldAttr(
                'flashcards.student-actions',
                'flashcards',
                `row-${rowIndex + 1}`
              )}
              letIn={letInFor(row.studentUid)}
              onReset={() => onResetStudent(row.studentUid)}
            />
          </div>
        </div>
        {flags.map((flag) => renderFlag(flag, flagIndex++))}
      </div>
    );
  };

  const openList = openBucket ? byBucket[openBucket] : [];

  return (
    <div className="relative flex h-full w-full flex-col bg-white text-brand-gray-dark">
      <div
        className="flex shrink-0 items-center bg-brand-blue-primary text-white"
        style={{
          gap: 'min(8px, 2cqmin)',
          padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        }}
      >
        <button
          type="button"
          onClick={() => (screen === 'home' ? onBack() : setScreen('home'))}
          aria-label="Back"
          {...tourTypeAttr('flashcards.results-back', 'flashcards')}
          className="rounded-md transition-colors hover:bg-white/15"
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
            ended
              ? 'bg-white/20 text-white'
              : 'bg-white text-brand-blue-primary'
          }`}
          style={{
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
              handCount={0}
              idleCount={0}
              openBucket={openBucket}
              onToggle={(key) =>
                setOpenBucket((cur) => (cur === key ? null : key))
              }
              labels={isCheck ? CHECK_BUCKET_LABELS : STUDY_BUCKET_LABELS}
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
              anchorFor={(key) =>
                tourFieldAttr('flashcards.status-bucket', 'flashcards', key)
              }
            />
            {openBucket && (
              <div
                className="flex flex-col animate-in fade-in slide-in-from-top-1 duration-200"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {openList.length === 0 ? (
                  <EmptyLine message="No students here yet." />
                ) : isCheck ? (
                  (openList as FlashcardCheckRow[]).map(renderCheckRow)
                ) : (
                  (openList as FlashcardStudyRow[]).map(renderStudyRow)
                )}
              </div>
            )}
          </div>
        )}

        {screen === 'cards' && (
          <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
            {isCheck ? (
              accuracy.length === 0 ? (
                <EmptyLine message="Accuracy appears once students submit." />
              ) : (
                accuracy.map((entry) => (
                  <div
                    key={entry.card.id}
                    className={rowClass}
                    style={rowStyle}
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate font-sans font-medium text-brand-gray-dark"
                        style={text.name}
                      >
                        {entry.card.term}
                      </p>
                      <p
                        className="break-words font-sans text-brand-gray-primary"
                        style={text.sub}
                      >
                        {entry.correct} of {entry.answered} correct ·{' '}
                        {entry.card.definition}
                      </p>
                    </div>
                    <PercentPill percent={entry.percent} />
                  </div>
                ))
              )
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
                      className="break-words font-sans text-brand-gray-primary"
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
          {isCheck && (
            <button
              type="button"
              onClick={onPublish}
              {...tourTypeAttr('flashcards.publish-scores', 'flashcards')}
              className={`${footerButton} bg-brand-blue-primary text-white hover:bg-brand-blue-light`}
              style={footerButtonStyle}
            >
              {published ? (
                <EyeOff aria-hidden style={icon} />
              ) : (
                <Send aria-hidden style={icon} />
              )}
              {published ? 'Hide scores' : 'Publish scores'}
            </button>
          )}
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
