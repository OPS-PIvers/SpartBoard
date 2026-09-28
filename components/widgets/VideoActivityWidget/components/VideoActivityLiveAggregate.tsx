import React from 'react';
import type {
  VideoActivityPublicQuestion,
  VideoActivityQuestion,
} from '@/types';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { distributionFromAnswers } from '@/utils/answerDistribution';
import { groupFillInAnswers } from '@/utils/groupFillInAnswers';
import { gradeVideoActivityAnswer } from '@/utils/videoActivityGrading';
import {
  AnswerDistributionBars,
  type DistributionBarRow,
} from '@/components/common/AnswerDistributionBars';

export interface LiveAggregateProps {
  question: VideoActivityPublicQuestion;
  /** Keyed question for marking correct answers; undefined while the key loads. */
  keyQuestion: VideoActivityQuestion | undefined;
  /** Every submitted answer to the question, as stored. */
  answers: string[];
  answerRevealed: boolean;
}

interface LiveAggregate {
  totalAnswered: number;
  rows: DistributionBarRow[];
}

const OTHER_KEY = '\u0000other';

/** Anonymous class distribution for the open question (D16). */
function buildLiveAggregate({
  question,
  keyQuestion,
  answers,
  answerRevealed,
}: LiveAggregateProps): LiveAggregate {
  const options = question.options ?? [];
  if (question.type === 'FIB') {
    // Before the reveal, group by text alone so the key's spelling and variants stay hidden.
    const key =
      answerRevealed && keyQuestion ? keyQuestion : { correctAnswer: '' };
    const { groups, otherCount, totalAnswered } = groupFillInAnswers(
      answers,
      key
    );
    const rows: DistributionBarRow[] = groups.map((g) => ({ ...g }));
    if (otherCount > 0)
      rows.push({
        key: OTHER_KEY,
        label: 'Other',
        count: otherCount,
        isCorrect: false,
        muted: true,
      });
    return { totalAnswered, rows };
  }
  if (question.type === 'MA') {
    const { totalAnswered, rows } = distributionFromAnswers(
      {
        type: 'MA',
        correctAnswer: keyQuestion?.correctAnswer ?? '',
        incorrectAnswers: options,
      },
      answers,
      () => ({ isCorrect: false })
    );
    // Board order, so row position never hints at the key.
    const order = new Map(options.map((o, i) => [normalizeAnswer(o), i]));
    const at = (label: string) =>
      order.get(normalizeAnswer(label)) ?? options.length;
    return {
      totalAnswered,
      rows: [...rows].sort((a, b) => at(a.label) - at(b.label)),
    };
  }
  return distributionFromAnswers(
    {
      type: 'MC',
      correctAnswer: options[0] ?? '',
      incorrectAnswers: options.slice(1),
    },
    answers,
    (_q, label) =>
      keyQuestion
        ? gradeVideoActivityAnswer(keyQuestion, label)
        : { isCorrect: false }
  );
}

export const VideoActivityLiveAggregate: React.FC<
  LiveAggregateProps & { large?: boolean }
> = ({ question, keyQuestion, answers, answerRevealed, large = false }) => {
  const { totalAnswered, rows } = buildLiveAggregate({
    question,
    keyQuestion,
    answers,
    answerRevealed,
  });

  if (rows.length === 0) {
    return (
      <p
        className="font-bold text-slate-600"
        style={{ fontSize: large ? '4cqmin' : 'min(18px, 5cqmin)' }}
        data-testid="va-live-aggregate"
      >
        No answers yet
      </p>
    );
  }

  return (
    <div data-testid="va-live-aggregate">
      <AnswerDistributionBars
        rows={rows}
        total={totalAnswered}
        showCorrect={answerRevealed}
        correctLabel="Correct"
        labelSize={large ? '4.5cqmin' : 'min(22px, 5.5cqmin)'}
        countSize={large ? '4.5cqmin' : 'min(22px, 5.5cqmin)'}
        barHeight={large ? '3cqmin' : 'min(16px, 3.5cqmin)'}
        gap={large ? '2.5cqmin' : 'min(12px, 2.5cqmin)'}
      />
    </div>
  );
};
