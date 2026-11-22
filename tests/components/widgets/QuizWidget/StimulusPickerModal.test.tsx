import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    id: 'p1',
    type: 'text',
    url: '',
    label: '',
    text: 'Volcanoes form where plates meet.',
  },
  {
    id: 'w1',
    type: 'word-bank',
    url: '',
    label: 'Word bank',
    text: 'mitosis\nmeiosis',
  },
  { id: 'e1', type: 'text', url: '', label: 'Passage', text: '' },
  { id: 'e2', type: 'text', url: '', label: 'Passage', text: '' },
];

const question: QuizQuestion = {
  id: 'q1',
  timeLimit: 0,
  text: 'Q',
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  stimulusIds: ['w1'],
};

const makeState = () =>
  ({
    questions: [question],
    bankSlots: [],
    stimuli,
    toggleStimulusOnQuestion: vi.fn(),
  }) as unknown as QuizEditorController;

describe('stimulus picker dialog', () => {
  it('opens on the attached stimulus and names every row', async () => {
    const state = makeState();
    render(
      <QuestionStimulusSection
        state={state}
        questionId="q1"
        metaList
        pickerModal
      />
    );
    const row = screen.getByRole('button', { name: 'Stimuli' });
    expect(row).toHaveTextContent('mitosis, meiosis');
    expect(row).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(row);
    const dialog = screen.getByRole('dialog', {
      name: 'Stimuli for this question',
    });
    expect(
      within(dialog).getByRole('heading', { name: 'mitosis, meiosis' })
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Passage 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Passage 2')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Volcanoes form where plates meet.')
    ).toBeInTheDocument();
  });

  it('attaches from the row check and from the preview', async () => {
    const state = makeState();
    render(
      <QuestionStimulusSection
        state={state}
        questionId="q1"
        metaList
        pickerModal
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Passage 1' })
    );
    expect(state.toggleStimulusOnQuestion).toHaveBeenLastCalledWith('e1', 'q1');
    await userEvent.click(
      within(dialog).getByText('Volcanoes form where plates meet.')
    );
    expect(
      within(dialog).getByTestId('attach-stimulus-preview')
    ).toHaveTextContent('plates meet');
  });

  it('shows an empty passage without a preview', async () => {
    render(
      <QuestionStimulusSection
        state={makeState()}
        questionId="q1"
        metaList
        pickerModal
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    await userEvent.click(screen.getByText('Passage 2'));
    expect(screen.getByText('This passage is empty.')).toBeInTheDocument();
  });

  it('closes back to the question with Return', async () => {
    render(
      <QuestionStimulusSection
        state={makeState()}
        questionId="q1"
        metaList
        pickerModal
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    await userEvent.click(screen.getByRole('button', { name: 'Return' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stimuli' })).toBeInTheDocument();
  });

  it('shows Return in place of the close X', async () => {
    render(
      <QuestionStimulusSection
        state={makeState()}
        questionId="q1"
        metaList
        pickerModal
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    expect(
      screen.queryByRole('button', { name: 'Close' })
    ).not.toBeInTheDocument();
  });
});
