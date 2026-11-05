/**
 * Tests for VideoActivityEditorModal's saved behavior: the editor has no
 * Settings tab, so it hands the seeded behavior (or DEFAULT_VA_BEHAVIOR) back
 * on save and re-seeds it per activity without marking the editor dirty.
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

// The YouTube player can't load in jsdom.
vi.mock('@/components/widgets/VideoActivityWidget/components/Timeline', () => ({
  Timeline: () => <div data-testid="timeline" />,
}));

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

const customBehavior: VideoActivityBehaviorSettings = {
  ...DEFAULT_VA_BEHAVIOR,
  sessionOptions: {
    ...DEFAULT_VA_BEHAVIOR.sessionOptions,
    tabWarningsEnabled: false,
  },
};

describe('VideoActivityEditorModal — saved behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has no Questions or Settings tabs', () => {
    render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /^settings$/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^questions$/i })
    ).not.toBeInTheDocument();
  });

  it('saves DEFAULT_VA_BEHAVIOR as the 2nd arg without a behavior prop', async () => {
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
    expect(onSave.mock.calls[0][1]).toEqual(DEFAULT_VA_BEHAVIOR);
  });

  it('re-seeds the behavior for a different activity with no false dirty', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity}
        onClose={vi.fn()}
        onSave={onSave}
        behavior={customBehavior}
      />
    );
    rerender(
      <VideoActivityEditorModal
        isOpen
        activity={fakeActivity2}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );
    expect(screen.getByTestId('editor-workspace')).toHaveAttribute(
      'data-is-dirty',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Activity' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][1]).toEqual(DEFAULT_VA_BEHAVIOR);
  });
});
