import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizResponse, QuizSession, StudentOverride } from '@/types';

vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: { currentUser: null },
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

import { PublishedScoreReview } from '@/components/quiz/QuizStudentApp';
import { recapChoiceMarks } from '@/utils/quizRecapChoiceMarks';

const makeSession = (extra: Partial<QuizSession> = {}) =>
  ({
    id: 'session-1',
    quizTitle: 'Rocks',
    teacherUid: 't1',
    status: 'ended',
    sessionMode: 'student',
    recapAllOptions: true,
    publicQuestions: [
      {
        id: 'q1',
        type: 'MC',
        text: 'Thinnest layer?',
        choices: ['Mantle', 'Crust', 'Outer core'],
        timeLimit: 0,
      },
      {
        id: 'q2',
        type: 'MA',
        text: 'Igneous rocks?',
        choices: ['Granite', 'Sandstone', 'Basalt'],
        timeLimit: 0,
      },
    ],
    ...extra,
  }) as unknown as QuizSession;

const response = {
  _responseKey: 'student-1',
  studentUid: 'student-1',
  status: 'completed',
  completedAttempts: 1,
  score: 0,
  answers: [
    { questionId: 'q1', answer: 'Mantle', answeredAt: 0, isCorrect: false },
    {
      questionId: 'q2',
      answer: 'Granite|Sandstone',
      answeredAt: 0,
      isCorrect: false,
    },
  ],
} as unknown as QuizResponse & { _responseKey: string };

const marks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('li[data-mark]')).map((li) => [
    li.textContent,
    li.getAttribute('data-mark'),
  ]);

describe('recapChoiceMarks', () => {
  it('marks a wrong MC pick without revealing the key', () => {
    expect(
      recapChoiceMarks('MC', ['A', 'B', 'C'], 'B', false, undefined)
    ).toEqual(['none', 'wrong', 'none']);
  });

  it('leaves wrong MA picks neutral when no key is published', () => {
    expect(
      recapChoiceMarks('MA', ['A', 'B', 'C'], 'A|B', false, undefined)
    ).toEqual(['picked', 'picked', 'none']);
  });

  it('marks every pick right when the whole MA answer is right', () => {
    expect(
      recapChoiceMarks('MA', ['A', 'B', 'C'], 'A|C', true, undefined)
    ).toEqual(['right', 'none', 'right']);
  });

  it('marks each option against a published key', () => {
    expect(
      recapChoiceMarks('MA', ['A', 'B', 'C'], 'A|B', false, 'A|C')
    ).toEqual(['right', 'wrong', 'key']);
  });
});

describe('PublishedScoreReview all answer options', () => {
  it('lists every option and hides the key at the responses level', () => {
    const { container } = render(
      <PublishedScoreReview
        session={makeSession()}
        myResponse={response}
        visibility="score-and-responses"
        revealedAnswers={{ q1: 'Crust', q2: 'Granite|Basalt' }}
        pin=""
      />
    );
    expect(marks(container)).toEqual([
      ['MantleYour answer', 'wrong'],
      ['Crust', 'none'],
      ['Outer core', 'none'],
      ['GraniteYour answer', 'picked'],
      ['SandstoneYour answer', 'picked'],
      ['Basalt', 'none'],
    ]);
    expect(screen.queryByText('Correct answer')).toBeNull();
  });

  it('marks the correct options at the answers level', () => {
    const { container } = render(
      <PublishedScoreReview
        session={makeSession()}
        myResponse={response}
        visibility="score-responses-and-answers"
        revealedAnswers={{ q1: 'Crust', q2: 'Granite|Basalt' }}
        pin=""
      />
    );
    expect(marks(container).map(([, m]) => m)).toEqual([
      'wrong',
      'key',
      'none',
      'right',
      'wrong',
      'key',
    ]);
  });

  it('leaves out options this student had hidden', () => {
    const override = {
      hiddenOptionIdsByQuestion: { q1: ['Outer core'] },
    } as unknown as StudentOverride;
    const { container } = render(
      <PublishedScoreReview
        session={makeSession()}
        myResponse={response}
        visibility="score-and-responses"
        override={override}
        pin=""
      />
    );
    expect(screen.queryByText('Outer core')).toBeNull();
    expect(marks(container)).toHaveLength(5);
  });

  it('still shows a pick that matches no listed option', () => {
    const override = {
      hiddenOptionIdsByQuestion: { q1: ['Mantle'] },
    } as unknown as StudentOverride;
    const { container } = render(
      <PublishedScoreReview
        session={makeSession()}
        myResponse={response}
        visibility="score-and-responses"
        override={override}
        pin=""
      />
    );
    expect(marks(container).slice(0, 3)).toEqual([
      ['Crust', 'none'],
      ['Outer core', 'none'],
      ['MantleYour answer', 'wrong'],
    ]);
  });

  it('keeps the single answer line without the session stamp', () => {
    const { container } = render(
      <PublishedScoreReview
        session={makeSession({ recapAllOptions: undefined })}
        myResponse={response}
        visibility="score-and-responses"
        pin=""
      />
    );
    expect(container.querySelector('li[data-mark]')).toBeNull();
    expect(screen.queryByText('Crust')).toBeNull();
  });
});
