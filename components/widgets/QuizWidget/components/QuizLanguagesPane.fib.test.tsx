// PR4: a FIB question is reviewable in the Languages pane, answer key included.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { QuizData, QuizMetadata } from '@/types';
import { QuizLanguagesDetailPane } from './QuizLanguagesPane';
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

const editQuestion = vi.fn();

const api = (): UseQuizTranslations =>
  ({
    translatableIds: ['q2'],
    byLocale: {
      es: {
        locale: 'es',
        title: 'Números',
        questions: {
          q2: { text: 'La capital de Francia es ____.', answer: 'París' },
        },
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
    editQuestion,
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

const renderPane = () =>
  render(
    <QuizLanguagesDetailPane
      quiz={quiz}
      metadata={{ id: 'quiz-1' } as QuizMetadata}
      api={api()}
      selectedLocale="es"
      onSelectLocale={vi.fn()}
      selectedQuestionId="q2"
      onSelectQuestion={vi.fn()}
    />
  );

describe('QuizLanguagesDetailPane — FIB', () => {
  it('shows the translated stem and the translated accepted answer', () => {
    renderPane();
    expect(
      screen.getByDisplayValue('La capital de Francia es ____.')
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('París')).toBeInTheDocument();
    expect(screen.getByText('Paris')).toBeInTheDocument();
  });

  it('edits the accepted answer through the translation api', async () => {
    renderPane();
    await userEvent.type(screen.getByDisplayValue('París'), '!');
    expect(editQuestion).toHaveBeenLastCalledWith('es', 'q2', {
      answer: 'París!',
    });
  });
});
