import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizData, QuizResponse } from '@/types';
import type { ResultsPrintJob } from '@/utils/quizStudentReportPrint';
import { ResultsPrintModal } from '@/components/widgets/QuizWidget/components/ResultsPrintModal';

let markupOn = false;
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) => markupOn && id === 'paper-image-markup',
  }),
}));
vi.mock('@/utils/paperBatchStore', () => ({
  getPaperBatch: vi.fn().mockResolvedValue(null),
}));
const printQuizResults = vi.fn<(job: ResultsPrintJob) => void>();
vi.mock('@/utils/quizStudentReportPrint', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/quizStudentReportPrint')>()),
  printQuizResults: (job: ResultsPrintJob) => printQuizResults(job),
}));

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Capitals',
  createdAt: 1,
  updatedAt: 1,
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Capital of France?',
      correctAnswer: 'Paris',
      incorrectAnswers: ['Rome'],
      timeLimit: 30,
      points: 1,
    },
  ],
};

const responses = [
  {
    studentUid: 'u1',
    _responseKey: 'pin-p1-1111',
    pin: '1111',
    classPeriod: 'Period 1',
    status: 'completed',
    submittedAt: 200,
    answers: [{ questionId: 'q1', answer: 'Rome', answeredAt: 100 }],
  },
] as unknown as QuizResponse[];

const printed = () => {
  render(
    <ResultsPrintModal
      quiz={quiz}
      responses={responses}
      initialSelection={null}
      resolveName={() => 'Ada'}
      resolveShownName={() => 'Ada'}
      sortNameFor={() => 'Ada'}
      targetsFor={() => []}
      gradeFn={() => ({ isCorrect: false, pointsEarned: 0 }) as never}
      rubricFor={() => undefined}
      periodOrder={['Period 1']}
      sessionLive={false}
      teacherUid="teacher-1"
      onClose={vi.fn()}
      onError={vi.fn()}
    />
  );
  const dialog = screen.getByRole('dialog', { name: 'Print results' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Print' }));
  return printQuizResults.mock.calls[0][0];
};

describe('ResultsPrintModal image markup flag', () => {
  beforeEach(() => {
    printQuizResults.mockReset();
    localStorage.clear();
  });

  it('adds nothing to the print job while paper-image-markup is off', () => {
    markupOn = false;
    expect('imageMarkup' in printed()).toBe(false);
  });

  it('tells the print job when paper-image-markup is on', () => {
    markupOn = true;
    expect(printed().imageMarkup).toBe(true);
  });
});
