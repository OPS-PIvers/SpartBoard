import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  QuizPublicQuestion,
  QuizResponse,
  QuizResponseAnswer,
  QuizScoreVisibility,
  QuizSession,
  WrittenAnswerGrade,
  WrittenReturnMode,
} from '@/types';
import type { GetPaperWrittenCropCall } from '@/utils/paperCropFetch';
import type { GetPaperPageCall } from '@/utils/paperWritten';

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

const QUESTIONS: QuizPublicQuestion[] = [
  {
    id: 'q1',
    type: 'free-response',
    text: 'Explain photosynthesis.',
    timeLimit: 0,
  },
];

const paperAnswer = (
  over: Partial<QuizResponseAnswer> = {}
): QuizResponseAnswer => ({
  questionId: 'q1',
  answer: '<p>Plants make sugar</p>',
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
  ...over,
});

const session = (over: Partial<QuizSession> = {}): QuizSession => ({
  id: 'session-1',
  assignmentId: 'asn-1',
  quizId: 'quiz-1',
  quizTitle: 'Paper quiz',
  teacherUid: 'teacher-1',
  status: 'ended',
  sessionMode: 'student',
  currentQuestionIndex: 0,
  startedAt: 1,
  endedAt: 2,
  code: 'ABC123',
  totalQuestions: 1,
  publicQuestions: QUESTIONS,
  ...over,
});

const response = (
  answer: QuizResponseAnswer,
  grade?: WrittenAnswerGrade
): QuizResponse & { _responseKey: string } => ({
  studentUid: 'student-1',
  joinedAt: 1,
  status: 'completed',
  submittedAt: 2,
  answers: [answer],
  score: 80,
  ...(grade ? { grading: { q1: grade } } : {}),
  paperPages: [2, 1].map((page) => ({
    id: `pg_scan1_${page}`,
    slot: 'primary' as const,
    kind: 'paper-page' as const,
    storagePath: `paper_pages/t1/scan1/3/${page}.webp`,
    uploadState: 'uploaded' as const,
  })),
  _responseKey: 'student-1',
});

const ready: GetPaperWrittenCropCall = () =>
  Promise.resolve({
    status: 'ready',
    mimeType: 'image/webp',
    data: 'AAAA',
    source: 'storage',
  });

const pageReady: GetPaperPageCall = ({ page }) =>
  Promise.resolve({
    status: 'ready',
    mimeType: 'image/webp',
    data: `P${page}`,
    source: 'storage',
  });

function renderReview(opts: {
  mode?: WrittenReturnMode;
  visibility?: QuizScoreVisibility;
  loadPaperPage?: GetPaperPageCall;
}) {
  const loadPaperPage = opts.loadPaperPage ?? vi.fn(pageReady);
  const visibility = opts.visibility ?? 'score-and-responses';
  render(
    <PublishedScoreReview
      session={session({
        scoreVisibility: visibility,
        ...(opts.mode ? { writtenReturnMode: opts.mode } : {}),
      })}
      myResponse={response(paperAnswer())}
      visibility={visibility}
      pin="1234"
      loadPaperCrop={vi.fn(ready)}
      loadPaperPage={loadPaperPage}
    />
  );
  return { loadPaperPage };
}

describe('PublishedScoreReview scanned answer sheet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows each kept page in sheet order', async () => {
    const { loadPaperPage } = renderReview({});
    expect(
      await screen.findByRole('heading', { name: 'Your answer sheet' })
    ).toBeInTheDocument();
    const pages = await screen.findAllByRole('img', {
      name: /of your answer sheet/,
    });
    expect(pages.map((img) => img.getAttribute('alt'))).toEqual([
      'Page 1 of your answer sheet',
      'Page 2 of your answer sheet',
    ]);
    expect(pages[0]).toHaveAttribute('src', 'data:image/webp;base64,P1');
    expect(loadPaperPage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      responseKey: 'student-1',
      page: 1,
    });
  });

  it('hides the section when the server refuses', async () => {
    const loadPaperPage = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('no'), { code: 'functions/permission-denied' })
      )
    );
    renderReview({ loadPaperPage });
    await waitFor(() => expect(loadPaperPage).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Your answer sheet' })
      ).not.toBeInTheDocument()
    );
  });

  it.each([
    ['score-only results', { visibility: 'score-only' as const }],
    ['typed written answers', { mode: 'typed' as const }],
  ])('never asks for pages with %s', (_label, opts) => {
    const { loadPaperPage } = renderReview(opts);
    expect(loadPaperPage).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Your answer sheet' })
    ).not.toBeInTheDocument();
  });
});
