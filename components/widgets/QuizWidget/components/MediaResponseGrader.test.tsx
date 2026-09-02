import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';

// EditorModalShell reaches for the dashboard toast bus and the dialog service;
// neither is part of what this suite asserts.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: () => undefined }),
}));
const { showConfirm } = vi.hoisted(() => ({
  showConfirm: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));

import {
  MediaResponseGrader,
  type MediaResponseGraderProps,
} from './MediaResponseGrader';
import type { QuizData, QuizResponse, WrittenAnswerGrade } from '@/types';

beforeAll(() => {
  // jsdom has no media pipeline; the transport is exercised, not decoded.
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

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

const quiz = {
  id: 'quiz-1',
  title: 'Spoken checks',
  questions: [
    {
      id: 'q1',
      text: 'Explain your reasoning out loud.',
      type: 'short',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 4,
      recording: RECORDING,
    },
    {
      id: 'q2',
      text: 'Read the passage aloud.',
      type: 'short',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 4,
      recording: RECORDING,
    },
    {
      id: 'q3',
      text: 'Pick the right answer.',
      type: 'MC',
      correctAnswer: 'A',
      incorrectAnswers: ['B'],
      timeLimit: 20,
      points: 1,
    },
  ],
} as unknown as QuizData;

const takeAnswer = (id: string, takeIndex: number) => ({
  questionId: 'q1',
  answer: '',
  answeredAt: 1_000 + takeIndex,
  takeIndex,
  artifacts: [
    {
      id,
      slot: 'primary' as const,
      kind: 'audio' as const,
      uploadState: 'uploaded' as const,
      durationMs: 20_000,
    },
  ],
});

const recorded = (key: string, takes: number): QuizResponse =>
  ({
    _responseKey: key,
    studentUid: `u-${key}`,
    status: 'completed',
    answers: Array.from({ length: takes }, (_, i) =>
      takeAnswer(`${key}-t${i + 1}`, i + 1)
    ),
    artifactArchive: Object.fromEntries(
      Array.from({ length: takes }, (_, i) => [
        `${key}-t${i + 1}`,
        { archiveStatus: 'archived', driveFileId: `drive-${key}-${i + 1}` },
      ])
    ),
  }) as unknown as QuizResponse;

const unavailable = (key: string): QuizResponse =>
  ({
    _responseKey: key,
    studentUid: `u-${key}`,
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

const names = new Map([
  ['ada', 'Ada Lovelace'],
  ['grace', 'Grace Hopper'],
]);

const renderGrader = (
  responses: QuizResponse[],
  onSaveGrade = vi.fn<MediaResponseGraderProps['onSaveGrade']>(() =>
    Promise.resolve()
  ),
  onClose: () => void = () => undefined
) => {
  render(
    <MediaResponseGrader
      quiz={quiz}
      responses={responses}
      displayNameByResponseKey={names}
      teacherUid="teacher-1"
      resolveTakeUrl={() => Promise.resolve('blob:take')}
      onSaveGrade={onSaveGrade}
      onClose={onClose}
    />
  );
  return onSaveGrade;
};

describe('MediaResponseGrader queue shape', () => {
  it('is question-major: one question, every student on this question', async () => {
    renderGrader([recorded('ada', 1), recorded('grace', 1)]);
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText('Student 1 of 2')).toBeTruthy();
    // The left rail is the student list for THIS question.
    const rail = screen.getByRole('navigation', {
      name: /students on this question/i,
    });
    expect(rail.textContent).toContain('Ada Lovelace');
    expect(rail.textContent).toContain('Grace Hopper');
  });

  it('only offers questions that carry a recording block', async () => {
    renderGrader([recorded('ada', 1)]);
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText(/Explain your reasoning out loud/)).toBeTruthy();
  });

  it('shows an empty state when nothing has been recorded', () => {
    renderGrader([]);
    expect(screen.getByText(/No recorded answers to grade yet/i)).toBeTruthy();
  });
});

describe('MediaResponseGrader take pinning', () => {
  it('defaults to the winning take and records an earlier pick as gradedTakeIndex', async () => {
    const onSave = renderGrader([recorded('ada', 3)]);
    expect(await screen.findByText('3 takes recorded')).toBeTruthy();

    // Winner first, so pinning is opt-in.
    expect(
      screen
        .getByRole('button', { name: /Take 3/ })
        .getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Take 1/ }));
    expect(
      screen
        .getByRole('button', { name: /Take 1/ })
        .getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.change(screen.getByLabelText(/Points awarded/i), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save grade/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [, key, grade] = onSave.mock.calls[0] as [
      string,
      string,
      WrittenAnswerGrade,
    ];
    expect(key).toBe('q1');
    expect(grade.gradedTakeIndex).toBe(1);
    expect(grade.pointsAwarded).toBe(3);
  });
});

describe('MediaResponseGrader capture-unavailable adjudication', () => {
  it('offers exactly Excuse / Blank / Offline substitute', () => {
    renderGrader([unavailable('grace')]);
    expect(screen.getByRole('button', { name: /^Excuse/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Blank/ })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Offline substitute/ })
    ).toBeTruthy();
  });

  it('writes excused: true for Excuse', async () => {
    const onSave = renderGrader([unavailable('grace')]);
    fireEvent.click(screen.getByRole('button', { name: /^Excuse/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save grade/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const grade = onSave.mock.calls[0][2];
    expect(grade.excused).toBe(true);
    expect(grade.pointsAwarded).toBe(0);
    expect(grade.overallComment).toBeUndefined();
  });

  it('writes a bare zero-point grade for Blank', async () => {
    const onSave = renderGrader([unavailable('grace')]);
    fireEvent.click(screen.getByRole('button', { name: /^Blank/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save grade/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const grade = onSave.mock.calls[0][2];
    expect(grade.excused).toBeUndefined();
    expect(grade.overallComment).toBeUndefined();
    expect(grade.pointsAwarded).toBe(0);
  });

  it('blocks Save until an offline substitute carries its mandatory note', async () => {
    const onSave = renderGrader([unavailable('grace')]);
    fireEvent.click(
      screen.getByRole('button', { name: /^Offline substitute/ })
    );
    const save = screen.getByRole('button', { name: /Save grade/i });
    expect(save.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/needs a note/i);

    fireEvent.change(screen.getByLabelText(/Note \(required\)/i), {
      target: { value: 'Answered aloud at my desk.' },
    });
    fireEvent.change(screen.getByLabelText(/Points awarded/i), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save grade/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const grade = onSave.mock.calls[0][2];
    expect(grade.overallComment).toBe('Answered aloud at my desk.');
    expect(grade.pointsAwarded).toBe(2);
    expect(grade.gradedTakeIndex).toBeUndefined();
  });

  it('cannot be saved before the teacher picks an outcome', () => {
    renderGrader([unavailable('grace')]);
    expect(
      screen
        .getByRole('button', { name: /Save grade/i })
        .hasAttribute('disabled')
    ).toBe(true);
  });
});

describe('MediaResponseGrader take lifecycle states', () => {
  it('explains a take that is still archiving instead of offering a dead player', () => {
    const response = recorded('ada', 1);
    (
      response as unknown as { artifactArchive: Record<string, unknown> }
    ).artifactArchive = {
      'ada-t1': { archiveStatus: 'syncing' },
    };
    renderGrader([response]);
    expect(screen.getAllByText(/Still saving/).length).toBeGreaterThan(0);
  });

  it('explains a deleted take and keeps the grade fields usable', () => {
    const response = recorded('ada', 1);
    (
      response as unknown as { artifactArchive: Record<string, unknown> }
    ).artifactArchive = {
      'ada-t1': { archiveStatus: 'deleted', deletedAt: 1 },
    };
    renderGrader([response]);
    expect(screen.getByText(/deleted for compliance/i)).toBeTruthy();
    expect(screen.getByLabelText(/Points awarded/i)).toBeTruthy();
  });
});

describe('MediaResponseGrader time-anchored comments', () => {
  it('stores a comment at the current playback position in milliseconds', async () => {
    const onSave = renderGrader([recorded('ada', 1)]);
    fireEvent.click(
      await screen.findByRole('button', { name: /Comment here/i })
    );
    fireEvent.change(screen.getByLabelText('Comment at 0:00'), {
      target: { value: 'Nice framing here.' },
    });
    fireEvent.change(screen.getByLabelText(/Points awarded/i), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save grade/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const grade = onSave.mock.calls[0][2];
    expect(grade.annotations).toHaveLength(1);
    expect(grade.annotations?.[0]).toMatchObject({
      from: 0,
      to: 0,
      comment: 'Nice framing here.',
    });
  });
});

describe('MediaResponseGrader close guard', () => {
  it('routes Escape through the shell dirty-check instead of closing outright', async () => {
    showConfirm.mockClear();
    const onClose = vi.fn();
    renderGrader([recorded('ada', 1)], undefined, onClose);
    await screen.findByLabelText(/Points awarded/i);
    fireEvent.change(screen.getByLabelText(/Points awarded/i), {
      target: { value: '3' },
    });

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
