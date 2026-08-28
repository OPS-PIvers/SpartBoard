import React from 'react';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { QuizSession, QuizData, QuizResponse, QuizQuestion } from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import { buildDistribution } from './monitorUtils';

interface QuestionResultsProps {
  quizData: QuizData;
  responses: QuizResponse[];
  onOpenQuestion: (index: number) => void;
}

export const QuestionResults: React.FC<QuestionResultsProps> = ({
  quizData,
  responses,
  onOpenQuestion,
}) => (
  <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
    {quizData.questions.map((q, i) => {
      const answered = responses.filter((r) =>
        r.answers.some((a) => a.questionId === q.id)
      ).length;
      return (
        <button
          key={q.id}
          onClick={() => onOpenQuestion(i)}
          className="flex items-center justify-between bg-white border border-brand-gray-lighter rounded-lg hover:border-brand-blue-light transition-colors text-left"
          style={{
            padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
            gap: 'min(8px, 2cqmin)',
          }}
        >
          <div className="min-w-0">
            <p
              className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
              style={{ fontSize: 'min(10px, 3.5cqmin)' }}
            >
              Q{i + 1}
            </p>
            <p
              className="font-sans text-brand-gray-dark truncate"
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
              style={{
                width: 'min(14px, 4.5cqmin)',
                height: 'min(14px, 4.5cqmin)',
              }}
            />
          </div>
        </button>
      );
    })}
  </div>
);

interface QuestionDetailProps {
  session: QuizSession;
  question: QuizQuestion;
  index: number;
  responses: QuizResponse[];
}

export const QuestionDetail: React.FC<QuestionDetailProps> = ({
  session,
  question,
  index,
  responses,
}) => {
  const live = session.status !== 'ended';
  const { totalAnswered, rows } = buildDistribution(
    question,
    responses,
    gradeAnswer
  );
  const hasDistribution =
    question.type === 'MC' || question.type === 'FIB' || rows.length > 0;

  return (
    <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
      <div>
        <p
          className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          Question {index + 1} · {totalAnswered} answered
        </p>
        <p
          className="font-sans font-semibold text-brand-blue-dark"
          style={{ fontSize: 'min(15px, 5.5cqmin)', lineHeight: 1.3 }}
        >
          {question.text}
        </p>
      </div>

      {hasDistribution ? (
        <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
          {rows.map((row) => {
            const pct =
              totalAnswered > 0
                ? Math.round((row.count / totalAnswered) * 100)
                : 0;
            const showCorrect = !live && row.isCorrect;
            return (
              <div key={row.label}>
                <div
                  className="flex items-center justify-between"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    marginBottom: 'min(2px, 0.5cqmin)',
                  }}
                >
                  <span
                    className={`font-sans truncate inline-flex items-center ${
                      showCorrect
                        ? 'text-emerald-700 font-semibold'
                        : 'text-brand-gray-dark'
                    }`}
                    style={{
                      fontSize: 'min(12px, 4cqmin)',
                      gap: 'min(4px, 1cqmin)',
                    }}
                  >
                    {showCorrect && (
                      <Check
                        aria-label="Correct answer"
                        style={{
                          width: 'min(12px, 4cqmin)',
                          height: 'min(12px, 4cqmin)',
                        }}
                      />
                    )}
                    {row.label}
                  </span>
                  <span
                    className="text-brand-gray-primary tabular-nums shrink-0"
                    style={{ fontSize: 'min(11px, 3.8cqmin)' }}
                  >
                    {row.count}
                  </span>
                </div>
                <div
                  className="bg-brand-gray-lightest rounded-full overflow-hidden"
                  style={{ height: 'min(8px, 2cqmin)' }}
                >
                  <div
                    className={`h-full rounded-full ${
                      showCorrect ? 'bg-emerald-500' : 'bg-brand-blue-light'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <p
              className="text-brand-gray-primary"
              style={{ fontSize: 'min(12px, 4cqmin)' }}
            >
              No answers yet.
            </p>
          )}
        </div>
      ) : (
        <p
          className="text-brand-gray-primary"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          {totalAnswered} response{totalAnswered === 1 ? '' : 's'} — graded in
          results.
        </p>
      )}

      {live && (
        <p
          className="inline-flex items-center text-brand-gray-primary"
          style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(11px, 3.8cqmin)' }}
        >
          <Lock
            aria-hidden
            style={{ width: 'min(12px, 4cqmin)', height: 'min(12px, 4cqmin)' }}
          />
          Correct answers appear in results after the session ends.
        </p>
      )}
    </div>
  );
};
