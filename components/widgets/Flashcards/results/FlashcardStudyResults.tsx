import React, { useMemo, useState } from 'react';
import { Clock, GraduationCap, Sparkles, UserX } from 'lucide-react';
import type { FlashcardSession } from '@/types';
import { StatTile } from '@/components/common/sessionViews/StatTile';
import { SessionRow } from '@/components/common/sessionViews/SessionRow';
import { ScorePill } from '@/components/common/sessionViews/ScorePill';
import {
  aggregateStudyRows,
  buildStudyRows,
  hardestFlashcards,
  type FlashcardResultRecord,
  type FlashcardStudyRow,
} from '@/utils/flashcardResults';
import { ResultsSection, SectionEmpty } from './resultsShared';
import { relativeTime } from './resultsFormat';

interface FlashcardStudyResultsProps {
  session: FlashcardSession;
  results: FlashcardResultRecord[];
  tests: Record<string, { at: number; count: number; score: number }[]>;
  nameFor: (studentUid: string) => string;
  onResetStudent: (studentUid: string) => void;
  /** Let in now for a student waiting in a shut period; undefined when it doesn't apply. */
  letInFor?: (studentUid: string) => (() => void) | undefined;
  /** Clock tick owned by the parent so render stays pure. */
  now: number;
}

const BUCKET_BARS: {
  key: keyof FlashcardStudyRow['buckets'];
  label: string;
  className: string;
}[] = [
  { key: 'mastered', label: 'Mastered', className: 'bg-emerald-500' },
  { key: 'familiar', label: 'Familiar', className: 'bg-sky-500' },
  { key: 'learning', label: 'Learning', className: 'bg-amber-500' },
  { key: 'new', label: 'New', className: 'bg-slate-300' },
];

const BucketBar: React.FC<{ buckets: FlashcardStudyRow['buckets'] }> = ({
  buckets,
}) => {
  const total =
    buckets.new + buckets.learning + buckets.familiar + buckets.mastered;
  if (total === 0) return null;
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-slate-100"
      style={{ height: 'min(8px, 2cqmin)' }}
      role="img"
      aria-label={BUCKET_BARS.map((b) => `${b.label} ${buckets[b.key]}`).join(
        ', '
      )}
    >
      {BUCKET_BARS.map((bar) =>
        buckets[bar.key] === 0 ? null : (
          <span
            key={bar.key}
            className={bar.className}
            style={{ width: `${(buckets[bar.key] / total) * 100}%` }}
          />
        )
      )}
    </div>
  );
};

