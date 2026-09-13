// The Languages tab offers only the admin-curated languages, and its served
// counter is stated over the translatable subset (D21 + plan §5).

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QuizData, QuizMetadata } from '@/types';
import { QuizLanguagesContextPane } from './QuizLanguagesPane';
import type { UseQuizTranslations } from '@/hooks/useQuizTranslations';

const { enabledCodes } = vi.hoisted(() => ({
  enabledCodes: { current: ['es', 'so', 'hmn'] as string[] },
}));

vi.mock('@/hooks/useQuizTranslationSettings', async () => {
  const { QUIZ_TRANSLATION_LANGUAGES } =
    await import('@/config/quizTranslation');
  return {
    useQuizTranslationSettings: () => ({
      settings: { enabledLanguages: enabledCodes.current },
      languages: QUIZ_TRANSLATION_LANGUAGES.filter((l) =>
        enabledCodes.current.includes(l.code)
      ),
    }),
  };
});

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Numbers',
  questions: [
    {
      id: 'q1',
      type: 'MC',
      text: 'Which is prime?',
      correctAnswer: 'Seven',
      incorrectAnswers: ['Eight'],
      timeLimit: 0,
    },
    {
      id: 'q2',
      type: 'FIB',
      text: 'The capital is ___.',
      correctAnswer: 'Paris',
      timeLimit: 0,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
} as QuizData;

const metadata = {
  id: 'quiz-1',
  title: 'Numbers',
  driveFileId: 'drive-quiz',
  questionCount: 2,
  createdAt: 1,
  updatedAt: 1,
  translations: {
    es: {
      driveFileId: 'file-es',
      reviewedCount: 1,
      staleCount: 0,
      questionCount: 1,
      sourceHashes: { q1: 'h1' },
      updatedAt: 1,
    },
  },
} as QuizMetadata;

const api = (): UseQuizTranslations => ({
  translatableIds: ['q1'],
  byLocale: {},
  loading: {},
  load: vi.fn(),
  generate: vi.fn(),
  editQuestion: vi.fn(),
  setReviewed: vi.fn(),
  save: vi.fn(),
  saveAll: vi.fn(() => Promise.resolve()),
  hasUnsavedChanges: false,
  staleIds: () => [],
  cap: null,
  error: null,
  loadFailed: {},
  needsLoad: () => false,
});

const renderPane = () =>
  render(
    <QuizLanguagesContextPane
      quiz={quiz}
      metadata={metadata}
      api={api()}
      selectedLocale={null}
      onSelectLocale={vi.fn()}
      selectedQuestionId={null}
      onSelectQuestion={vi.fn()}
    />
  );

describe('QuizLanguagesContextPane curated languages', () => {
  it('offers every curated language when the admin enabled all of them', () => {
    enabledCodes.current = ['es', 'so', 'hmn'];
    renderPane();
    expect(screen.getByRole('button', { name: /Español/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Soomaali/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hmoob/ })).toBeInTheDocument();
  });

  it('hides a language the admin disabled', () => {
    enabledCodes.current = ['es'];
    renderPane();
    expect(screen.getByRole('button', { name: /Español/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Soomaali/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Hmoob/ })
    ).not.toBeInTheDocument();
  });

  it('keeps a disabled language whose sidecar already exists so it stays reviewable', () => {
    enabledCodes.current = ['so'];
    renderPane();
    expect(screen.getByRole('button', { name: /Español/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Soomaali/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Hmoob/ })
    ).not.toBeInTheDocument();
  });

  it('counts the served questions over the translatable subset (1 of 1, not 1 of 2)', () => {
    enabledCodes.current = ['es'];
    renderPane();
    expect(screen.getByText(/1 of 1/)).toBeInTheDocument();
  });
});
