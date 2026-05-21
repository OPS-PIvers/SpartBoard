/**
 * Tests for VideoActivityEditorModal — Task 8: Questions/Settings tab.
 *
 * Key assertions:
 *   - Editor renders a "Questions" and a "Settings" toggle in the chrome.
 *   - Switching to "Settings" renders VideoActivityBehaviorSettingsPanel
 *     (asserted via a mode button being present).
 *   - Switching back to "Questions" renders the question list.
 *   - Editing a behavior control and saving calls onSave with the updated
 *     behavior as the 2nd argument.
 *   - Saving without touching settings calls onSave with DEFAULT_VA_BEHAVIOR
 *     (or the seeded behavior from the `behavior` prop).
 *   - When a `behavior` prop is provided, it seeds the panel.
 *   - Behavior changes flip isDirty (Save button is enabled).
 *   - Re-using the modal for a different activity re-seeds originalBehavior —
 *     no false dirty.
 *
 * Mocking strategy:
 *   - useAuth: returns a stub user without gemini access.
 *   - EditorWorkspace: renders contextPane + detailPane + a Save button that
 *     calls onSave; exposes isDirty via data attribute.
 *   - VideoActivityAiOverlay: not relevant — mocked to null.
 *   - VideoActivityBehaviorSettingsPanel: NOT mocked — real panel asserted.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { VideoActivityEditorModal } from '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal';
import type { VideoActivityBehaviorSettings, VideoActivityData } from '@/types';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';

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
          <button onClick={onSave}>Save Activity</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      );
    }
  ),
}));

// Mock the AI overlay — not relevant to this test.
vi.mock(
  '@/components/widgets/VideoActivityWidget/components/VideoActivityEditor',
  async () => {
    const actual = await vi.importActual<
      typeof import('@/components/widgets/VideoActivityWidget/components/VideoActivityEditor')
    >(
      '@/components/widgets/VideoActivityWidget/components/VideoActivityEditor'
    );
    return {
      ...actual,
      VideoActivityAiOverlay: () => null,
    };
  }
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeActivity: VideoActivityData = {
  id: 'va-1',
  title: 'Cell Division',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  questions: [
    {
      id: 'q1',
      text: 'What is mitosis?',
      type: 'MC',
      correctAnswer: 'Cell division',
      incorrectAnswers: ['Photosynthesis', 'Respiration', 'Osmosis'],
      timeLimit: 30,
      timestamp: 10,
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeActivity2: VideoActivityData = {
  id: 'va-2',
  title: 'Photosynthesis',
  youtubeUrl: 'https://youtube.com/watch?v=def',
  questions: [
    {
      id: 'q2',
      text: 'What do plants need?',
      type: 'MC',
      correctAnswer: 'Sunlight',
      incorrectAnswers: ['Darkness', 'Ice', 'Sand'],
      timeLimit: 30,
      timestamp: 5,
    },
  ],
  createdAt: 3000,
  updatedAt: 4000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoActivityEditorModal — Questions/Settings tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a "Questions" tab button in the context pane', () => {
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
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
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /settings/i })
    ).toBeInTheDocument();
  });

  it('switching to Settings tab renders the behavior panel (mode buttons)', () => {
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByText('Teacher-paced')).toBeInTheDocument();
    expect(screen.getByText('Self-paced')).toBeInTheDocument();
  });

  it('switching back to Questions hides the behavior panel', () => {
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /^settings$/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^questions$/i })[0]);
    expect(screen.queryByText('Teacher-paced')).not.toBeInTheDocument();
  });

  it('saving without changing settings calls onSave with DEFAULT_VA_BEHAVIOR as 2nd arg', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [_updatedActivity, behavior] = onSave.mock.calls[0];
    expect(behavior).toMatchObject({
      sessionMode: DEFAULT_VA_BEHAVIOR.sessionMode,
    });
  });

  it('when a behavior prop is provided, it seeds the panel', () => {
    const customBehavior: VideoActivityBehaviorSettings = {
      ...DEFAULT_VA_BEHAVIOR,
      sessionMode: 'student',
    };
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={vi.fn()}
        behavior={customBehavior}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const selfPacedBtn = screen.getByRole('button', { name: /self-paced/i });
    expect(selfPacedBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('editing a behavior control and saving passes updated behavior as 2nd arg', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    // Switch to settings and change mode to 'student'
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    fireEvent.click(screen.getByRole('button', { name: /self-paced/i }));

    // Save
    fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [, behavior] = onSave.mock.calls[0];
    expect(behavior).toMatchObject({ sessionMode: 'student' });
  });

  it('changing behavior marks the editor as dirty', () => {
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
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

  it('reusing the modal for a different activity resets originalBehavior — no false dirty', () => {
    const customBehavior: VideoActivityBehaviorSettings = {
      ...DEFAULT_VA_BEHAVIOR,
      sessionMode: 'student',
    };

    const { rerender } = render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={vi.fn()}
        behavior={customBehavior}
      />
    );

    // Rerender with activity B and DEFAULT behavior (no behavior prop = default).
    rerender(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity2}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    // After switching to a new activity, the editor should NOT be dirty.
    const workspace = screen.getByTestId('editor-workspace');
    expect(workspace).toHaveAttribute('data-is-dirty', 'false');

    // The Settings panel should reflect DEFAULT behavior (Teacher-paced).
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const teacherPacedBtn = screen.getByRole('button', {
      name: /teacher-paced/i,
    });
    expect(teacherPacedBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
