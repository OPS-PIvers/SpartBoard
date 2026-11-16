import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('attach list preview', () => {
  it('names attached stimuli in the collapsed header and previews a passage', async () => {
    render(
      <QuestionStimulusSection state={state} questionId="q1" previewAvailable />
    );
    const header = screen.getByRole('button', { name: /Stimuli/ });
    expect(header).toHaveTextContent(
      'The quick brown fox jumped over the lazy dog.'
    );
    await userEvent.click(header);
    expect(
      screen.queryByRole('button', { name: /^Preview Calculator/ })
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /^Preview The quick brown fox/ })
    );
    expect(screen.getByTestId('attach-stimulus-preview')).toHaveTextContent(
      'lazy dog'
    );
    await userEvent.click(
      screen.getByRole('button', { name: /^Hide The quick brown fox/ })
    );
    expect(
      screen.queryByTestId('attach-stimulus-preview')
    ).not.toBeInTheDocument();
  });

  it('closes the preview when the question changes', async () => {
    const two = {
      ...state,
      questions: [question, { ...question, id: 'q2' }],
    };
    const { rerender } = render(
      <QuestionStimulusSection state={two} questionId="q1" previewAvailable />
    );
    await userEvent.click(screen.getByRole('button', { name: /Stimuli/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /^Preview The quick brown fox/ })
    );
    expect(screen.getByTestId('attach-stimulus-preview')).toBeInTheDocument();
    rerender(
      <QuestionStimulusSection state={two} questionId="q2" previewAvailable />
    );
    expect(
      screen.queryByTestId('attach-stimulus-preview')
    ).not.toBeInTheDocument();
  });

  it('keeps the old count and no preview buttons when the flag is off', async () => {
    render(<QuestionStimulusSection state={state} questionId="q1" />);
    const header = screen.getByRole('button', { name: /Stimuli/ });
    expect(header).toHaveTextContent('1 attached');
    await userEvent.click(header);
    expect(
      screen.queryByRole('button', { name: /^Preview/ })
    ).not.toBeInTheDocument();
  });
});