export const FlashcardStudyResults: React.FC<FlashcardStudyResultsProps> = ({
  session,
  results,
  tests,
  nameFor,
  onResetStudent,
  now,
  letInFor,
}) => {
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const rows = useMemo(
    () => buildStudyRows(session, results),
    [results, session]
  );
  const sortedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.masteredPercent - a.masteredPercent ||
          nameFor(a.studentUid).localeCompare(nameFor(b.studentUid))
      ),
    [nameFor, rows]
  );
  const aggregate = useMemo(() => aggregateStudyRows(rows), [rows]);
  const hardest = useMemo(
    () => hardestFlashcards(session, results),
    [results, session]
  );
  const openRow = sortedRows.find((row) => row.studentUid === openStudent);
  const letInOpen = openRow ? letInFor?.(openRow.studentUid) : undefined;

  return (
    <div
      className="flex flex-col"
      style={{ gap: 'min(16px, 3.5cqmin)', padding: 'min(16px, 3.5cqmin)' }}
    >
      <div
        className="grid grid-cols-2 sm:grid-cols-4"
        style={{ gap: 'min(10px, 2.2cqmin)' }}
      >
        <StatTile
          icon={<GraduationCap aria-hidden="true" />}
          tone="green"
          value={`${Math.round(aggregate.averageMasteredPercent)}%`}
          label="Average mastered"
        />
        <StatTile
          icon={<Sparkles aria-hidden="true" />}
          value={aggregate.started}
          label="Started"
        />
        <StatTile
          icon={<UserX aria-hidden="true" />}
          tone="amber"
          value={aggregate.notStarted}
          label="Not started"
        />
        <StatTile
          icon={<Clock aria-hidden="true" />}
          tone="violet"
          value={session.cards.length}
          label="Cards in set"
        />
      </div>

      <ResultsSection title="Students" count={sortedRows.length}>
        {sortedRows.length === 0 ? (
          <SectionEmpty message="No student has opened this assignment yet." />
        ) : (
          sortedRows.map((row) => (
            <SessionRow
              key={row.studentUid}
              dot={{ tone: row.started ? 'success' : 'neutral' }}
              onClick={() =>
                setOpenStudent(
                  openStudent === row.studentUid ? null : row.studentUid
                )
              }
              trailing={
                <ScorePill score={row.masteredPercent} display="percent" />
              }
            >
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-bold text-slate-800"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {nameFor(row.studentUid)}
                </div>
                <div className="mt-1">
                  <BucketBar buckets={row.buckets} />
                </div>
                <div
                  className="mt-1 text-slate-500"
                  style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                >
                  {row.mastered}/{row.total} mastered · {row.studyMinutes} min ·{' '}
                  {relativeTime(row.lastActiveAt, now)}
                </div>
              </div>
            </SessionRow>
          ))
        )}
      </ResultsSection>

      {openRow && (
        <ResultsSection title={`${nameFor(openRow.studentUid)}'s progress`}>
          <div
            className="flex flex-col"
            style={{
              gap: 'min(8px, 2cqmin)',
              padding: 'min(12px, 2.6cqmin)',
            }}
          >
            <div className="flex flex-wrap" style={{ gap: 'min(8px, 2cqmin)' }}>
              {BUCKET_BARS.map((bar) => (
                <span
                  key={bar.key}
                  className="rounded-full bg-slate-100 font-bold text-slate-700"
                  style={{
                    fontSize: 'min(11px, 3.2cqmin)',
                    padding: 'min(4px, 1cqmin) min(10px, 2.2cqmin)',
                  }}
                >
                  {bar.label} {openRow.buckets[bar.key]}
                </span>
              ))}
            </div>
            <div
              className="text-slate-600"
              style={{ fontSize: 'min(12px, 3.4cqmin)' }}
            >
              {openRow.modesUsed.length > 0
                ? `Modes used: ${openRow.modesUsed.join(', ')}`
                : 'No mode recorded yet.'}
            </div>
            <div>
              <div
                className="font-black uppercase tracking-widest text-slate-500"
                style={{ fontSize: 'min(10px, 3cqmin)' }}
              >
                Practice tests
              </div>
              {(tests[openRow.studentUid] ?? []).length === 0 ? (
                <p
                  className="text-slate-500"
                  style={{ fontSize: 'min(12px, 3.4cqmin)' }}
                >
                  No practice test taken yet.
                </p>
              ) : (
                <ul className="mt-1">
                  {(tests[openRow.studentUid] ?? [])
                    .slice()
                    .sort((a, b) => b.at - a.at)
                    .slice(0, 10)
                    .map((test) => (
                      <li
                        key={`${test.at}`}
                        className="flex justify-between text-slate-600"
                        style={{ fontSize: 'min(12px, 3.4cqmin)' }}
                      >
                        <span>{new Date(test.at).toLocaleString()}</span>
                        <span className="font-bold tabular-nums">
                          {test.score}/{test.count}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {letInOpen && (
              <button
                type="button"
                onClick={letInOpen}
                className="self-start rounded-xl border border-brand-blue-primary/30 font-bold text-brand-blue-primary hover:bg-brand-blue-lighter/40"
                style={{
                  fontSize: 'min(12px, 3.4cqmin)',
                  padding: 'min(6px, 1.4cqmin) min(12px, 2.6cqmin)',
                }}
              >
                Let in now
              </button>
            )}
            <button
              type="button"
              onClick={() => onResetStudent(openRow.studentUid)}
              className="self-start rounded-xl border border-red-200 font-bold text-red-600 hover:bg-red-50"
              style={{
                fontSize: 'min(12px, 3.4cqmin)',
                padding: 'min(6px, 1.4cqmin) min(12px, 2.6cqmin)',
              }}
            >
              Reset this student
            </button>
          </div>
        </ResultsSection>
      )}

      <ResultsSection title="Hardest cards" count={hardest.length}>
        {hardest.length === 0 ? (
          <SectionEmpty message="No misses recorded yet." />
        ) : (
          hardest.map((hard) => (
            <SessionRow
              key={hard.card.id}
              trailing={
                <span
                  className="font-black tabular-nums text-rose-600"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {hard.wrong} miss{hard.wrong === 1 ? '' : 'es'}
                </span>
              }
            >
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-bold text-slate-800"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {hard.card.term}
                </div>
                <div
                  className="truncate text-slate-500"
                  style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                >
                  {hard.card.definition} · {hard.strugglingStudents} still
                  working on it
                </div>
              </div>
            </SessionRow>
          ))
        )}
      </ResultsSection>
    </div>
  );
};
