import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { paperPrivateKey } from '@/utils/paperCropFetch';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type {
  PaperPrivateAnswer,
  QuizData,
  QuizResponse,
  QuizResponseAnswer,
} from '@/types';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'mc',
      type: 'MC',
      text: 'Pick.',
      timeLimit: 0,
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
    },
    {
      id: 'q1',
      type: 'free-response',
      text: 'Explain.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 4,
    },
  ],
};

const paperAnswer = (
  over: Partial<QuizResponseAnswer>
): QuizResponseAnswer => ({
  questionId: 'q1',
  answer: '',
  answeredAt: 0,
  paperScanId: 'scan1',
  paperTranscript: 'pending',
  artifacts: [
    {
      id: 'hw_scan1_q1',
      slot: 'primary',
      kind: 'handwriting',
      storagePath: 'paper_written_crops/t1/scan1/1/q1.webp',
      uploadState: 'uploaded',
    },
  ],
  ...over,
});

const response = (key: string, answer: QuizResponseAnswer): QuizResponse => ({
  studentUid: key,
  _responseKey: key,
  answers: [answer],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
});

const names = new Map([
  ['pending', 'Pending Pat'],
  ['failed', 'Failed Fran'],
  ['blank', 'Blank Bo'],
  ['typed', 'Typed Tia'],
]);

const privateFor = (
  status: PaperPrivateAnswer['status']
): PaperPrivateAnswer => ({
  scanId: 'scan1',
  status,
  attempts: 1,
  charged: false,
  updatedAt: 0,
});

const renderGrader = (responses: QuizResponse[], withCrops = true) =>
  render(
    <AuthContext.Provider
      value={{ canAccessFeature: () => true } as unknown as AuthContextType}
    >
      <FreeResponseGrader
        quiz={quiz}
        responses={responses}
        displayNameByResponseKey={names}
        teacherUid="teacher-1"
        sessionId="s1"
        paperPrivate={
          new Map([
            [paperPrivateKey('failed', 'q1'), privateFor('failed')],
            [paperPrivateKey('blank', 'q1'), privateFor('blank')],
          ])
        }
        resolvePaperCrop={
          withCrops
            ? vi.fn().mockResolvedValue('data:image/webp;base64,AA')
            : undefined
        }
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    </AuthContext.Provider>
  );

const railRow = (name: string) =>
  screen.getByRole('button', { name: new RegExp(name) });

beforeEach(() => window.localStorage.clear());

describe('FreeResponseGrader with paper written answers', () => {
  const responses = [
    response('pending', paperAnswer({})),
    response('failed', paperAnswer({})),
    response('blank', paperAnswer({ paperTranscript: 'blank' })),
    response('typed', {
      questionId: 'q1',
      answer: '<p>typed words</p>',
      answeredAt: 0,
    }),
  ];

  it('queues pending, failed and blank boxes with named states', () => {
    renderGrader(responses);
    expect(
      within(railRow('Pending Pat')).getByText('Transcribing')
    ).toBeVisible();
    expect(within(railRow('Failed Fran')).getByText('Failed')).toBeVisible();
    expect(within(railRow('Blank Bo')).getByText('Blank')).toBeVisible();
    expect(within(railRow('Typed Tia')).getByText('Ungraded')).toBeVisible();
  });

  it('marks paper answers with a Paper badge and typed ones without', () => {
    renderGrader(responses);
    expect(within(railRow('Pending Pat')).getByText('Paper')).toBeVisible();
    expect(within(railRow('Typed Tia')).queryByText('Paper')).toBeNull();
  });

  it('shows the handwriting beside the grade for the open paper answer', async () => {
    renderGrader(responses);
    expect(
      await screen.findByAltText('Handwritten answer, question 2')
    ).toBeVisible();
    expect(
      screen.queryByText("The student didn't answer this question.")
    ).toBeNull();
  });

  it('counts a blank box as graded, since it scores 0', () => {
    renderGrader(responses);
    expect(screen.getByText('1/4 graded')).toBeInTheDocument();
  });

  it('shows no crop panel when no crop loader is given', () => {
    renderGrader(responses, false);
    expect(screen.queryByRole('region', { name: 'Handwriting' })).toBeNull();
  });
});
