/** Whiteboard response format in the real editor: both flags gate it; settings round-trip. */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@/i18n';

import { QuizEditorModal } from './QuizEditorModal';
import type { QuizData, QuizQuestion } from '@/types';
import { DEFAULT_RECORDING_CONFIG } from '@/config/quizRecordingDefaults';

const gate = vi.fn(() => false);
const featureGate = vi.fn((_id: string) => false);

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: featureGate,
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

const typed: QuizQuestion = {
  id: 'q1',
  text: 'Show how you found the area.',
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 30,
};

const whiteboard: QuizQuestion = {
  ...typed,
  timeLimit: 0,
  recording: {
    ...DEFAULT_RECORDING_CONFIG,
    mode: 'whiteboard',
    explainAloud: false,
    limitSeconds: 200,
    startingPage: {
      pattern: {
        kind: 'coordinate-plane',
        xMin: -5,
        xMax: 5,
        yMin: 0,
        yMax: 8,
      },
    },
  },
};

const quizWith = (q: QuizQuestion): QuizData => ({
  id: 'quiz-1',
  title: 'Geometry',
  questions: [q],
  createdAt: 1000,
  updatedAt: 2000,
});

const detail = () => within(screen.getByTestId('detail-pane'));
const dirtyAttr = () =>
  screen.getByTestId('editor-workspace').getAttribute('data-is-dirty');

const open = (q: QuizQuestion) =>
  render(
    <QuizEditorModal
      isOpen
      quiz={quizWith(q)}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />
  );

beforeEach(() => {
  gate.mockReset();
  gate.mockReturnValue(true);
  featureGate.mockReset();
  featureGate.mockImplementation(
    (id: string) => id === 'quiz-whiteboard-response'
  );
});

describe('QuizEditorModal whiteboard format', () => {
  it('keeps the Typed/Spoken buttons and no Whiteboard choice when the flag is off', () => {
    featureGate.mockReturnValue(false);
    open(typed);
    expect(detail().getByRole('radio', { name: 'Typed' })).toBeTruthy();
    expect(detail().queryByText('Whiteboard')).toBeNull();
    expect(detail().queryByRole('combobox', { name: 'Format' })).toBeNull();
  });

  it('shows a saved whiteboard question as Spoken with no whiteboard settings when the flag is off', () => {
    featureGate.mockReturnValue(false);
    open(whiteboard);
    expect(
      detail()
        .getByRole('radio', { name: 'Spoken' })
        .getAttribute('aria-checked')
    ).toBe('true');
    expect(detail().queryByText('Starting page')).toBeNull();
    expect(detail().queryByText('Students explain out loud')).toBeNull();
  });

  it('needs the spoken answers flag too', () => {
    gate.mockReturnValue(false);
    open(typed);
    expect(detail().queryByText('Format')).toBeNull();
    expect(detail().queryByText('Whiteboard')).toBeNull();
  });

  it('choosing Whiteboard writes a blank page, the 180s limit and explain out loud on', () => {
    open(typed);
    fireEvent.change(detail().getByRole('combobox', { name: 'Format' }), {
      target: { value: 'whiteboard' },
    });
    expect(dirtyAttr()).toBe('true');
    expect(
      detail().getByRole<HTMLSelectElement>('combobox', {
        name: 'Starting page',
      }).value
    ).toBe('blank');
    expect(
      detail().getByRole<HTMLInputElement>('spinbutton', {
        name: 'Recording limit',
      }).value
    ).toBe('180');
    expect(
      detail()
        .getByRole('switch', { name: 'Students explain out loud' })
        .getAttribute('aria-checked')
    ).toBe('true');
  });

  it('reopens a saved whiteboard question with its settings intact', () => {
    open(whiteboard);
    expect(
      detail().getByRole<HTMLSelectElement>('combobox', { name: 'Format' })
        .value
    ).toBe('whiteboard');
    expect(
      detail().getByRole<HTMLSelectElement>('combobox', {
        name: 'Starting page',
      }).value
    ).toBe('coordinate-plane');
    expect(detail().getByLabelText<HTMLInputElement>('X from').value).toBe(
      '-5'
    );
    expect(detail().getByLabelText<HTMLInputElement>('Y to').value).toBe('8');
    expect(
      detail()
        .getByRole('switch', { name: 'Students explain out loud' })
        .getAttribute('aria-checked')
    ).toBe('false');
    expect(
      detail().getByRole<HTMLInputElement>('spinbutton', {
        name: 'Recording limit',
      }).value
    ).toBe('200');
    expect(dirtyAttr()).toBe('false');
  });

  it('switching a whiteboard question to Spoken drops the whiteboard settings', () => {
    open(whiteboard);
    fireEvent.change(detail().getByRole('combobox', { name: 'Format' }), {
      target: { value: 'spoken' },
    });
    expect(detail().queryByText('Starting page')).toBeNull();
    expect(detail().queryByText('Students explain out loud')).toBeNull();
  });
});
