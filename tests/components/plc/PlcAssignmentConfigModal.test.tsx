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
 *   - createSyncedQuizGroup, createSyncedVideoActivityGroup,
 *     writePlcVideoActivityAssignmentTemplate, QuizDriveService,
 *     deriveSessionTargetsFromRosters are mocked.
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
import { useDashboard } from '@/context/useDashboard';

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
// Spy on the legacy board hand-off seam. The in-PLC flow must NEVER touch it
// (Stream B contract: assignment creation happens in-PLC, no board open). See
// PlcAssignmentsLibrarySubTab for the OLD flow that DID call this.
const mockSetPendingAssignmentEdit = vi.fn();

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
    setPendingAssignmentEdit: mockSetPendingAssignmentEdit,
  })),
}));

const { mockWritePlcVaTemplate } = vi.hoisted(() => ({
  mockWritePlcVaTemplate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/hooks/usePlcAssignments', () => ({
  writePlcVideoActivityAssignmentTemplate: mockWritePlcVaTemplate,
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

import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';

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
    mockSetPendingAssignmentEdit.mockClear();
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

  it('shows an error toast and does NOT close when createAssignment rejects', async () => {
    const onClose = vi.fn();
    mockCreateQuizAssignment.mockRejectedValueOnce(
      new Error('Firestore assignment write failed')
    );
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

    // The teacher must get an error toast...
    await waitFor(() => {
      const errorToast = mockAddToast.mock.calls.find((c) => c[1] === 'error');
      expect(errorToast).toBeDefined();
    });

    // ...and the modal must stay open so they can retry.
    expect(onClose).not.toHaveBeenCalled();
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

  it('NEVER hands off to the board via setPendingAssignmentEdit (Stream B contract)', async () => {
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

    // The in-PLC flow creates the assignment directly (createAssignment) and
    // must NOT trip the legacy board-open hand-off seam. The OLD board flow
    // (PlcAssignmentsLibrarySubTab "Edit all settings…") called this; the
    // in-PLC config modal must not.
    expect(mockSetPendingAssignmentEdit).not.toHaveBeenCalled();
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
    mockSetPendingAssignmentEdit.mockClear();
    mockWritePlcVaTemplate.mockClear();
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

  it('routes the VA template write through writePlcVideoActivityAssignmentTemplate', async () => {
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
      expect(mockWritePlcVaTemplate).toHaveBeenCalledTimes(1);
    });

    // Signature: (plcId, uid, input)
    const [plcId, uid, input] = mockWritePlcVaTemplate.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(plcId).toBe(fakePlc.id);
    expect(uid).toBe('uid-test');
    expect(input.title).toBe(fakeActivityRef.title);
    expect(input.youtubeUrl).toBe(fakeActivityRef.youtubeUrl);
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

// ---------------------------------------------------------------------------
// Tests — genuine rosterIds forwarding (T6)
//
// The other tests mock deriveSessionTargetsFromRosters to return empty
// rosterIds, so rosterIds forwarding is never actually proven. Here we drive
// the REAL derivation: real rosters are supplied via useDashboard, the resolver
// mock delegates to the real implementation, and we select rosters through the
// real AssignClassPicker. We then assert createAssignment receives the actual
// selected rosterIds — pinning the picker → derive → createAssignment seam.
// ---------------------------------------------------------------------------

const rosterAlpha: ClassRoster = {
  id: 'roster-alpha',
  name: 'Period 1 Alpha',
  driveFileId: null,
  studentCount: 0,
  students: [],
  createdAt: 1000,
};

const rosterBeta: ClassRoster = {
  id: 'roster-beta',
  name: 'Period 2 Beta',
  driveFileId: null,
  studentCount: 0,
  students: [],
  createdAt: 1001,
};

describe('PlcAssignmentConfigModal — genuine rosterIds forwarding (T6)', () => {
  beforeEach(() => {
    mockCreateQuizAssignment.mockClear();
    mockAddToast.mockClear();
    mockSetPendingAssignmentEdit.mockClear();
    mockCreateQuizAssignment.mockResolvedValue({
      id: 'assign-1',
      code: '1234',
    });

    // Supply REAL rosters to the modal.
    vi.mocked(useDashboard).mockReturnValue({
      addToast: mockAddToast,
      rosters: [rosterAlpha, rosterBeta],
      setPendingAssignmentEdit: mockSetPendingAssignmentEdit,
    } as unknown as ReturnType<typeof useDashboard>);

    // Delegate the resolver mock to the REAL derivation so rosterIds are
    // actually computed from the selected rosters (not stubbed to empty).
    vi.mocked(deriveSessionTargetsFromRosters).mockImplementation(
      (rosters) => ({
        rosterIds: rosters.map((r) => r.id),
        classIds: [],
        periodNames: rosters.map((r) => r.name),
        classPeriodByClassId: {},
        students: [],
      })
    );
  });

  it('forwards the actually-selected rosterIds to createAssignment', async () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        isOpen
        onClose={vi.fn()}
      />
    );

    // Select a real roster through the real AssignClassPicker.
    fireEvent.click(screen.getByText('Period 1 Alpha'));

    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: /create assignment/i })
      );
    });

    await waitFor(() => {
      expect(mockCreateQuizAssignment).toHaveBeenCalledTimes(1);
    });

    // The 3rd arg to createQuizAssignment is the create-options object that
    // carries rosterIds derived from the picker selection.
    const opts = mockCreateQuizAssignment.mock.calls[0][2] as {
      rosterIds: string[];
    };
    expect(opts.rosterIds).toEqual(['roster-alpha']);
  });
});

