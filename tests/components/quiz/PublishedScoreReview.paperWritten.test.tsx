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
  _responseKey: 'student-1',
});

const ready: GetPaperWrittenCropCall = () =>
  Promise.resolve({
    status: 'ready',
    mimeType: 'image/webp',
    data: 'AAAA',
    source: 'storage',
  });

function renderReview(opts: {
  mode?: WrittenReturnMode;
  visibility?: QuizScoreVisibility;
  answer?: QuizResponseAnswer;
  grade?: WrittenAnswerGrade;
  loadPaperCrop?: GetPaperWrittenCropCall;
}) {
  const loadPaperCrop = opts.loadPaperCrop ?? vi.fn(ready);
  const visibility = opts.visibility ?? 'score-and-responses';
  const utils = render(
    <PublishedScoreReview
      session={session({
        scoreVisibility: visibility,
        ...(opts.mode ? { writtenReturnMode: opts.mode } : {}),
      })}
      myResponse={response(opts.answer ?? paperAnswer(), opts.grade)}
      visibility={visibility}
      pin="1234"
      loadPaperCrop={loadPaperCrop}
    />
  );
  return { ...utils, loadPaperCrop };
}

describe('PublishedScoreReview handwritten paper answers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to handwriting: shows the crop and hides the transcript', async () => {
    const { loadPaperCrop } = renderReview({});
    const img = await screen.findByRole('img', {
      name: 'Your handwritten answer, question 1',
    });
    expect(img).toHaveAttribute('src', 'data:image/webp;base64,AAAA');
    expect(loadPaperCrop).toHaveBeenCalledWith({
      sessionId: 'session-1',
      responseKey: 'student-1',
      questionId: 'q1',
    });
    expect(screen.queryByText('Plants make sugar')).not.toBeInTheDocument();
  });

  it('typed mode shows the transcript and never requests the crop', () => {
    const { loadPaperCrop } = renderReview({ mode: 'typed' });
    expect(screen.getByText('Plants make sugar')).toBeInTheDocument();
    expect(screen.queryByText('Your handwriting')).not.toBeInTheDocument();
    expect(loadPaperCrop).not.toHaveBeenCalled();
  });

  it('both mode shows the crop and the transcript', async () => {
    renderReview({ mode: 'both' });
    expect(screen.getByText('Plants make sugar')).toBeInTheDocument();
    expect(
      await screen.findByRole('img', {
        name: 'Your handwritten answer, question 1',
      })
    ).toBeInTheDocument();
  });

  it('score-only shows no answer and never requests the crop', () => {
    const { loadPaperCrop } = renderReview({ visibility: 'score-only' });
    expect(screen.queryByText('Your handwriting')).not.toBeInTheDocument();
    expect(screen.queryByText('Plants make sugar')).not.toBeInTheDocument();
    expect(loadPaperCrop).not.toHaveBeenCalled();
  });

  it('lists highlight comments beneath the crop in handwriting mode', async () => {
    renderReview({
      grade: {
        pointsAwarded: 3,
        gradedBy: 't',
        gradedAt: 0,
        gradingSnapshot: '<p>Plants make sugar</p>',
        annotations: [
          {
            id: 'a1',
            from: 0,
            to: 6,
            highlightColor: 'green',
            comment: 'Strong opening',
            rubricCriteria: [{ criterionId: 'c1', name: 'Claim' }],
            authorUid: 't',
            createdAt: 0,
          },
          {
            id: 'a2',
            from: 7,
            to: 11,
            authorUid: 't',
            createdAt: 0,
          },
        ],
      },
    });
    const comments = screen.getByRole('region', { name: 'Teacher comments' });
    expect(comments).toHaveTextContent('Strong opening');
    expect(comments).toHaveTextContent('Claim');
    expect(comments.querySelectorAll('li')).toHaveLength(1);
    expect(document.querySelector('mark')).toBeNull();
    await screen.findByRole('img');
  });

  it('shows a transcribing label while the transcript is pending', () => {
    renderReview({
      mode: 'typed',
      answer: paperAnswer({ answer: '', paperTranscript: 'pending' }),
    });
    expect(screen.getByText('Transcribing')).toBeInTheDocument();
    expect(screen.queryByText('— no response')).not.toBeInTheDocument();
  });

  it('shows a blank label for a blank box', () => {
    renderReview({
      mode: 'both',
      answer: paperAnswer({ answer: '', paperTranscript: 'blank' }),
    });
    expect(screen.getByText('Blank')).toBeInTheDocument();
  });

  it('labels a missing crop instead of requesting it', () => {
    const { loadPaperCrop } = renderReview({
      answer: paperAnswer({ artifacts: [] }),
    });
    expect(screen.getByText('Handwriting unavailable')).toBeInTheDocument();
    expect(loadPaperCrop).not.toHaveBeenCalled();
  });

  it('labels a crop the server will not serve', async () => {
    renderReview({
      loadPaperCrop: () =>
        Promise.resolve({ status: 'not-available', reason: 'deleted' }),
    });
    await waitFor(() =>
      expect(screen.getByText('Handwriting unavailable')).toBeInTheDocument()
    );
    expect(
      screen.queryByRole('button', { name: 'Try again' })
    ).not.toBeInTheDocument();
  });

  it('leaves typed online answers unchanged', () => {
    const { loadPaperCrop } = renderReview({
      answer: {
        questionId: 'q1',
        answer: '<p>Typed online</p>',
        answeredAt: 0,
      },
    });
    expect(screen.getByText('Typed online')).toBeInTheDocument();
    expect(screen.queryByText('Your handwriting')).not.toBeInTheDocument();
    expect(loadPaperCrop).not.toHaveBeenCalled();
  });
});
