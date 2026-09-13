import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';

// EditorModalShell calls these hooks unconditionally.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

const { requestBackTranslation } = vi.hoisted(() => ({
  requestBackTranslation: vi.fn(),
}));
vi.mock('@/utils/backTranslationService', () => ({ requestBackTranslation }));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { backTranslationCacheKey } from '@/utils/backTranslationHash';
import type {
  QuizData,
  QuizQuestionType,
  QuizResponse,
  QuizResponseBackTranslation,
} from '@/types';

const quizWith = (type: QuizQuestionType): QuizData => ({
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type,
      text: 'Explica tu razonamiento.',
      timeLimit: 0,
      correctAnswer: type === 'FIB' ? 'agua' : '',
      incorrectAnswers: [],
      points: 10,
    },
  ],
});

const responseFor = (
  answer: string,
  locale?: string,
  backTranslations?: Record<string, QuizResponseBackTranslation>
): QuizResponse =>
  ({
    studentUid: 'uid-a',
    _responseKey: 'uid-a',
    pin: '1234',
    answers: [
      {
        questionId: 'q1',
        answer,
        answeredAt: 0,
        ...(locale ? { locale } : {}),
      },
    ],
    status: 'completed',
    joinedAt: 0,
    submittedAt: 0,
    score: 0,
    tabSwitchWarnings: 0,
    completedAttempts: 1,
    backTranslations,
  }) as unknown as QuizResponse;

const renderGrader = (
  quiz: QuizData,
  response: QuizResponse,
  onSaveBackTranslation = vi
    .fn<
      (
        rk: string,
        hash: string,
        entry: QuizResponseBackTranslation
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined)
) => {
  render(
    <FreeResponseGrader
      quiz={quiz}
      responses={[response]}
      teacherUid="teacher-1"
      onSaveGrade={vi.fn().mockResolvedValue(undefined)}
      onSaveBackTranslation={onSaveBackTranslation}
      onClose={vi.fn()}
    />
  );
  return onSaveBackTranslation;
};

const button = () =>
  screen.getByRole('button', { name: /translate this response/i });

describe('FreeResponseGrader — back-translation', () => {
  beforeEach(() => {
    requestBackTranslation.mockReset();
  });

  it('is hidden for an English answer, a locale-less answer and a FIB question', () => {
    const { unmount } = render(
      <FreeResponseGrader
        quiz={quizWith('free-response')}
        responses={[responseFor('<p>water</p>', 'en')]}
        teacherUid="t"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onSaveBackTranslation={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /translate this response/i })
    ).toBeNull();
    unmount();

    const noLocale = render(
      <FreeResponseGrader
        quiz={quizWith('free-response')}
        responses={[responseFor('<p>water</p>')]}
        teacherUid="t"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onSaveBackTranslation={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /translate this response/i })
    ).toBeNull();
    noLocale.unmount();

    // FIB is never translated (plan D21) and never enters the grading queue.
    render(
      <FreeResponseGrader
        quiz={quizWith('FIB')}
        responses={[responseFor('<p>agua</p>', 'es')]}
        teacherUid="t"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onSaveBackTranslation={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /translate this response/i })
    ).toBeNull();
  });

  it('calls the callable once and caches the result through the teacher write path', async () => {
    requestBackTranslation.mockResolvedValue({
      text: 'The water evaporates.',
      model: 'gemini-3.5-flash-lite',
    });
    const onSave = renderGrader(
      quizWith('free-response'),
      responseFor('El agua se evapora.', 'es')
    );
    fireEvent.click(button());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(requestBackTranslation).toHaveBeenCalledWith(
      'El agua se evapora.',
      'es'
    );
    const [responseKey, hash, entry] = onSave.mock.calls[0];
    expect(responseKey).toBe('uid-a');
    expect(hash).toBe(
      await backTranslationCacheKey('El agua se evapora.', 'es')
    );
    expect(entry).toMatchObject({
      text: 'The water evaporates.',
      locale: 'es',
      model: 'gemini-3.5-flash-lite',
    });
    expect(typeof entry.at).toBe('number');
    expect(await screen.findByText('The water evaporates.')).toBeTruthy();
  });

  it('skips the callable on a cache hit', async () => {
    const text = 'El agua se evapora.';
    const hash = await backTranslationCacheKey(text, 'es');
    const onSave = renderGrader(
      quizWith('free-response'),
      responseFor(text, 'es', {
        [hash]: {
          text: 'Cached English.',
          locale: 'es',
          model: 'm',
          at: 1,
        },
      })
    );
    fireEvent.click(button());

    expect(await screen.findByText('Cached English.')).toBeTruthy();
    expect(requestBackTranslation).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('re-translates when the answer text changes the hash', async () => {
    const cachedText = 'El agua se evapora.';
    const hash = await backTranslationCacheKey(cachedText, 'es');
    const cache = {
      [hash]: { text: 'Cached English.', locale: 'es', model: 'm', at: 1 },
    };
    requestBackTranslation.mockResolvedValue({
      text: 'The water evaporates quickly.',
      model: 'm2',
    });
    const edited = 'El agua se evapora rapidamente.';
    const onSave = renderGrader(
      quizWith('free-response'),
      responseFor(edited, 'es', cache)
    );
    fireEvent.click(button());

    await waitFor(() =>
      expect(requestBackTranslation).toHaveBeenCalledTimes(1)
    );
    const [, newHash] = onSave.mock.calls[0];
    expect(newHash).not.toBe(hash);
    expect(newHash).toBe(await backTranslationCacheKey(edited, 'es'));
  });

  it('surfaces the daily-cap message on resource-exhausted', async () => {
    requestBackTranslation.mockRejectedValue(
      Object.assign(new Error('nope'), {
        code: 'functions/resource-exhausted',
      })
    );
    renderGrader(quizWith('free-response'), responseFor('El agua.', 'es'));
    fireEvent.click(button());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/daily translation limit/i);
  });

  it('shows an inline error on any other callable failure', async () => {
    requestBackTranslation.mockRejectedValue(new Error('boom'));
    renderGrader(quizWith('free-response'), responseFor('El agua.', 'es'));
    fireEvent.click(button());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/couldn't translate/i);
  });
});
