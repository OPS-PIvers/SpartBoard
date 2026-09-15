// PR4 round-2: a FIB row missing its translated answer key can't be marked reviewed.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuestionTranslation, QuizData, QuizMetadata } from '@/types';
import { QuizLanguagesContextPane } from './QuizLanguagesPane';
import type { UseQuizTranslations } from '@/hooks/useQuizTranslations';

vi.mock('@/hooks/useQuizTranslationSettings', async () => {
  const { QUIZ_TRANSLATION_LANGUAGES } =
    await import('@/config/quizTranslation');
  return {
    useQuizTranslationSettings: () => ({
      settings: { enabledLanguages: ['es'] },
      languages: QUIZ_TRANSLATION_LANGUAGES,
    }),
  };
});

const quiz = {
  id: 'quiz-1',
  title: 'Numbers',
  questions: [
    {
      id: 'q2',
      type: 'FIB',
      text: 'The capital of France is ____.',
      correctAnswer: 'Paris',
      incorrectAnswers: [],
      timeLimit: 0,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
} as unknown as QuizData;

const api = (entry: QuestionTranslation): UseQuizTranslations =>
  ({
    translatableIds: ['q2'],
    byLocale: {
      es: {
        locale: 'es',
        title: 'Números',
        questions: { q2: entry },
        sourceHashes: { q2: 'h' },
        reviewedQuestionIds: [],
        model: 'm',
        generatedAt: 1,
        updatedAt: 1,
      },
    },
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
  }) as unknown as UseQuizTranslations;

const renderPane = (entry: QuestionTranslation) =>
  render(
    <QuizLanguagesContextPane
      quiz={quiz}
      metadata={{ id: 'quiz-1' } as QuizMetadata}
      api={api(entry)}
      selectedLocale="es"
      onSelectLocale={vi.fn()}
      selectedQuestionId="q2"
      onSelectQuestion={vi.fn()}
    />
  );

describe('QuizLanguagesContextPane — FIB publish gate', () => {
  it('blocks the Reviewed toggle when the answer key is blank', () => {
    renderPane({ text: 'La capital de Francia es ____.' });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      /translated accepted answer/i
    );
  });

  it('blocks the Reviewed toggle when a blank went missing', () => {
    renderPane({ text: 'La capital de Francia es París.', answer: 'París' });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/same number/i);
  });

  it('allows the toggle once the answer and blanks are present', () => {
    renderPane({ text: 'La capital de Francia es ____.', answer: 'París' });
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
