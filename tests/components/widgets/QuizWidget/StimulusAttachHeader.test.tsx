import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { QuizQuestion, QuizStimulus } from '@/types';
import type { QuizEditorController } from '@/components/widgets/QuizWidget/components/useQuizEditorState';

vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null, userDomain: null }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn() }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(), showAlert: vi.fn() }),
}));

import { QuestionStimulusSection } from '@/components/widgets/QuizWidget/components/StimulusManagerPanel';

const stimuli: QuizStimulus[] = [
  {
    id: 's1',
    type: 'text',
    url: '',
    label: '',
    text: 'The quick brown fox jumped over the lazy dog.',
  },
  { id: 's2', type: 'calculator', url: '', label: '', calculator: 'graphing' },
];

const question: QuizQuestion = {
  id: 'q1',
  timeLimit: 0,
  text: 'Q',
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  stimulusIds: ['s1'],
};

const state = {
  questions: [question],
  bankSlots: [],
  stimuli,
  toggleStimulusOnQuestion: vi.fn(),
} as unknown as QuizEditorController;

describe('attach section header', () => {
  it('names attached stimuli in the collapsed header', () => {
    render(<QuestionStimulusSection state={state} questionId="q1" />);
    expect(screen.getByRole('button', { name: /Stimuli/ })).toHaveTextContent(
      'The quick brown fox jumped over the lazy dog.'
    );
  });
});
