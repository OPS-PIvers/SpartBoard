import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuestionTargetTag, QuizQuestion, QuizResponse } from '@/types';
import { QuizTargetResults } from '@/components/widgets/QuizWidget/components/QuizTargetResults';
import { computeTargetStats } from '@/utils/quizTargetStats';

const target: QuestionTargetTag = {
  id: 'lt-1',
  kind: 'plc',
  ownerId: 'plc-1',
  code: 'LT 1',
  label: 'Analyze evidence',
  standardIds: ['mn-ela-2020:6.4.2.2'],
};

const question: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Which detail is strongest?',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  timeLimit: 30,
  points: 1,
  targets: [target],
};

const response = (uid: string, answer: string): QuizResponse =>
  ({
    _responseKey: uid,
    studentUid: uid,
    joinedAt: 1,
    status: 'completed',
    servedQuestionIds: ['q1'],
    answers: [{ questionId: 'q1', answer, answeredAt: 2 }],
    score: null,
    submittedAt: 3,
  }) as QuizResponse;

describe('QuizTargetResults', () => {
  it('renders standard rollups, expandable target questions and a sortable grid', () => {
    const responses = [response('ada', 'A'), response('grace', 'B')];
    const stats = computeTargetStats([question], responses, {
      proficient: 80,
      approaching: 60,
    });
    render(
      <QuizTargetResults
        quizTitle="Evidence Quiz"
        responses={responses}
        stats={stats}
        resolveName={(item) =>
          item.studentUid === 'ada' ? 'Ada Lovelace' : 'Grace Hopper'
        }
      />
    );

    expect(screen.getByText('Standards')).toBeInTheDocument();
    expect(screen.getByText('Class mastery by target')).toBeInTheDocument();
    expect(screen.getByText('Student × target')).toBeInTheDocument();
    expect(screen.getAllByText('Low sample').length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Expand LT 1 — Analyze evidence',
      })
    );
    expect(screen.getByText('Which detail is strongest?')).toBeInTheDocument();

    const table = screen.getByRole('table');
    const bodyRows = within(table).getAllByRole('row').slice(1);
    expect(within(bodyRows[0]).getByText('Ada Lovelace')).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: 'LT 1' }));
    const sortedRows = within(table).getAllByRole('row').slice(1);
    expect(within(sortedRows[0]).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(sortedRows[0]).getByText('100%')).toBeInTheDocument();
  });
});
