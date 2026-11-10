import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('@/utils/scanContrast', () => ({
  enhancedScanUrl: vi.fn(() => Promise.resolve('blob:enhanced')),
}));
const { getPaperBatch } = vi.hoisted(() => ({
  getPaperBatch: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/utils/paperBatchStore', () => ({ getPaperBatch }));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { PaperCropPanel } from '@/components/quiz/paper/PaperCropPanel';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { QuizData, QuizResponse, QuizResponseAnswer } from '@/types';

// Snapshots were recorded from the code before the markup editor existed.

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
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

const paperAnswer: QuizResponseAnswer = {
  questionId: 'q1',
  answer: '<p>The water cycle moves water.</p>',
  answeredAt: 0,
  paperScanId: 'scan1',
  paperTranscript: 'done',
  artifacts: [
    {
      id: 'hw_scan1_q1',
      slot: 'primary',
      kind: 'handwriting',
      storagePath: 'paper_written_crops/t1/scan1/3/q1.webp',
      uploadState: 'uploaded',
    },
  ],
};

const response: QuizResponse = {
  studentUid: 'ada',
  _responseKey: 'ada',
  answers: [paperAnswer],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings: 0,
  completedAttempts: 1,
  paperBatchId: 'batch1',
  paperSeat: 3,
  grading: {
    q1: {
      pointsAwarded: 3,
      gradedBy: 't1',
      gradedAt: 1,
      imageMarkup: {
        scanId: 'scan1',
        page: 1,
        items: [
          { id: 'm1', kind: 'pin', atMm: { x: 40, y: 80 }, comment: 'Hi' },
        ],
      },
    },
  },
};

const flagOff = {
  canAccessFeature: (id: string) => id !== 'paper-image-markup',
  canAccessQuizMediaResponse: () => false,
} as unknown as AuthContextType;

beforeEach(() => {
  window.localStorage.clear();
  getPaperBatch.mockClear();
});

describe('paper image markup with the flag off', () => {
  it('leaves the crop panel exactly as it was', async () => {
    const { container } = render(
      <PaperCropPanel
        questionNumber={2}
        sessionId="s1"
        responseKey="ada"
        questionId="q1"
        answer={paperAnswer}
        privateDoc={null}
        hasSnapshot={false}
        resolveCrop={vi.fn().mockResolvedValue('data:image/webp;base64,AA')}
      />
    );
    await waitFor(() =>
      expect(screen.getByAltText(/Handwritten answer/)).toHaveAttribute(
        'src',
        'blob:enhanced'
      )
    );
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('leaves the grader exactly as it was and loads no sheet layout', async () => {
    render(
      <AuthContext.Provider value={flagOff}>
        <FreeResponseGrader
          quiz={quiz}
          responses={[response]}
          displayNameByResponseKey={new Map([['ada', 'Ada Lovelace']])}
          teacherUid="t1"
          sessionId="s1"
          resolvePaperCrop={vi
            .fn()
            .mockResolvedValue('data:image/webp;base64,AA')}
          onSaveGrade={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
        />
      </AuthContext.Provider>
    );
    await waitFor(() =>
      expect(screen.getByAltText(/Handwritten answer/)).toHaveAttribute(
        'src',
        'blob:enhanced'
      )
    );
    const panel = screen.getByRole('region', { name: 'Handwriting' });
    expect(panel.outerHTML).toMatchSnapshot();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(getPaperBatch).not.toHaveBeenCalled();
  });
});
