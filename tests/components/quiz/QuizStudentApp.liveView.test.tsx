import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { QuizData, QuizResponse } from '@/types';
import { ActiveQuiz } from '@/components/quiz/QuizStudentApp';
import { buildStudentViewSession } from '@/utils/quizStudentViewSession';

const mc = (id: string, text: string) => ({
  id,
  type: 'MC',
  text,
  timeLimit: 0,
  correctAnswer: 'Right',
  incorrectAnswers: ['Wrong'],
});

const SESSION = buildStudentViewSession(
  {
    id: 'quiz-1',
    title: 'Cells',
    questions: [
      mc('q1', 'First question?'),
      mc('q2', 'Second question?'),
      {
        id: 'q3',
        type: 'FIB',
        text: 'Third question?',
        timeLimit: 0,
        correctAnswer: 'nucleus',
        incorrectAnswers: [],
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as QuizData,
  {
    sessionMode: 'student',
    sessionOptions: { tabWarningsEnabled: false },
    attemptLimit: 1,
  },
  false
);

const response = (extra: Partial<QuizResponse> = {}): QuizResponse => ({
  studentUid: 'student-1',
  joinedAt: 1,
  status: 'in-progress',
  answers: [],
  score: null,
  submittedAt: null,
  completedAttempts: 0,
  ...extra,
});

const noop = () => Promise.resolve();

const renderQuiz = (
  myResponse: QuizResponse,
  extra: Partial<React.ComponentProps<typeof ActiveQuiz>> = {}
) => (
  <ActiveQuiz
    session={SESSION}
    currentQuestion={undefined}
    alreadyAnswered={false}
    myResponse={myResponse}
    onAnswer={noop}
    onCommitRecording={noop}
    onRetryRecordingUpload={noop}
    canRetryRecordingUpload={() => false}
    onMarkUnresponded={noop}
    noticeAckedAt={0}
    onAcknowledgeNotice={() => undefined}
    noticeRequired={false}
    onComplete={noop}
    reportTabSwitch={() => Promise.resolve(0)}
    onSetHandRaised={noop}
    handRaised={false}
    warningCount={0}
    onRecordStimulusPlay={noop}
    onReportStimulusError={noop}
    {...extra}
  />
);

describe('ActiveQuiz as the teacher’s Live view mirror', () => {
  it('follows the watched question and shows the saved draft as it changes', async () => {
    const { rerender } = render(
      renderQuiz(response(), { watchQuestionId: 'q2' })
    );
    await screen.findByText('Second question?');

    rerender(
      renderQuiz(
        response({
          answers: [
            {
              questionId: 'q3',
              answer: 'nucl',
              answeredAt: 5,
              status: 'draft',
            },
          ],
        }),
        { watchQuestionId: 'q3' }
      )
    );
    await screen.findByText('Third question?');
    await waitFor(() => expect(screen.getByDisplayValue('nucl')).toBeTruthy());

    rerender(
      renderQuiz(
        response({
          answers: [
            {
              questionId: 'q3',
              answer: 'nucleus',
              answeredAt: 6,
              status: 'draft',
            },
          ],
        }),
        { watchQuestionId: 'q3' }
      )
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue('nucleus')).toBeTruthy()
    );
  });
});

describe('ActiveQuiz on a watched student’s device', () => {
  it('reports the question on screen only while the stamp is ahead', async () => {
    const report = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      renderQuiz(response(), { onReportLivePosition: report })
    );
    await screen.findByText('First question?');
    expect(report).not.toHaveBeenCalled();

    rerender(
      renderQuiz(
        response({ liveView: { until: Date.now() + 60_000, notify: true } }),
        { onReportLivePosition: report }
      )
    );
    await waitFor(() =>
      expect(report).toHaveBeenCalledWith('q1', expect.any(Number))
    );
    expect(screen.getByText('Your teacher is viewing your quiz')).toBeTruthy();

    report.mockClear();
    rerender(
      renderQuiz(
        response({ liveView: { until: Date.now() - 1, notify: false } }),
        {
          onReportLivePosition: report,
        }
      )
    );
    await screen.findByText('First question?');
    expect(report).not.toHaveBeenCalled();
  });
});
