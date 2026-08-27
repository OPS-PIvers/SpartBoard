import React from 'react';
import { Check } from 'lucide-react';
import { QuizLeaderboardEntry, QuizQuestion, QuizResponse } from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { buildDistribution } from '../monitor/monitorUtils';
import { PresentStandings } from './PresentStandings';

interface PresentPacedReviewProps {
  question: QuizQuestion;
  responses: QuizResponse[];
  /** True only when `showCorrectOnBoard` is on AND the teacher revealed. */
  revealed: boolean;
  standings: QuizLeaderboardEntry[];
  showNames: boolean;
  unit: 'pts' | '%';
}

export const PresentPacedReview: React.FC<PresentPacedReviewProps> = ({
  question,
  responses,
  revealed,
  standings,
  showNames,
  unit,
}) => {
  const { totalAnswered, rows } = buildDistribution(
    question,
    responses,
    gradeAnswer
  );

  return (
    <>
      <p
        className="font-sans font-semibold text-white max-w-[80vw] leading-snug"
        style={{ fontSize: 'clamp(1.2rem, 3.2vw, 3rem)', textWrap: 'balance' }}
      >
        {question.text}
      </p>
      <div
        className="w-full max-w-[70vw] flex flex-col"
        style={{ gap: '1.4vh' }}
      >
        {rows.map((row) => {
          const pct =
            totalAnswered > 0
              ? Math.round((row.count / totalAnswered) * 100)
              : 0;
          const correct = revealed && row.isCorrect;
          return (
            <div key={row.label}>
              <div
                className="flex items-center justify-between"
                style={{ gap: '2vw', marginBottom: '0.4vh' }}
              >
                <span
                  className={`font-sans inline-flex items-center truncate ${
                    correct ? 'text-emerald-300 font-semibold' : 'text-white/85'
                  }`}
                  style={{
                    fontSize: 'clamp(1rem, 2.2vw, 2rem)',
                    gap: '0.8vw',
                  }}
                >
                  {correct && (
                    <Check
                      aria-label="Correct answer"
                      style={{ width: '2.2vw', height: '2.2vw' }}
                    />
                  )}
                  {row.label}
                </span>
                <span
                  className="font-sans text-white/60 tabular-nums shrink-0"
                  style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.6rem)' }}
                >
                  {row.count}
                </span>
              </div>
              <div
                className="bg-white/15 rounded-full overflow-hidden"
                style={{ height: '1.6vh' }}
              >
                <div
                  className={`h-full rounded-full ${
                    correct ? 'bg-emerald-400' : 'bg-brand-blue-light'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p
            className="font-sans text-white/60"
            style={{ fontSize: 'clamp(1rem, 2.2vw, 2rem)' }}
          >
            No answers yet.
          </p>
        )}
      </div>
      <PresentStandings entries={standings} showNames={showNames} unit={unit} />
    </>
  );
};
