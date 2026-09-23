import React, { useMemo, useState } from 'react';
import { CheckCircle2, Flag, Loader2, Users } from 'lucide-react';
import type { FlashcardSession } from '@/types';
import { StatTile } from '@/components/common/sessionViews/StatTile';
import { SessionRow } from '@/components/common/sessionViews/SessionRow';
import { ScorePill } from '@/components/common/sessionViews/ScorePill';
import { OverflowMenu } from '@/components/common/sessionViews/OverflowMenu';
import {
  buildCheckRows,
  buildFlagRows,
  checkCardAccuracy,
  type FlashcardResultRecord,
} from '@/utils/flashcardResults';
import { ResultsSection, SectionEmpty } from './resultsShared';

interface FlashcardCheckReviewProps {
  session: FlashcardSession;
  results: FlashcardResultRecord[];
  nameFor: (studentUid: string) => string;
  onResetStudent: (studentUid: string) => void;
  /** Let in now for a student waiting in a shut period; undefined when it doesn't apply. */
  letInFor?: (studentUid: string) => (() => void) | undefined;
  onResolveFlag: (
    studentUid: string,
    cardId: string,
    accept: boolean
  ) => Promise<void>;
}

export const FlashcardCheckReview: React.FC<FlashcardCheckReviewProps> = ({
  session,
  results,
  nameFor,
  onResetStudent,
  onResolveFlag,
  letInFor,
}) => {
  const [busyFlag, setBusyFlag] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      buildCheckRows(session, results).sort(
        (a, b) =>
          Number(b.submittedAt !== null) - Number(a.submittedAt !== null) ||
          nameFor(a.studentUid).localeCompare(nameFor(b.studentUid))
      ),
    [nameFor, results, session]
  );
  const accuracy = useMemo(
    () => checkCardAccuracy(session, results),
    [results, session]
  );
  const flags = useMemo(
    () => buildFlagRows(session, results),
    [results, session]
  );
  const openFlags = flags.filter((flag) => flag.accepted === undefined);
  const submitted = rows.filter((row) => row.submittedAt !== null);
  const averagePercent =
    submitted.length === 0
      ? 0
      : submitted.reduce((sum, row) => sum + (row.percent ?? 0), 0) /
        submitted.length;

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

  return (
    <div
      className="flex flex-col"
      style={{ gap: 'min(16px, 3.5cqmin)', padding: 'min(16px, 3.5cqmin)' }}
    >
      <div className="grid grid-cols-3" style={{ gap: 'min(10px, 2.2cqmin)' }}>
        <StatTile
          icon={<CheckCircle2 aria-hidden="true" />}
          tone="green"
          value={`${Math.round(averagePercent)}%`}
          label="Class average"
        />
        <StatTile
          icon={<Users aria-hidden="true" />}
          value={`${submitted.length}/${rows.length}`}
          label="Submitted"
        />
        <StatTile
          icon={<Flag aria-hidden="true" />}
          tone="amber"
          value={openFlags.length}
          label="Flags to review"
        />
      </div>

      <ResultsSection title="Scores" count={rows.length}>
        {rows.length === 0 ? (
          <SectionEmpty message="No student has opened this Check yet." />
        ) : (
          rows.map((row) => (
            <SessionRow
              key={row.studentUid}
              dot={{
                tone: row.submittedAt !== null ? 'success' : 'neutral',
              }}
              trailing={
                <div
                  className="flex items-center"
                  style={{ gap: 'min(6px, 1.4cqmin)' }}
                >
                  {row.submittedAt === null ? (
                    <span
                      className="font-bold text-slate-400"
                      style={{ fontSize: 'min(12px, 3.4cqmin)' }}
                    >
                      Not submitted
                    </span>
                  ) : (
                    <ScorePill score={row.percent ?? 0} display="percent" />
                  )}
                  <OverflowMenu
                    ariaLabel={`Actions for ${nameFor(row.studentUid)}`}
                    items={[
                      ...(letInFor?.(row.studentUid)
                        ? [
                            {
                              id: 'let-in',
                              label: 'Let in now',
                              onClick: () => letInFor(row.studentUid)?.(),
                            },
                          ]
                        : []),
                      {
                        id: 'reset',
                        label: 'Reset this student',
                        destructive: true,
                        onClick: () => onResetStudent(row.studentUid),
                      },
                    ]}
                  />
                </div>
              }
            >
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-bold text-slate-800"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {nameFor(row.studentUid)}
                </div>
                <div
                  className="truncate text-slate-500"
                  style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                >
                  {row.submittedAt === null
                    ? 'In progress'
                    : `${row.score}/${row.total} · submitted ${new Date(row.submittedAt).toLocaleString()}`}
                  {row.openFlags > 0 && ` · ${row.openFlags} flagged`}
                </div>
              </div>
            </SessionRow>
          ))
        )}
      </ResultsSection>

      <ResultsSection title="Flagged answers" count={openFlags.length}>
        {flags.length === 0 ? (
          <SectionEmpty message="No student has flagged an answer." />
        ) : (
          flags.map((flag) => {
            const key = `${flag.studentUid}:${flag.cardId}`;
            return (
              <SessionRow
                key={key}
                trailing={
                  busyFlag === key ? (
                    <Loader2
                      className="animate-spin text-slate-400"
                      aria-label="Saving"
                      style={{
                        width: 'min(16px, 4cqmin)',
                        height: 'min(16px, 4cqmin)',
                      }}
                    />
                  ) : (
                    <div
                      className="flex items-center"
                      style={{ gap: 'min(6px, 1.4cqmin)' }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void resolve(flag.studentUid, flag.cardId, true)
                        }
                        disabled={flag.accepted === true}
                        className="rounded-xl border border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                        style={{
                          fontSize: 'min(11px, 3.2cqmin)',
                          padding: 'min(4px, 1cqmin) min(10px, 2.2cqmin)',
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void resolve(flag.studentUid, flag.cardId, false)
                        }
                        disabled={flag.accepted === false}
                        className="rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        style={{
                          fontSize: 'min(11px, 3.2cqmin)',
                          padding: 'min(4px, 1cqmin) min(10px, 2.2cqmin)',
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )
                }
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-bold text-slate-800"
                    style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                  >
                    {nameFor(flag.studentUid)} ·{' '}
                    {flag.card?.term ?? flag.cardId}
                  </div>
                  <div
                    className="truncate text-slate-500"
                    style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                  >
                    Wrote “{flag.response}” · expected “{flag.expected}”
                  </div>
                </div>
              </SessionRow>
            );
          })
        )}
      </ResultsSection>

      <ResultsSection title="First-try accuracy" count={accuracy.length}>
        {accuracy.length === 0 ? (
          <SectionEmpty message="Accuracy appears once students submit." />
        ) : (
          accuracy.map((entry) => (
            <SessionRow
              key={entry.card.id}
              trailing={<ScorePill score={entry.percent} display="percent" />}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="truncate font-bold text-slate-800"
                  style={{ fontSize: 'min(13px, 3.8cqmin)' }}
                >
                  {entry.card.term}
                </div>
                <div
                  className="truncate text-slate-500"
                  style={{ fontSize: 'min(11px, 3.2cqmin)' }}
                >
                  {entry.correct} of {entry.answered} correct ·{' '}
                  {entry.card.definition}
                </div>
              </div>
            </SessionRow>
          ))
        )}
      </ResultsSection>
    </div>
  );
};