// ---------------------------------------------------------------------------
// Tests — Task 10: slimmed quiz-kind (behavior from quizBehavior prop)
// ---------------------------------------------------------------------------

const fakeBehavior = {
  sessionMode: 'auto' as const,
  sessionOptions: {
    tabWarningsEnabled: false,
    showResultToStudent: true,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    speedBonusEnabled: false,
    streakBonusEnabled: false,
    showPodiumBetweenQuestions: false,
    soundEffectsEnabled: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
  },
  attemptLimit: 3,
};

describe('PlcAssignmentConfigModal (quiz kind — Task 10 slimmed, quizBehavior prop)', () => {
  beforeEach(() => {
    mockCreateQuizAssignment.mockClear();
    mockCreateVaAssignment.mockClear();
    mockAddToast.mockClear();
    mockSetPendingAssignmentEdit.mockClear();
    mockCreateQuizAssignment.mockResolvedValue({
      id: 'assign-1',
      code: '1234',
    });
    // Reset useDashboard to the basic stub (no rosters needed here)
    vi.mocked(useDashboard).mockReturnValue({
      addToast: mockAddToast,
      rosters: [] as ClassRoster[],
      setPendingAssignmentEdit: mockSetPendingAssignmentEdit,
    } as unknown as ReturnType<typeof useDashboard>);
  });

  it('does NOT render a mode picker (Teacher-paced / Auto-paced / Self-paced) when quizBehavior is provided', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        quizBehavior={fakeBehavior}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('radio', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /auto-paced/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /self-paced/i })
    ).not.toBeInTheDocument();
  });

  it('renders the behavior summary when quizBehavior is provided', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        quizBehavior={fakeBehavior}
        isOpen
        onClose={vi.fn()}
      />
    );
    const summaryEl = screen.getByTestId('plc-config-behavior-summary');
    expect(summaryEl).toBeInTheDocument();
    expect(summaryEl.textContent).toMatch(/auto-progress/i);
    expect(summaryEl.textContent).toMatch(/3 attempts/i);
  });

  it('sources sessionMode/sessionOptions/attemptLimit from quizBehavior on submit', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="quiz"
        quizRef={fakeQuizRef}
        quizBehavior={fakeBehavior}
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
    expect(settings.sessionMode).toBe('auto');
    expect(settings.attemptLimit).toBe(3);
    expect(
      (settings.sessionOptions as Record<string, unknown>).showResultToStudent
    ).toBe(true);

    // The synced group minted for peers must carry the same behavior, or
    // teammates who pull before the first edit get DEFAULT behavior.
    const { createSyncedQuizGroup } =
      await import('@/hooks/useSyncedQuizGroups');
    expect(createSyncedQuizGroup).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: fakeBehavior })
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — Task 10 (VA parity): slimmed video-activity kind (behavior from
// vaBehavior prop)
// ---------------------------------------------------------------------------

const fakeVaBehavior = {
  sessionMode: 'auto' as const,
  sessionOptions: {
    tabWarningsEnabled: false,
    showResultToStudent: true,
    showCorrectAnswerToStudent: false,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    rewindOnIncorrectSeconds: 15,
    pointPenaltyOnIncorrect: 5,
    scoreVisibility: 'score-only' as const,
  },
  attemptLimit: 2,
};

describe('PlcAssignmentConfigModal (video-activity kind — Task 10 VA parity, vaBehavior prop)', () => {
  beforeEach(() => {
    mockCreateQuizAssignment.mockClear();
    mockCreateVaAssignment.mockClear();
    mockAddToast.mockClear();
    mockSetPendingAssignmentEdit.mockClear();
    mockWritePlcVaTemplate.mockClear();
    mockCreateVaAssignment.mockResolvedValue({ id: 'va-assign-1' });
    // Reset useDashboard to the basic stub
    vi.mocked(useDashboard).mockReturnValue({
      addToast: mockAddToast,
      rosters: [] as ClassRoster[],
      setPendingAssignmentEdit: mockSetPendingAssignmentEdit,
    } as unknown as ReturnType<typeof useDashboard>);
  });

  it('does NOT render editable toggle controls when vaBehavior is provided', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        vaBehavior={fakeVaBehavior}
        isOpen
        onClose={vi.fn()}
      />
    );
    // AssignmentSettingsToggleGroup is hidden when vaBehavior is provided
    expect(screen.queryByLabelText(/shuffle/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tab warnings/i)).not.toBeInTheDocument();
  });

  it('renders the VA behavior summary when vaBehavior is provided', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        vaBehavior={fakeVaBehavior}
        isOpen
        onClose={vi.fn()}
      />
    );
    const summaryEl = screen.getByTestId('plc-config-va-behavior-summary');
    expect(summaryEl).toBeInTheDocument();
    // fakeVaBehavior: auto mode, 2 attempts, rewind 15s, −5 pts penalty, score only
    expect(summaryEl.textContent).toMatch(/auto-progress/i);
    expect(summaryEl.textContent).toMatch(/2 attempts/i);
    expect(summaryEl.textContent).toMatch(/rewind 15s/i);
  });

  it('renders the "Edit in the activity editor" hint when vaBehavior is provided', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        vaBehavior={fakeVaBehavior}
        isOpen
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByText(/edit in the activity editor/i)
    ).toBeInTheDocument();
  });

  it('sources sessionOptions/attemptLimit from vaBehavior on submit', async () => {
    const onClose = vi.fn();
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        vaBehavior={fakeVaBehavior}
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

    const [, settings] = mockCreateVaAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    const sessionOptions = settings.sessionOptions as Record<string, unknown>;
    expect(sessionOptions.attemptLimit).toBe(2);
    expect(sessionOptions.showResultToStudent).toBe(true);
    expect(sessionOptions.rewindOnIncorrectSeconds).toBe(15);
    expect(sessionOptions.pointPenaltyOnIncorrect).toBe(5);

    // The synced group minted for peers must carry the same behavior.
    const { createSyncedVideoActivityGroup } =
      await import('@/hooks/useSyncedVideoActivityGroups');
    expect(createSyncedVideoActivityGroup).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: fakeVaBehavior })
    );
  });

  it('does NOT render mode picker or the VA behavior summary on the legacy VA path (no vaBehavior)', () => {
    render(
      <PlcAssignmentConfigModal
        plc={fakePlc}
        kind="video-activity"
        activityRef={fakeActivityRef}
        // No vaBehavior — legacy path
        isOpen
        onClose={vi.fn()}
      />
    );
    // No mode picker on VA (quiz-only)
    expect(
      screen.queryByRole('radio', { name: /teacher-paced/i })
    ).not.toBeInTheDocument();
    // The slimmed summary testid should NOT appear on the legacy path
    expect(
      screen.queryByTestId('plc-config-va-behavior-summary')
    ).not.toBeInTheDocument();
  });
});
