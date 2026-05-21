/**
 * Tests for QuizEditorModal — Task 7: Questions/Settings tab.
 *
 * Key assertions:
 *   - Editor renders a "Questions" and a "Settings" toggle in the chrome.
 *   - Switching to "Settings" renders the QuizBehaviorSettingsPanel
 *     (asserted via a mode button being present).
 *   - Switching back to "Questions" renders the question list.
 *   - Editing a behavior control and saving calls onSave with the updated
 *     behavior as the 2nd argument.
 *   - Saving without touching settings calls onSave with DEFAULT_QUIZ_BEHAVIOR
 *     (or the seeded behavior from the `behavior` prop).
 *   - When a `behavior` prop is provided, it seeds the panel.
 *   - Behavior changes flip isDirty (Save button is enabled).
 *
 * Mocking strategy:
 *   - useAuth: returns a stub user without gemini access.
 *   - EditorWorkspace: renders the contextPane + detailPane + a Save button
 *     that calls onSave; accepts isDirty for assertions.
 *   - useQuizEditorState: use real hook (it's pure; no firebase deps).
 *   - QuizEditorContextPane / QuizEditorDetailPane: use real components
 *     but they don't need deep render — EditorWorkspace mock renders contextPane.
 *   - QuizBehaviorSettingsPanel: NOT mocked — we render the real panel
 *     and assert on its output.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import type { QuizBehaviorSettings, QuizData } from '@/types';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'uid-test', displayName: 'Test Teacher' },
    canAccessFeature: vi.fn(() => false),
  })),
}));

// Minimal EditorWorkspace mock: renders both panes + a Save button,
// exposes isDirty via data attribute for assertions.
vi.mock('@/components/common/EditorWorkspace', () => ({
  EditorWorkspace: vi.fn(
    ({
      isOpen,
      contextPane,
      detailPane,
      onSave,
      onClose,
      isDirty,
    }: {
      isOpen: boolean;
      contextPane: React.ReactNode;
      detailPane: React.ReactNode;
      onSave: () => void;
      onClose: () => void;
      isDirty: boolean;
    }) => {
      if (!isOpen) return null;
      return (
        <div data-testid="editor-workspace" data-is-dirty={String(isDirty)}>
          <div data-testid="context-pane">{contextPane}</div>
          <div data-testid="detail-pane">{detailPane}</div>
          <button onClick={onSave}>Save Quiz</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      );
    }
  ),
}));

// Mock the AI overlay — not relevant to this test.
vi.mock('@/components/widgets/QuizWidget/components/QuizEditor', async () => {
  const actual = await vi.importActual<
    typeof import('@/components/widgets/QuizWidget/components/QuizEditor')
  >('@/components/widgets/QuizWidget/components/QuizEditor');
  return {
    ...actual,
    QuizAiOverlay: () => null,
    // QuizEditorContextPane and QuizEditorDetailPane: use real ones but
    // they will be rendered inside the mocked EditorWorkspace context pane.
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeQuiz: QuizData = {
  id: 'quiz-1',
  title: 'Science Review',
  questions: [
    {
      id: 'q1',
      text: 'What is photosynthesis?',
      type: 'MC',
      correctAnswer: 'A',
      incorrectAnswers: ['B', 'C', 'D'],
      timeLimit: 30,
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeQuiz2: QuizData = {
  id: 'quiz-2',
  title: 'History Review',
  questions: [
    {
      id: 'q2',
      text: 'When did WWII end?',
      type: 'MC',
      correctAnswer: '1945',
      incorrectAnswers: ['1918', '1939', '1950'],
      timeLimit: 30,
    },
  ],
  createdAt: 3000,
  updatedAt: 4000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuizEditorModal — Questions/Settings tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a "Questions" tab button in the context pane', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /questions/i })
    ).toBeInTheDocument();
  });

  it('renders a "Settings" tab button in the context pane', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /settings/i })
    ).toBeInTheDocument();
  });

  it('shows the question list by default (Questions tab active)', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // The real QuizEditorContextPane renders the question list.
    // "Questions (1)" heading should be visible.
    expect(screen.getByText(/Questions \(1\)/)).toBeInTheDocument();
  });

  it('switching to Settings tab renders the behavior panel (mode buttons)', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    // QuizBehaviorSettingsPanel renders Teacher-paced / Auto-progress / Self-paced
    expect(screen.getByText('Teacher-paced')).toBeInTheDocument();
    expect(screen.getByText('Self-paced')).toBeInTheDocument();
  });

  it('switching back to Questions hides the behavior panel', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    // Switch to Settings then back to Questions using the tab buttons.
    // getAllByRole + [0] selects the first match which is the tab button,
    // not the "Questions (N)" heading in the list.
    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^questions$/i })[0]);
    expect(screen.queryByText('Teacher-paced')).not.toBeInTheDocument();
  });

  it('saving without changing settings calls onSave with DEFAULT_QUIZ_BEHAVIOR as 2nd arg', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Quiz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [_updatedQuiz, behavior] = onSave.mock.calls[0];
    expect(behavior).toMatchObject({
      sessionMode: DEFAULT_QUIZ_BEHAVIOR.sessionMode,
    });
  });

  it('when a behavior prop is provided, it seeds the panel', () => {
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'student',
    };
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
        behavior={customBehavior}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    // The "Self-paced" button should be aria-pressed=true
    const selfPacedBtn = screen.getByRole('button', { name: /self-paced/i });
    expect(selfPacedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('editing a behavior control and saving passes updated behavior as 2nd arg', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    // Switch to settings and change mode to 'student'
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));

    // Save
    fireEvent.click(screen.getByRole('button', { name: 'Save Quiz' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [, behavior] = onSave.mock.calls[0];
    expect(behavior).toMatchObject({ sessionMode: 'student' });
  });

  it('changing behavior marks the editor as dirty', () => {
    render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    const workspace = screen.getByTestId('editor-workspace');
    expect(workspace).toHaveAttribute('data-is-dirty', 'false');

    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));
    expect(workspace).toHaveAttribute('data-is-dirty', 'true');
  });

  it('reusing the modal for a different quiz resets originalBehavior — no false dirty', () => {
    // Quiz A has a custom behavior (self-paced / student mode).
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'student',
    };

    const { rerender } = render(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz}
        onClose={vi.fn()}
        onSave={vi.fn()}
        behavior={customBehavior}
      />
    );

    // Rerender with quiz B and DEFAULT behavior (no behavior prop = default).
    rerender(
      <QuizEditorModal
        isOpen
        quiz={fakeQuiz2}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // After switching to a new quiz, the editor should NOT be dirty:
    // both behavior and originalBehavior should be DEFAULT_QUIZ_BEHAVIOR.
    const workspace = screen.getByTestId('editor-workspace');
    expect(workspace).toHaveAttribute('data-is-dirty', 'false');

    // The Settings panel should reflect DEFAULT behavior (Teacher-paced / teacher mode).
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const teacherPacedBtn = screen.getByRole('button', {
      name: /teacher-paced/i,
    });
    expect(teacherPacedBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
