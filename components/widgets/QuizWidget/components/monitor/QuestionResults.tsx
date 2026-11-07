import React from 'react';
import { MathText } from '@/components/common/MathText';
import { ChevronRight, Lock } from 'lucide-react';
import { tourFieldAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import { QuizSession, QuizData, QuizResponse, QuizQuestion } from '@/types';
import { gradeAnswer } from '@/hooks/useQuizSession';
import {
  fibAcceptedAnswers,
  servedLocaleForResponse,
  type FibGradingContext,
} from '@/utils/quizFibAnswers';
import { buildDistribution } from '@/utils/answerDistribution';
import {
  AnswerDistributionBars,
  type DistributionBarRow,
} from '@/components/common/AnswerDistributionBars';

export interface ResultItem {
  id: string;
  /** Short label above the text, e.g. "Q1". */
  label: string;
  text: string;
  answered: number;
}

/** Tappable per-item rows with an answered count (Quiz questions, Flashcards cards). */
export const ItemResultsList: React.FC<{
  items: ResultItem[];
  onOpen: (index: number) => void;
  anchor?: (id: string) => TourAnchorAttrs;
}> = ({
  items,
  onOpen,
  anchor = (id) => tourFieldAttr('quiz-monitor.question-result', 'quiz', id),
}) => (
  <div className="flex flex-col" style={{ gap: 'min(6px, 1.5cqmin)' }}>
    {items.map((item, i) => (
      <button
        key={item.id}
        onClick={() => onOpen(i)}
        {...anchor(item.id)}
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
            {item.label}
          </p>
          <p
            className="font-sans text-brand-gray-dark truncate"
            style={{ fontSize: 'min(13px, 4.5cqmin)' }}
          >
            <MathText text={item.text} />
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
            {item.answered} answered
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
    ))}
  </div>
);

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
  <ItemResultsList
    items={quizData.questions.map((q, i) => ({
      id: q.id,
      label: `Q${i + 1}`,
      text: q.text,
      answered: responses.filter((r) =>
        r.answers.some((a) => a.questionId === q.id)
      ).length,
    }))}
    onOpen={onOpenQuestion}
  />
);

/** One item's answers as bars; correct answers stay unmarked until the session ends. */
export const ItemDetailView: React.FC<{
  /** e.g. "Question 1". */
  heading: string;
  text: string;
  totalAnswered: number;
  rows: readonly DistributionBarRow[];
  live: boolean;
  /** Replaces the bars, e.g. for written responses. */
  noDistribution?: React.ReactNode;
}> = ({ heading, text, totalAnswered, rows, live, noDistribution }) => (
  <div className="flex flex-col" style={{ gap: 'min(10px, 2.5cqmin)' }}>
    <div>
      <p
        className="font-sans font-semibold text-brand-blue-primary uppercase tracking-wider"
        style={{ fontSize: 'min(10px, 3.5cqmin)' }}
      >
        {heading} · {totalAnswered} answered
      </p>
      <p
        className="font-sans font-semibold text-brand-blue-dark"
        style={{ fontSize: 'min(15px, 5.5cqmin)', lineHeight: 1.3 }}
      >
        <MathText text={text} />
      </p>
    </div>

    {noDistribution ??
      (rows.length > 0 ? (
        <AnswerDistributionBars
          rows={rows}
          total={totalAnswered}
          showCorrect={!live}
        />
      ) : (
        <p
          className="text-brand-gray-primary"
          style={{ fontSize: 'min(12px, 4cqmin)' }}
        >
          No answers yet.
        </p>
      ))}

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

interface QuestionDetailProps {
  session: QuizSession;
  question: QuizQuestion;
  index: number;
  responses: QuizResponse[];
  /** Translated FIB answer keys + served-locale overrides; absent = English only. */
  fibGrading?: FibGradingContext | null;
}

export const QuestionDetail: React.FC<QuestionDetailProps> = ({
  session,
  question,
  index,
  responses,
  fibGrading,
}) => {
  const live = session.status !== 'ended';
  // A distribution row aggregates one answer string across students, so it is
  // marked correct when it matches English or a locale actually served to a
  // student who typed it.
  const localesByAnswer = new Map<string, Set<string>>();
  for (const r of responses) {
    const ans = r.answers.find((a) => a.questionId === question.id);
    const locale = servedLocaleForResponse(r, fibGrading);
    if (!ans || !locale) continue;
    const set = localesByAnswer.get(ans.answer) ?? new Set<string>();
    set.add(locale);
    localesByAnswer.set(ans.answer, set);
  }
  const { totalAnswered, rows } = buildDistribution(
    question,
    responses,
    (q, a) =>
      gradeAnswer(
        q,
        a,
        undefined,
        [...(localesByAnswer.get(a) ?? [])].flatMap((locale) =>
          fibAcceptedAnswers(fibGrading?.answers, q.id, locale)
        )
      )
  );
  const hasDistribution =
    question.type === 'MC' ||
    question.type === 'MA' ||
    question.type === 'FIB' ||
    rows.length > 0;

  return (
    <ItemDetailView
      heading={`Question ${index + 1}`}
      text={question.text}
      totalAnswered={totalAnswered}
      rows={rows}
      live={live}
      noDistribution={
        hasDistribution ? undefined : (
          <p
            className="text-brand-gray-primary"
            style={{ fontSize: 'min(12px, 4cqmin)' }}
          >
            {totalAnswered} response{totalAnswered === 1 ? '' : 's'}. Grade them
            in results.
          </p>
        )
      }
    />
  );
};
