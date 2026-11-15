// A student's published Mini App results, at the level the teacher picked.
import React from 'react';
import { Check, Trophy, X } from 'lucide-react';
import type { PublishedMiniAppResult } from '@/types';
import { SubmissionDetails } from '@/components/widgets/MiniApp/components/SubmissionDetails';
import { answerSummary } from '@/utils/miniAppSubmissionText';

const percent = (score: number, max: number): number =>
  max > 0 ? Math.round((score / max) * 100) : 0;

export const MiniAppPublishedResults: React.FC<{
  appTitle: string;
  result: PublishedMiniAppResult;
}> = ({ appTitle, result }) => {
  const { score, maxScore, gradedCount, correctCount, items, details } = result;
  const hasScore = typeof score === 'number' && typeof maxScore === 'number';
  const counted = typeof gradedCount === 'number' && gradedCount > 0;
  const showAnswers = result.visibility === 'score-responses-and-answers';

  return (
    <div
      className="h-screen h-dvh overflow-y-auto bg-linear-to-b from-white to-slate-100"
      data-testid="mini-app-published-results"
    >
      <main className="mx-auto max-w-xl px-4 pt-8 pb-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {appTitle}
        </p>
        <h1 className="text-xl font-bold text-slate-900">Your results</h1>

        {hasScore && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <Trophy className="h-8 w-8 shrink-0 text-amber-500" aria-hidden />
            <div>
              <p className="text-3xl font-bold tabular-nums text-slate-900">
                {counted
                  ? `${percent(score, maxScore)}%`
                  : `${score} / ${maxScore}`}
              </p>
              {counted ? (
                <p className="text-sm text-slate-500">
                  {correctCount ?? 0} of {gradedCount} correct
                </p>
              ) : result.gradedBy === 'app' ? (
                <p className="text-sm text-slate-500">Score from the app</p>
              ) : null}
            </div>
          </div>
        )}

        {items && items.length > 0 && (
          <ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
            {items.map((it, i) => (
              <li key={it.id} className="flex gap-3 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  {it.prompt && (
                    <p className="text-sm font-medium break-words text-slate-900">
                      {it.prompt}
                    </p>
                  )}
                  <p
                    className={`mt-1 flex items-start gap-1 text-sm font-semibold break-words ${
                      it.correct === true
                        ? 'text-emerald-700'
                        : it.correct === false
                          ? 'text-red-600'
                          : 'text-slate-700'
                    }`}
                  >
                    {it.correct === true && (
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-label="Correct"
                      />
                    )}
                    {it.correct === false && (
                      <X
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-label="Incorrect"
                      />
                    )}
                    <span className="min-w-0">{answerSummary(it.answer)}</span>
                  </p>
                  {showAnswers && it.correct === false && it.correctAnswer && (
                    <p className="mt-0.5 text-sm break-words text-slate-600">
                      Correct answer: {it.correctAnswer}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {details && (
          <div
            className="mt-4 border-t border-slate-200 pt-3"
            style={{ containerType: 'inline-size' }}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              What you sent
            </p>
            <SubmissionDetails value={details} />
          </div>
        )}
      </main>
    </div>
  );
};
