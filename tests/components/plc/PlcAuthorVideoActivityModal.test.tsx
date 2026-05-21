/**
 * Tests for PlcAuthorVideoActivityModal — Stream B (mirrors
 * PlcAuthorQuizModal.test.tsx for the video-activity authoring path).
 *
 * Key assertions:
 *   - Mounting with isOpen renders VideoActivityEditorModal.
 *   - When VideoActivityEditorModal.onSave fires, saveActivity is called.
 *   - After saveActivity resolves, PlcAssignmentConfigModal is opened with
 *     kind='video-activity' and the youtubeUrl carried through (the authoring
 *     step hands off to the config step in-PLC — no board hand-off).
 *   - Closing the config modal calls onClose.
 *
 * Mocking strategy:
 *   - useAuth: returns a stub user.
 *   - useVideoActivity: saveActivity resolves with fake VideoActivityMetadata.
 *   - VideoActivityEditorModal: renders a "Save Activity" button that calls
 *     onSave(fakeActivity).
 *   - PlcAssignmentConfigModal: renders a sentinel div so we can assert it
 *     mounts with the right props.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcAuthorVideoActivityModal } from '@/components/plc/authoring/PlcAuthorVideoActivityModal';
import type {
  Plc,
  VideoActivityBehaviorSettings,
  VideoActivityData,
  VideoActivityMetadata,
} from '@/types';
import { DEFAULT_VA_BEHAVIOR } from '@/utils/videoActivityBehavior';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockSaveActivity = vi.fn();

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: vi.fn(() => ({
    saveActivity: mockSaveActivity,
    activities: [],
    isDriveConnected: true,
  })),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'uid-test',
      displayName: 'Test Teacher',
      email: 'test@school.edu',
    },
  })),
}));

// Mock VideoActivityEditorModal so it renders a button that triggers onSave.
vi.mock(
  '@/components/widgets/VideoActivityWidget/components/VideoActivityEditorModal',
  () => ({
    VideoActivityEditorModal: vi.fn(
      ({
        isOpen,
        onSave,
        onClose,
      }: {
        isOpen: boolean;
        onSave: (
          a: VideoActivityData,
          b: VideoActivityBehaviorSettings
        ) => Promise<void>;
        onClose: () => void;
      }) => {
        if (!isOpen) return null;
        const fakeActivity: VideoActivityData = {
          id: 'va-abc',
          title: 'Cell Division Video',
          youtubeUrl: 'https://youtube.com/watch?v=abc',
          questions: [],
          createdAt: 1000,
          updatedAt: 2000,
        };
        return (
          <div data-testid="va-editor-modal">
            <button onClick={() => onSave(fakeActivity, DEFAULT_VA_BEHAVIOR)}>
              Save Activity
            </button>
            <button onClick={onClose}>Cancel</button>
          </div>
        );
      }
    ),
  })
);

// Mock PlcAssignmentConfigModal so we can assert it mounts with the right props.
vi.mock('@/components/plc/assignments/PlcAssignmentConfigModal', () => ({
  PlcAssignmentConfigModal: vi.fn(
    ({
      kind,
      activityRef,
      isOpen,
      onClose,
    }: {
      kind: string;
      activityRef?: { id: string; title: string; youtubeUrl: string };
      isOpen: boolean;
      onClose: () => void;
    }) => {
      if (!isOpen) return null;
      return (
        <div
          data-testid="plc-assignment-config-modal"
          data-kind={kind}
          data-activity-ref-id={activityRef?.id}
          data-activity-ref-title={activityRef?.title}
          data-activity-ref-youtube={activityRef?.youtubeUrl}
        >
          <button onClick={onClose}>Close Config</button>
        </div>
      );
    }
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Science',
  leadUid: 'uid-a',
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeMetadata: VideoActivityMetadata = {
  id: 'va-abc',
  title: 'Cell Division Video',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  driveFileId: 'drive-file-456',
  questionCount: 0,
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcAuthorVideoActivityModal', () => {
  beforeEach(() => {
    mockSaveActivity.mockClear();
    mockSaveActivity.mockResolvedValue(fakeMetadata);
  });

  it('renders VideoActivityEditorModal when isOpen=true', () => {
    render(
      <PlcAuthorVideoActivityModal plc={fakePlc} isOpen onClose={vi.fn()} />
    );
    expect(screen.getByTestId('va-editor-modal')).toBeInTheDocument();
  });

  it('does not render VideoActivityEditorModal when isOpen=false', () => {
    render(
      <PlcAuthorVideoActivityModal
        plc={fakePlc}
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId('va-editor-modal')).not.toBeInTheDocument();
  });

  it('calls saveActivity when VideoActivityEditorModal.onSave fires', () => {
    render(
      <PlcAuthorVideoActivityModal plc={fakePlc} isOpen onClose={vi.fn()} />
    );

    act(() => {
      fireEvent.click(screen.getByText('Save Activity'));
    });

    expect(mockSaveActivity).toHaveBeenCalledTimes(1);
    expect(mockSaveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Cell Division Video' }),
      undefined,
      expect.objectContaining({ sessionMode: DEFAULT_VA_BEHAVIOR.sessionMode })
    );
  });

  it('opens PlcAssignmentConfigModal with kind=video-activity and youtubeUrl after save', async () => {
    render(
      <PlcAuthorVideoActivityModal plc={fakePlc} isOpen onClose={vi.fn()} />
    );

    act(() => {
      fireEvent.click(screen.getByText('Save Activity'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('plc-assignment-config-modal')
      ).toBeInTheDocument();
    });

    const modal = screen.getByTestId('plc-assignment-config-modal');
    expect(modal.getAttribute('data-kind')).toBe('video-activity');
    expect(modal.getAttribute('data-activity-ref-id')).toBe(fakeMetadata.id);
    expect(modal.getAttribute('data-activity-ref-title')).toBe(
      fakeMetadata.title
    );
    // The youtubeUrl must carry through from the saved metadata.
    expect(modal.getAttribute('data-activity-ref-youtube')).toBe(
      fakeMetadata.youtubeUrl
    );
  });

  it('VideoActivityEditorModal is unmounted after transitioning to config step', async () => {
    render(
      <PlcAuthorVideoActivityModal plc={fakePlc} isOpen onClose={vi.fn()} />
    );

    act(() => {
      fireEvent.click(screen.getByText('Save Activity'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('plc-assignment-config-modal')
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId('va-editor-modal')).not.toBeInTheDocument();
  });

  it('calls onClose when the config modal is closed', async () => {
    const onClose = vi.fn();
    render(
      <PlcAuthorVideoActivityModal plc={fakePlc} isOpen onClose={onClose} />
    );

    act(() => {
      fireEvent.click(screen.getByText('Save Activity'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('plc-assignment-config-modal')
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close Config'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
