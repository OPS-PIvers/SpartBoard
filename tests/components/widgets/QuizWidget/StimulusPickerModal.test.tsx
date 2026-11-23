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
    render(<QuestionStimulusSection state={state} questionId="q1" metaList />);
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
    expect(within(dialog).getByText('Text 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Text 2')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Volcanoes form where plates meet.')
    ).toBeInTheDocument();
  });

  it('attaches from the row check and from the preview', async () => {
    const state = makeState();
    render(<QuestionStimulusSection state={state} questionId="q1" metaList />);
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Text 1' })
    );
    expect(state.toggleStimulusOnQuestion).toHaveBeenLastCalledWith('e1', 'q1');
    await userEvent.click(
      within(dialog).getByText('Volcanoes form where plates meet.')
    );
    expect(
      within(dialog).getByTestId('attach-stimulus-preview')
    ).toHaveTextContent('plates meet');
  });

  it('edits empty text in place', async () => {
    const state = {
      ...makeState(),
      updateStimulus: vi.fn(),
    } as unknown as QuizEditorController;
    render(<QuestionStimulusSection state={state} questionId="q1" metaList />);
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    await userEvent.click(screen.getByText('Text 2'));
    const box = screen.getByRole('textbox', { name: 'Text' });
    await userEvent.type(box, 'A');
    expect(state.updateStimulus).toHaveBeenLastCalledWith('e2', { text: 'A' });
  });

  it('sets word bank columns in place', async () => {
    const state = {
      ...makeState(),
      updateStimulus: vi.fn(),
    } as unknown as QuizEditorController;
    render(<QuestionStimulusSection state={state} questionId="q1" metaList />);
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    expect(screen.getByRole('textbox', { name: 'Word bank' })).toHaveValue(
      'mitosis\nmeiosis'
    );
    const group = screen.getByRole('radiogroup', { name: 'Columns' });
    await userEvent.click(within(group).getByRole('radio', { name: '2' }));
    expect(state.updateStimulus).toHaveBeenCalledWith('w1', {
      wordBankColumns: 2,
    });
  });

  it('adds text or a word bank from Add a stimulus', async () => {
    const state = {
      ...makeState(),
      addStimulus: vi.fn(),
    } as unknown as QuizEditorController;
    const { unmount } = render(
      <QuestionStimulusSection state={state} questionId="q1" metaList />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a stimulus' })
    );
    expect(screen.queryByRole('button', { name: 'Word bank' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(state.addStimulus).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'text' })
    );
    expect(state.toggleStimulusOnQuestion).toHaveBeenLastCalledWith(
      vi.mocked(state.addStimulus).mock.calls[0][0].id,
      'q1'
    );
    unmount();
    render(
      <QuestionStimulusSection
        state={state}
        questionId="q1"
        metaList
        wordBankAvailable
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a stimulus' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Word bank' }));
    expect(state.addStimulus).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'word-bank' })
    );
  });

  it('closes back to the question with Back to quiz', async () => {
    render(
      <QuestionStimulusSection state={makeState()} questionId="q1" metaList />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back to quiz' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stimuli' })).toBeInTheDocument();
  });

  it('shows Back to quiz in place of the close X', async () => {
    render(
      <QuestionStimulusSection state={makeState()} questionId="q1" metaList />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    expect(
      screen.queryByRole('button', { name: 'Close' })
    ).not.toBeInTheDocument();
  });

  it('shows the On paper switch only when paper tests are on, and saves a pick', async () => {
    const state = {
      ...makeState(),
      updateStimulus: vi.fn(),
    } as unknown as QuizEditorController;
    const { unmount } = render(
      <QuestionStimulusSection state={state} questionId="q1" metaList />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    expect(screen.queryByRole('radiogroup', { name: 'On paper' })).toBeNull();
    unmount();
    render(
      <QuestionStimulusSection
        state={state}
        questionId="q1"
        metaList
        paperPlacement
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    const group = screen.getByRole('radiogroup', { name: 'On paper' });
    // Used by one question, so it starts with the question.
    expect(
      within(group).getByRole('radio', { name: 'With the question' })
    ).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(
      within(group).getByRole('radio', { name: 'Resource page' })
    );
    expect(state.updateStimulus).toHaveBeenCalledWith('w1', {
      paperPlacement: 'resource',
    });
  });
});
