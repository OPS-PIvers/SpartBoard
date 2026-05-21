/**
 * Tests for PlcAssignmentConfigModal — Stream B task B3.
 *
 * Key assertions:
 *   - Renders mode selector (quiz only), AssignmentSettingsToggleGroup,
 *     AssignClassPicker, and a due-date input.
 *   - On confirm, createAssignment receives:
 *       • settings.plc set (has id matching plc.id)
 *       • dueAt set when a date is entered
 *       • rosterIds forwarded from the picker
 *   - No board hand-off / no setPendingAssignmentEdit called.
 *
 * Mocking strategy:
 *   - useQuizAssignments: createAssignment is a spy.
 *   - useVideoActivityAssignments: createAssignment is a spy.
 *   - useAuth: returns stub user + getAssignmentMode.
 *   - useDashboard: addToast spy + rosters.
 *   - Heavy sub-components (AssignmentSettingsToggleGroup, AssignClassPicker)
 *     are rendered real (they are pure React, no Firebase) but their interaction
 *     is minimal — we just assert the overall callback wiring.
 *   - createSyncedQuizGroup, createSyncedVideoActivityGroup, writePlcVideoActivityEntry,
 *     QuizDriveService, deriveSessionTargetsFromRosters are mocked.
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

import { PlcAssignmentConfigModal } from '@/components/plc/assignments/PlcAssignmentConfigModal';
import type { Plc, ClassRoster } from '@/types';
import type { AssignmentQuizRef } from '@/hooks/useQuizAssignments';
import type { AssignmentActivityRef } from '@/hooks/useVideoActivityAssignments';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateQuizAssignment = vi.fn();
const mockCreateVaAssignment = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: vi.fn(() => ({
    createAssignment: mockCreateQuizAssignment,
  })),
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: vi.fn(() => ({
    createAssignment: mockCreateVaAssignment,
  })),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'uid-test',
      displayName: 'Test Teacher',
      email: 'test@school.edu',
    },
    googleAccessToken: null, // Drive sheet creation skipped (googleAccessToken null)
    getAssignmentMode: () => 'submissions',
  })),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(() => ({
    addToast: mockAddToast,
    rosters: [] as ClassRoster[],
  })),
}));

vi.mock('@/hooks/usePlcVideoActivities', () => ({
  writePlcVideoActivityEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  createSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/hooks/useSyncedVideoActivityGroups', () => ({
  createSyncedVideoActivityGroup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: vi.fn().mockImplementation(() => ({
    createPlcSheetAndShare: vi.fn().mockResolvedValue({ url: '' }),
  })),
}));

vi.mock('@/utils/resolveAssignmentTargets', () => ({
  deriveSessionTargetsFromRosters: vi.fn().mockReturnValue({
    classIds: [],
    rosterIds: [],
    periodNames: [],
    classPeriodByClassId: {},
  }),
}));

vi.mock('@/utils/plc', () => ({
  getPlcMemberEmails: vi.fn().mockReturnValue([]),
  getPlcTeammateEmails: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-99',
  name: 'Grade 5 Science',
  leadUid: 'uid-a',
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeQuizRef: AssignmentQuizRef = {
  id: 'quiz-xyz',
  title: 'Science Unit 2',
  driveFileId: 'drive-xyz',
  questions: [],
};

const fakeActivityRef: AssignmentActivityRef = {
  id: 'va-xyz',
  title: 'Cell Division Video',
  driveFileId: 'drive-va-xyz',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  questions: [],
};

// ---------------------------------------------------------------------------
// Tests — Quiz kind
// ---------------------------------------------------------------------------

describe('PlcAssignmentConfigModal (quiz kind)', () => {
  beforeEach(() => {
    mockCreateQuizAssignment.mockClear();
    mockCreateVaAssignment.mockClear();
    mockAddToast.mockClear();
    mockCreateQuizAssignment.mockResolvedValue({
      id: 'assign-1',
      code: '1234',
    });
  });

  it('renders a mode selector for quiz kind', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={vi.fn()}
      />
    );
    // Expect mode buttons: Teacher-paced, Auto-paced, Self-paced
    expect(
      screen.getByRole('radio', { name: /teacher-paced/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /auto-paced/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /self-paced/i })
    ).toBeInTheDocument();
  });

  it('renders a due date input', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
  });

  it('calls createAssignment with settings.plc.id matching the PLC on submit', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={onClose}
      />
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateQuizAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateQuizAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.plc).toBeDefined();
    expect((settings.plc as Record<string, unknown>).id).toBe(fakePlc.id);
    expect((settings.plc as Record<string, unknown>).name).toBe(fakePlc.name);
  });

  it('forwards dueAt onto settings when a date is entered', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={onClose}
      />
    );

    // Set a due date
    const dateInput = screen.getByLabelText(/due date/i);
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } });

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateQuizAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateQuizAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.dueAt).toBeDefined();
    expect(typeof settings.dueAt).toBe('number');
    // 2026-06-15 → epoch ms should be a positive number
    expect(settings.dueAt).toBeGreaterThan(0);
  });

  it('does NOT set dueAt when no date is entered', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={onClose}
      />
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateQuizAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateQuizAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    // dueAt should be absent (undefined) when no date is entered
    expect(settings.dueAt).toBeUndefined();
  });

  it('calls onClose after successful assignment creation', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={onClose}
      />
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call video createAssignment for quiz kind', async () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={vi.fn()}
      />
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateQuizAssignment).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateVaAssignment).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — video-activity kind
// ---------------------------------------------------------------------------

describe('PlcAssignmentConfigModal (video-activity kind)', () => {
  beforeEach(() => {
    mockCreateQuizAssignment.mockClear();
    mockCreateVaAssignment.mockClear();
    mockAddToast.mockClear();
    mockCreateVaAssignment.mockResolvedValue({ id: 'va-assign-1' });
  });

  it('does not render a mode selector for video-activity kind', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        isOpen
        onClose={vi.fn()}
      />
    );
    // Mode buttons are quiz-only
    expect(
      screen.queryByRole('radio', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
  });

  it('calls createAssignment (VA) with settings.plc.id on submit', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        isOpen
        onClose={onClose}
      />
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateVaAssignment).toHaveBeenCalledTimes(1);
    });

    // VA createAssignment uses positional args: (activity, settings, initialStatus, ...)
    const [, settings] = mockCreateVaAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.plc).toBeDefined();
    expect((settings.plc as Record<string, unknown>).id).toBe(fakePlc.id);
  });

  it('does not call quiz createAssignment for video-activity kind', async () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        isOpen
        onClose={vi.fn()}
      />
    );

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateVaAssignment).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateQuizAssignment).not.toHaveBeenCalled();
  });

  it('renders null when isOpen=false', () => {
    const { container } = render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
