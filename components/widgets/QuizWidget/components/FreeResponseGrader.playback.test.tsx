import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: () => undefined }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

import { FreeResponseGrader } from './FreeResponseGrader';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { WritingLogWriter } from '@/utils/writingLog';
import type { GlobalFeaturePermission, QuizData, QuizResponse } from '@/types';

const quiz = {
  id: 'quiz-1',
  title: 'Essays',
  questions: [
    {
      id: 'q1',
      text: 'Describe the water cycle.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 4,
    },
  ],
} as unknown as QuizData;

const logOf = (steps: string[]) => {
  const w = new WritingLogWriter(undefined);
  let prev = '';
  steps.forEach((next, i) => {
    w.write(prev, next, i * 200, 'typed', 1e6);
    prev = next;
  });
  return w.value;
};

const response = (
  signals: Record<string, unknown>,
  completedAttempts = 1
): QuizResponse =>
  ({
    _responseKey: 'ada',
    studentUid: 'u-ada',
    status: 'completed',
    completedAttempts,
    answers: [{ questionId: 'q1', answer: 'rain falls', answeredAt: 1 }],
    inputSignals: signals,
  }) as unknown as QuizResponse;

const permissions = (off: boolean): GlobalFeaturePermission[] =>
  [
    {
      featureId: 'input-signals',
      config: off ? { signs: { 'writing-playback': { off: true } } } : {},
    },
  ] as unknown as GlobalFeaturePermission[];

const renderGrader = (
  r: QuizResponse,
  {
    feature = true,
    admin = false,
    off = false,
    attemptNumber,
  }: {
    feature?: boolean;
    admin?: boolean;
    off?: boolean;
    attemptNumber?: number;
  } = {}
) =>
  render(
    <AuthContext.Provider
      value={
        {
          isAdmin: admin,
          globalPermissions: permissions(off),
          canAccessFeature: (id: string) => id === 'input-signals' && feature,
          canAccessQuizMediaResponse: () => false,
        } as unknown as AuthContextType
      }
    >
      <FreeResponseGrader
        quiz={quiz}
        responses={[r]}
        displayNameByResponseKey={new Map([['ada', 'Ada Lovelace']])}
        teacherUid="teacher-1"
        onSaveGrade={() => Promise.resolve()}
        attemptNumber={attemptNumber}
        onClose={() => undefined}
      />
    </AuthContext.Provider>
  );

describe('FreeResponseGrader writing playback', () => {
  it('swaps the answer for its playback and back', async () => {
    renderGrader(response({ 0: { q1: { log: logOf(['r', 'ra', 'rain']) } } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Playback' }));
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByText('Writing time')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to answer' }));
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('shows nothing without the feature or a recorded log', async () => {
    const { unmount } = renderGrader(
      response({ 0: { q1: { log: logOf(['r']) } } }),
      { feature: false }
    );
    expect(await screen.findByText('rain falls')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull();
    unmount();
    renderGrader(response({}));
    expect(await screen.findByText('rain falls')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull();
  });

  it('hides it from teachers when the switch is off, but not from admins', async () => {
    const r = response({ 0: { q1: { log: logOf(['r']) } } });
    const { unmount } = renderGrader(r, { off: true });
    expect(await screen.findByText('rain falls')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull();
    unmount();
    renderGrader(r, { off: true, admin: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Playback' }));
    expect(screen.getByText('Hidden from teachers')).toBeInTheDocument();
  });

  it('reads the attempt being graded, not the latest', async () => {
    const signals = { 1: { q1: { log: logOf(['r']) } } };
    const { unmount } = renderGrader(response(signals, 2), {
      attemptNumber: 1,
    });
    expect(await screen.findByText('rain falls')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Playback' })).toBeNull();
    unmount();
    renderGrader(response(signals, 2));
    expect(
      await screen.findByRole('button', { name: 'Playback' })
    ).toBeInTheDocument();
  });
});
