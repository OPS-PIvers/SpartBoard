import React from 'react';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import {
  FreeResponseGrader,
  ADVANCE_DELAY_MS,
  POINTS_IDLE_MS,
  REEDIT_DEBOUNCE_MS,
} from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type {
  QuizData,
  QuizResponse,
  Rubric,
  WrittenAnswerGrade,
} from '@/types';

beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: () => undefined,
  });
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x' });
  }
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: () => undefined,
  });
});

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      levels: [
        { id: 'c1l1', label: 'Below', points: 1 },
        { id: 'c1l2', label: 'Meets', points: 3 },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'c2l1', label: 'Weak', points: 1 },
        { id: 'c2l2', label: 'Strong', points: 4 },
      ],
    },
  ],
};

const quizWith = (attachRubric: boolean): QuizData => ({
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'free-response',
      text: 'Write something.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 20,
      ...(attachRubric ? { rubricId: rubric.id, rubricSnapshot: rubric } : {}),
    },
  ],
});

const responseFor = (
  studentUid: string,
  grading?: Record<string, WrittenAnswerGrade>
): QuizResponse => ({
  studentUid,
  _responseKey: studentUid,
  answers: [{ questionId: 'q1', answer: '<p>hello world</p>', answeredAt: 0 }],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
  ...(grading ? { grading } : {}),
});

type SaveFn = (rk: string, k: string, g: WrittenAnswerGrade) => Promise<void>;

const renderGrader = (
  quiz: QuizData,
  responses: QuizResponse[],
  extra: Partial<React.ComponentProps<typeof FreeResponseGrader>> = {}
) => {
  const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={responses}
      teacherUid="teacher-1"
      onSaveGrade={onSave}
      onClose={vi.fn()}
      {...extra}
    />
  );
  return onSave;
};

const flush = () =>
  act(async () => {
    await Promise.resolve();
  });
const tick = (ms: number) => {
  void act(() => {
    vi.advanceTimersByTime(ms);
  });
};
const nextButton = () =>
  screen.getByRole('button', { name: /^Next ungraded/i });
const isArmed = () => nextButton().hasAttribute('data-advance-armed');
const points = () => screen.getByLabelText(/Points awarded/i);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('FreeResponseGrader — auto-advance', () => {
  it('arms on the last rubric criterion and moves on after the delay', async () => {
    renderGrader(quizWith(true), [responseFor('a'), responseFor('b')]);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    expect(isArmed()).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(isArmed()).toBe(true);
    tick(ADVANCE_DELAY_MS - 1);
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
    tick(1);
    await flush();
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
    expect(isArmed()).toBe(false);
  });

  it('cancels when the teacher touches the right rail again', async () => {
    renderGrader(quizWith(true), [responseFor('a'), responseFor('b')]);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(isArmed()).toBe(true);
    fireEvent.pointerDown(screen.getByLabelText(/Overall comment/i));
    expect(isArmed()).toBe(false);
    tick(ADVANCE_DELAY_MS + 100);
    await flush();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
  });

  it('arms on Enter in the points field', async () => {
    const onSave = renderGrader(quizWith(false), [
      responseFor('a'),
      responseFor('b'),
    ]);
    fireEvent.change(points(), { target: { value: '5' } });
    fireEvent.keyDown(points(), { key: 'Enter' });
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(isArmed()).toBe(true);
    tick(ADVANCE_DELAY_MS);
    await flush();
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
  });

  it('does not split "15" into a write for "1" while the teacher is still typing', async () => {
    const onSave = renderGrader(quizWith(false), [
      responseFor('a'),
      responseFor('b'),
    ]);
    fireEvent.change(points(), { target: { value: '1' } });
    tick(POINTS_IDLE_MS - 200);
    fireEvent.change(points(), { target: { value: '15' } });
    tick(POINTS_IDLE_MS - 1);
    expect(onSave).not.toHaveBeenCalled();
    expect(isArmed()).toBe(false);
    tick(1);
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2].pointsAwarded).toBe(15);
    expect(isArmed()).toBe(true);
    tick(ADVANCE_DELAY_MS);
    await flush();
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
  });

  it('never arms for a grade that was already complete on arrival', async () => {
    const saved: WrittenAnswerGrade = {
      pointsAwarded: 7,
      gradedBy: 'teacher-1',
      gradedAt: 1,
      rubricScores: [
        { criterionId: 'c1', levelId: 'c1l2', points: 3 },
        { criterionId: 'c2', levelId: 'c2l2', points: 4 },
      ],
    };
    const onSave = renderGrader(quizWith(true), [
      responseFor('a', { q1: saved }),
      responseFor('b'),
    ]);
    fireEvent.click(screen.getByRole('radio', { name: /Below/ }));
    expect(isArmed()).toBe(false);
    tick(REEDIT_DEBOUNCE_MS);
    await flush();
    // The re-grade itself is still saved.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2].pointsAwarded).toBe(5);
    tick(ADVANCE_DELAY_MS);
    await flush();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
  });

  it('never arms while the switch is off, and reports the change', async () => {
    const onAutoAdvanceChange = vi.fn();
    renderGrader(quizWith(true), [responseFor('a'), responseFor('b')], {
      onAutoAdvanceChange,
    });
    const toggle = screen.getByRole('switch', { name: /Auto-advance/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(onAutoAdvanceChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    expect(isArmed()).toBe(false);
    tick(ADVANCE_DELAY_MS + 100);
    await flush();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
  });

  it('respects an initial autoAdvance={false}', () => {
    renderGrader(quizWith(true), [responseFor('a'), responseFor('b')], {
      autoAdvance: false,
    });
    expect(
      screen
        .getByRole('switch', { name: /Auto-advance/i })
        .getAttribute('aria-checked')
    ).toBe('false');
  });

  it('arms on Excuse for a student whose capture never worked', async () => {
    const RECORDING = {
      prepSeconds: 30,
      limitSeconds: 60,
      prepExpiry: 'armed' as const,
      takeLimit: null,
    };
    const spokenQuiz = {
      ...quizWith(false),
      questions: [{ ...quizWith(false).questions[0], recording: RECORDING }],
    } as QuizData;
    const unavailable = (key: string): QuizResponse =>
      ({
        _responseKey: key,
        studentUid: key,
        status: 'completed',
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1,
            unresponded: 'capture-unavailable',
          },
        ],
      }) as unknown as QuizResponse;
    const onSave = renderGrader(
      spokenQuiz,
      [unavailable('a'), unavailable('b')],
      {
        resolveTakeUrl: () => Promise.resolve('blob:take'),
      }
    );
    fireEvent.click(screen.getByRole('button', { name: /^Excuse/ }));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2].excused).toBe(true);
    expect(isArmed()).toBe(true);
    tick(ADVANCE_DELAY_MS);
    await flush();
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
  });

  it('shows "All graded" instead of moving when nothing else is owed', async () => {
    renderGrader(quizWith(false), [responseFor('a')]);
    fireEvent.change(points(), { target: { value: '5' } });
    fireEvent.keyDown(points(), { key: 'Enter' });
    await flush();
    tick(ADVANCE_DELAY_MS);
    await flush();
    expect(screen.getByText(/All graded/)).toBeTruthy();
    expect(screen.getByText('Student 1 of 1')).toBeTruthy();
  });
});
