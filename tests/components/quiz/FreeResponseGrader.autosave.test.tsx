import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import {
  FreeResponseGrader,
  REEDIT_DEBOUNCE_MS,
} from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { DEFAULT_GRADE_WRITE_BACKOFF_MS } from '@/hooks/useGradeWriteQueue';
import type {
  QuizData,
  QuizResponse,
  Rubric,
  WrittenAnswerGrade,
} from '@/types';

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

const quiz: QuizData = {
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
      points: 10,
      rubricId: rubric.id,
      rubricSnapshot: rubric,
    },
  ],
};

const responseFor = (studentUid: string): QuizResponse => ({
  studentUid,
  _responseKey: studentUid,
  answers: [{ questionId: 'q1', answer: '<p>hello world</p>', answeredAt: 0 }],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
});

const names = new Map([
  ['uid-a', 'Ada'],
  ['uid-b', 'Grace'],
]);

type SaveFn = (rk: string, k: string, g: WrittenAnswerGrade) => Promise<void>;

const renderGrader = (onSaveGrade: SaveFn, onClose = vi.fn()) => {
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={[responseFor('uid-a'), responseFor('uid-b')]}
      displayNameByResponseKey={names}
      teacherUid="teacher-1"
      onSaveGrade={onSaveGrade}
      onClose={onClose}
      autoAdvance={false}
    />
  );
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

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('FreeResponseGrader — auto-save', () => {
  it('writes once, immediately, when the rubric is complete', async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    renderGrader(onSave);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    const [rk, key, grade] = onSave.mock.calls[0];
    expect(rk).toBe('uid-a');
    expect(key).toBe('q1');
    expect(grade.pointsAwarded).toBe(7);
    expect(grade.rubricScores).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toMatch(/Saved/);
  });

  it('still writes once when the rubric is clicked slowly', async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    renderGrader(onSave);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    tick(5000);
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    tick(5000);
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('debounces a comment tweak after completion into a second write', async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    renderGrader(onSave);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    await flush();
    fireEvent.change(screen.getByLabelText(/Overall comment/i), {
      target: { value: 'Good' },
    });
    fireEvent.change(screen.getByLabelText(/Overall comment/i), {
      target: { value: 'Good work' },
    });
    tick(REEDIT_DEBOUNCE_MS - 1);
    expect(onSave).toHaveBeenCalledTimes(1);
    tick(1);
    await flush();
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][2].overallComment).toBe('Good work');
  });

  it('banks a partial rubric when the teacher moves on', async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    renderGrader(onSave);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    tick(5000);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][2].pointsAwarded).toBe(3);
    expect(onSave.mock.calls[0][2].rubricScores).toHaveLength(1);
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
  });

  it('does not write a comment with no score', async () => {
    const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
    renderGrader(onSave);
    fireEvent.change(screen.getByLabelText(/Overall comment/i), {
      target: { value: 'Just a note' },
    });
    tick(5000);
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    await flush();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a retry chip after a failed write and never blocks navigation', async () => {
    const onSave = vi.fn<SaveFn>().mockRejectedValue(new Error('offline'));
    renderGrader(onSave);
    fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    // Navigation works while the queue is still retrying.
    fireEvent.click(screen.getByRole('button', { name: /^Next ungraded/i }));
    expect(screen.getByText('Student 2 of 2')).toBeTruthy();
    for (const delay of DEFAULT_GRADE_WRITE_BACKOFF_MS) {
      tick(delay);
      await flush();
    }
    expect(onSave).toHaveBeenCalledTimes(
      DEFAULT_GRADE_WRITE_BACKOFF_MS.length + 1
    );
    const chip = screen.getByRole('button', { name: /Couldn't save/ });
    expect(chip.textContent).toMatch(/Retry/);
    onSave.mockResolvedValue(undefined);
    fireEvent.click(chip);
    await flush();
    expect(onSave).toHaveBeenCalledTimes(
      DEFAULT_GRADE_WRITE_BACKOFF_MS.length + 2
    );
    expect(screen.queryByRole('button', { name: /Couldn't save/ })).toBeNull();
  });

  it('asks before closing while a write is parked as failed, and closes on yes', async () => {
    const onSave = vi.fn<SaveFn>().mockRejectedValue(new Error('offline'));
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      renderGrader(onSave, onClose);
      fireEvent.click(screen.getByRole('radio', { name: /Meets/ }));
      fireEvent.click(screen.getByRole('radio', { name: /Strong/ }));
      await flush();
      fireEvent.click(screen.getAllByRole('button', { name: /^Close$/ })[0]);
      await flush();
      await flush();
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][0]).toMatch(/Ada/);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
