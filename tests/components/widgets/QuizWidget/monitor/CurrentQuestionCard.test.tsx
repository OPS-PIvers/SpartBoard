import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrentQuestionCard } from '@/components/widgets/QuizWidget/components/monitor/CurrentQuestionCard';
import type { QuizQuestion, QuizSession } from '@/types';

const question = {
  id: 'q1',
  text: 'What is 2 + 2?',
  type: 'MC',
} as QuizQuestion;

const session = (over: Partial<QuizSession>): QuizSession =>
  ({
    status: 'active',
    sessionMode: 'teacher',
    currentQuestionIndex: 0,
    totalQuestions: 3,
    ...over,
  }) as QuizSession;

const renderCard = (over: Partial<QuizSession>) =>
  render(
    <CurrentQuestionCard
      session={session(over)}
      currentQ={question}
      answered={0}
      total={2}
      doneCount={0}
      onAdvance={vi.fn().mockResolvedValue(undefined)}
    />
  );

describe('CurrentQuestionCard', () => {
  it('shows Next on a running teacher-paced question', () => {
    renderCard({});
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
  });

  it('hides Next while the session is paused', () => {
    renderCard({ status: 'paused' });
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Next/ })).toBeNull();
  });
});
