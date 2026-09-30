import React from 'react';
import { Check } from 'lucide-react';
import { QuizLeaderboardEntry, QuizQuestion, QuizResponse } from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { buildDistribution } from '@/utils/answerDistribution';
import { PresentStandings } from './PresentStandings';
import { PresentPodium } from './PresentPodium';
import { usePresentTheme } from './presentTheme';

interface PresentPacedReviewProps {
  question: QuizQuestion;
  responses: QuizResponse[];
  /** True only when `showCorrectOnBoard` is on AND the teacher revealed. */
  revealed: boolean;
  standings: QuizLeaderboardEntry[];
  showNames: boolean;
  unit: 'pts' | '%';
  /** Standings rows; Review sets this at launch (D21). */
  rankRows?: number;
  /** Review's game board: split layout with the podium. */
  game?: boolean;
  previous?: QuizLeaderboardEntry[];
}

export const PresentPacedReview: React.FC<PresentPacedReviewProps> = ({
  question,
  responses,
  revealed,
  standings,
  showNames,
  unit,
  rankRows,
  game = false,
  previous,
}) => {
  const t = usePresentTheme();
  const { totalAnswered, rows } = buildDistribution(
    question,
    responses,
    gradeAnswer
  );

  const questionAndBars = (
    <>
      <p
        className={`font-sans font-semibold max-w-[80vw] leading-snug ${t.strong}`}
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
                    correct ? t.correctText : t.strong
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
                  className={`font-sans tabular-nums shrink-0 ${t.muted}`}
                  style={{ fontSize: 'clamp(0.9rem, 1.8vw, 1.6rem)' }}
                >
                  {row.count}
                </span>
              </div>
              <div
                className={`rounded-full overflow-hidden ${t.track}`}
                style={{ height: '1.6vh' }}
              >
                <div
                  className={`h-full rounded-full ${
                    correct ? t.correctBar : t.bar
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p
            className={`font-sans ${t.muted}`}
            style={{ fontSize: 'clamp(1rem, 2.2vw, 2rem)' }}
          >
            No answers yet.
          </p>
        )}
      </div>
    </>
  );

  if (game && rankRows) {
    return (
      <div
        className="w-full flex-1 min-h-0 grid items-center"
        style={{ gridTemplateColumns: '1fr 1fr', gap: '4vw' }}
      >
        <div
          className="flex flex-col items-start text-left"
          style={{ gap: '3vh' }}
        >
          {questionAndBars}
        </div>
        <PresentPodium
          entries={standings}
          previous={previous}
          showNames={showNames}
          unit={unit}
          limit={rankRows}
          size="split"
        />
      </div>
    );
  }

  return (
    <>
      {questionAndBars}
      <PresentStandings
        entries={standings}
        showNames={showNames}
        unit={unit}
        limit={rankRows}
      />
    </>
  );
};
