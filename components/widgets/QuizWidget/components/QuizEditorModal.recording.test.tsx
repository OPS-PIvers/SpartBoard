/**
 * The Format row (Typed/Spoken) inside the real editor: the fail-closed
 * gate, the advisory banner's separation from the save-error path, the
 * disabled `timeLimit`, dirty tracking for the new block, and the
 * Placeholder/Word limit fields hiding (not clearing) under Spoken.
 *
 * Mocking strategy mirrors QuizEditorModal.isDirty.test.tsx.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@/i18n';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData } from '@/types';

const gate = vi.fn(() => false);

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: vi.fn(() => false),
    canAccessQuizMediaResponse: gate,
  })),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(() => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn(),
  })),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(() => ({ driveService: null, userDomain: undefined })),
}));
vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [],
    loading: false,
    error: null,
    saveRubric: vi.fn().mockResolvedValue(undefined),
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
  }),
}));

vi.mock('@/components/common/EditorWorkspace', () => ({
  EditorWorkspace: vi.fn(
    ({
      isOpen,
      contextPane,
      detailPane,
      isDirty,
    }: {
      isOpen: boolean;
      contextPane: React.ReactNode;
      detailPane: React.ReactNode;
      isDirty: boolean;
    }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="editor-workspace" data-is-dirty={String(isDirty)}>
          <div data-testid="context-pane">{contextPane}</div>
          <div data-testid="detail-pane">{detailPane}</div>
        </div>
      );
    }
  ),
}));

vi.mock('./QuizEditor', async () => {
  const actual =
    await vi.importActual<typeof import('./QuizEditor')>('./QuizEditor');
  return { ...actual, QuizAiOverlay: () => null };
});

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Science Review',
  questions: [
    {
      id: 'q1',
      text: 'What is photosynthesis?',
      type: 'free-response',
      correctAnswer: 'A',
      incorrectAnswers: ['B', 'C', 'D'],
      timeLimit: 30,
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const detail = () => within(screen.getByTestId('detail-pane'));
const context = () => within(screen.getByTestId('context-pane'));
const dirtyAttr = () =>
  screen.getByTestId('editor-workspace').getAttribute('data-is-dirty');
const spokenTab = () => detail().getByRole('radio', { name: 'Spoken' });
const typedTab = () => detail().getByRole('radio', { name: 'Typed' });

const open = () =>
  render(
    <QuizEditorModal isOpen quiz={quiz} onClose={vi.fn()} onSave={vi.fn()} />
  );

beforeEach(() => {
  gate.mockReset();
  gate.mockReturnValue(false);
});

describe('QuizEditorModal Format row', () => {
  it('renders nothing new when the permission record is missing', () => {
    open();
    expect(detail().queryByText('Format')).toBeNull();
    expect(context().queryByText(/Records up to .* per student/)).toBeNull();
    expect(
      detail().getByRole<HTMLInputElement>('spinbutton', { name: 'Time Limit' })
        .disabled
    ).toBe(false);
  });

  it('mounts the row in the question pane when the gate grants', () => {
    gate.mockReturnValue(true);
    open();
    expect(detail().getByText('Format')).toBeTruthy();
    expect(typedTab().getAttribute('aria-checked')).toBe('true');
    expect(spokenTab().getAttribute('aria-checked')).toBe('false');
  });

  it('choosing Spoken flips dirty, disables Time Limit, advises, and hides Placeholder/Word limit', () => {
    gate.mockReturnValue(true);
    open();
    expect(dirtyAttr()).toBe('false');
    expect(
      detail().getByPlaceholderText(
        'e.g. Cite at least two pieces of evidence.'
      )
    ).toBeTruthy();
    expect(detail().getByLabelText('Maximum words')).toBeTruthy();

    fireEvent.click(spokenTab());

    expect(dirtyAttr()).toBe('true');
    const timeLimit = detail().getByRole<HTMLInputElement>('spinbutton', {
      name: 'Time Limit',
    });
    expect(timeLimit.disabled).toBe(true);
    expect(timeLimit.value).toBe('0');
    expect(
      detail().getByText(/use their own prep and recording timer/i)
    ).toBeTruthy();
    expect(
      context().getByText('Records up to 1 slot per student.')
    ).toBeTruthy();
    expect(
      detail().queryByPlaceholderText(
        'e.g. Cite at least two pieces of evidence.'
      )
    ).toBeNull();
    expect(detail().queryByLabelText('Maximum words')).toBeNull();
  });

  it('switching back to Typed leaves the quiz clean again', () => {
    gate.mockReturnValue(true);
    open();
    fireEvent.click(spokenTab());
    fireEvent.click(typedTab());

    expect(context().queryByText(/Records up to/)).toBeNull();
    expect(detail().getByText('Format')).toBeTruthy();
    const timeLimit = detail().getByRole<HTMLInputElement>('spinbutton', {
      name: 'Time Limit',
    });
    expect(timeLimit.disabled).toBe(false);
    // The teacher's clock comes back, so nothing is left to save.
    expect(timeLimit.value).toBe('30');
    expect(dirtyAttr()).toBe('false');
  });

  it('restores the Placeholder value intact after a round trip through Spoken', () => {
    gate.mockReturnValue(true);
    open();
    fireEvent.change(
      detail().getByPlaceholderText(
        'e.g. Cite at least two pieces of evidence.'
      ),
      { target: { value: 'Cite your source' } }
    );
    fireEvent.click(spokenTab());
    fireEvent.click(typedTab());

    expect(
      detail().getByPlaceholderText<HTMLInputElement>(
        'e.g. Cite at least two pieces of evidence.'
      ).value
    ).toBe('Cite your source');
  });

  it('does not render the Format row on a choice question', () => {
    gate.mockReturnValue(true);
    render(
      <QuizEditorModal
        isOpen
        quiz={{
          ...quiz,
          questions: [{ ...quiz.questions[0], type: 'MC' }],
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(detail().queryByText('Format')).toBeNull();
  });

  it('keeps the advisory out of the save-error banner', () => {
    gate.mockReturnValue(true);
    open();
    fireEvent.click(spokenTab());
    const advisory = context()
      .getByText('As authored')
      .closest('[role="status"]') as HTMLElement;
    expect(advisory).toBeTruthy();
    expect(advisory.className).not.toMatch(/brand-red/);
  });
});
