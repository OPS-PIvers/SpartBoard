/**
 * Tests for PlcNewQuizAssignmentModal on the Quiz assign stepper.
 *
 * Mocking strategy:
 *   - useQuiz: quizzes list with one item carrying a behavior.
 *     loadQuizData returns a fake QuizData.
 *   - useQuizAssignments: createAssignment spy.
 *   - useAuth, useDashboard: stubs.
 *   - Heavy side-effects (Drive sheet, syncedQuizGroups, attachSyncLinkage)
 *     mocked.
 *   - PlcSharePickerModal mocked as a sentinel that immediately calls onPick.
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PlcNewQuizAssignmentModal } from '@/components/plc/PlcNewQuizAssignmentModal';
import type { Plc, ClassRoster, QuizMetadata } from '@/types';
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateAssignment = vi.fn();
const mockLoadQuizData = vi.fn();
const mockAttachSyncLinkage = vi.fn();
const mockAddToast = vi.fn();
const mockSaveDriveSnapshot = vi.fn();

const fakeQuiz: QuizMetadata = {
  id: 'quiz-1',
  title: 'Cell Division',
  driveFileId: 'drive-1',
  questionCount: 5,
  createdAt: 1000,
  updatedAt: 2000,
  behavior: {
    sessionMode: 'auto',
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
    attemptLimit: 2,
  },
};

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: vi.fn(() => ({
    quizzes: [fakeQuiz],
    loadQuizData: mockLoadQuizData,
    attachSyncLinkage: mockAttachSyncLinkage,
    saveDriveSnapshot: mockSaveDriveSnapshot,
    isDriveConnected: true,
    saveQuiz: vi.fn(),
    deleteQuiz: vi.fn(),
  })),
}));

const mockBankContents = new Map<string, unknown>();
vi.mock('@/hooks/useBankSources', () => ({
  useBankSources: () => ({
    loadBankContentsForQuiz: () => Promise.resolve(mockBankContents),
  }),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: vi.fn(() => ({
    createAssignment: mockCreateAssignment,
    setAssignmentTargetSkippedCount: vi.fn(),
  })),
}));

const mockPlcLibrary: { title: string; syncGroupId: string }[] = [];
vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: vi.fn(() => ({
    quizzes: mockPlcLibrary,
    loading: false,
    error: null,
  })),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'uid-teacher',
      displayName: 'Ms. Smith',
      email: 'smith@school.edu',
    },
  })),
}));

const mockLastUsed = {
  sessionMode: 'student' as const,
  sessionOptions: { blockCopyPaste: true, speedBonusEnabled: true },
  attemptLimit: 3,
};
const mockSaveLastUsed = vi.fn();
vi.mock('@/hooks/useLastQuizAssignSettings', () => ({
  useLastQuizAssignSettings: (_uid: string, enabled: boolean) => ({
    lastUsed: enabled ? mockLastUsed : null,
    loaded: true,
    save: mockSaveLastUsed,
  }),
}));

const mockSetAssignmentTargets = vi.fn();
vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({
    setAssignmentTargets: mockSetAssignmentTargets,
  }),
}));

let mockPeriodAccess: unknown = undefined;
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => mockPeriodAccess,
}));

vi.mock('@/hooks/useQuizHandRaiseMode', () => ({
  useQuizHandRaiseMode: () => 'teacher-choice',
}));

let stepperProps: Record<string, unknown> | null = null;
vi.mock('@/components/widgets/QuizWidget/components/QuizAssignStepper', () => ({
  QuizAssignStepper: (props: Record<string, unknown>) => {
    stepperProps = props;
    return <div data-testid="quiz-assign-stepper" />;
  },
}));

let mockRosters: ClassRoster[] = [];
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(() => ({
    addToast: mockAddToast,
    rosters: mockRosters,
    updateRoster: vi.fn(),
  })),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  createSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
  callLeaveSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
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
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

// Mock PlcSharePickerModal so the "pick" step is skipped — it immediately
// calls onPick with the first quiz's id so we always land in the configure step.
vi.mock('@/components/plc/PlcSharePickerModal', () => ({
  PlcSharePickerModal: vi.fn(
    ({
      onPick,
    }: {
      onPick: (id: string) => void;
      onClose: () => void;
      title?: string;
      subtitle?: string;
      prompt?: string;
      emptyMessage?: string;
      items?: { id: string; title: string; metaLine?: string }[];
    }) => (
      <button data-testid="pick-quiz-btn" onClick={() => onPick('quiz-1')}>
        Pick quiz-1
      </button>
    )
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-42',
  name: 'Grade 6 Science',
  leadUid: 'uid-a',
  members: {},
  memberUids: ['uid-a', 'uid-b'],
  memberEmails: {
    'uid-a': 'alice@school.edu',
    'uid-b': 'bob@school.edu',
  },
  createdAt: 1000,
  updatedAt: 2000,
};

// ---------------------------------------------------------------------------
// Helper: render and advance past the picker step
// ---------------------------------------------------------------------------

async function renderAndPickQuiz(props?: {
  onCreated?: (info: { assignmentId: string; quizTitle: string }) => void;
  onClose?: () => void;
}) {
  const onClose = props?.onClose ?? vi.fn();
  const onCreated = props?.onCreated;

  render(
    <PlcNewQuizAssignmentModal
      plc={fakePlc}
      onClose={onClose}
      onCreated={onCreated}
    />
  );

  // Click the picker sentinel to advance to configure step.
  fireEvent.click(screen.getByTestId('pick-quiz-btn'));

  // Give React a tick to update state.
  await act(async () => {
    await Promise.resolve();
  });

  return { onClose };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcNewQuizAssignmentModal on the Quiz stepper (D21)', () => {
  beforeEach(() => {
    stepperProps = null;
    mockRosters = SAMPLE_ROSTERS;
    mockCreateAssignment.mockClear();
    mockSaveLastUsed.mockClear();
    mockSetAssignmentTargets.mockReset();
    mockSetAssignmentTargets.mockResolvedValue({ skipped: [] });
    mockCreateAssignment.mockResolvedValue({ id: 'assign-new', code: '9999' });
    mockLoadQuizData.mockResolvedValue({
      id: 'quiz-1',
      title: 'Cell Division',
      questions: [],
      createdAt: 1000,
      updatedAt: 2000,
    });
  });
  afterEach(() => {
    mockRosters = [];
  });

  const props = () => stepperProps as Record<string, (v: unknown) => unknown>;

  it('opens the Quiz stepper with no Sharing step and no Modifications', async () => {
    await renderAndPickQuiz();
    expect(screen.getByTestId('quiz-assign-stepper')).toBeInTheDocument();
    expect(stepperProps?.sharing).toBeUndefined();
    expect(stepperProps?.modifications).toBeUndefined();
    expect(stepperProps?.title).toBe('Cell Division');
    // No bell periods, so Quiz falls back to Scheduled (D6).
    expect((stepperProps?.when as { mode: string }).mode).toBe('scheduled');
  });

  it('assigns the picked classes in Assessment Mode with last-used rules and saves them', async () => {
    await renderAndPickQuiz();
    act(() => {
      props().onClassesChange({ classIds: ['c1', 'c2'], studentsByClass: {} });
    });
    await act(async () => {
      await props().onSubmit(undefined);
    });
    expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    const [, settings, options] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(settings.sessionMode).toBe('student');
    expect(settings.attemptLimit).toBe(3);
    expect((settings.plc as { id: string }).id).toBe('plc-42');
    expect(options.initialStatus).toBe('paused');
    expect(options).toHaveProperty('openAt');
    expect(mockSaveLastUsed).toHaveBeenCalledWith(
      expect.objectContaining({ sessionMode: 'student', attemptLimit: 3 })
    );
    // Whole classes need no per-student fan-out.
    expect(mockSetAssignmentTargets).not.toHaveBeenCalled();
    // No period gate, so it starts paused and the toast says so.
    expect(mockAddToast).toHaveBeenCalledWith(
      '"{{title}}" created (paused) and shared with this group.',
      'success'
    );
  });

  it('drops "(paused)" from the toast only when a period gate creates it active', async () => {
    mockPeriodAccess = {
      bellOptions: [],
      bellWindow: () => null,
      onTagRoster: vi.fn(),
    };
    try {
      await renderAndPickQuiz();
      act(() => {
        props().onClassesChange({
          classIds: ['c1', 'c2'],
          studentsByClass: {},
        });
      });
      await act(async () => {
        await props().onSubmit(undefined);
      });
      const [, , options] = mockCreateAssignment.mock.calls[0] as [
        unknown,
        unknown,
        Record<string, unknown>,
      ];
      expect(options.initialStatus).toBe('active');
      expect(mockAddToast).toHaveBeenCalledWith(
        '"{{title}}" created and shared with this group.',
        'success'
      );
    } finally {
      mockPeriodAccess = undefined;
    }
  });

  it('fans out picked students through setAssignmentTargets', async () => {
    await renderAndPickQuiz();
    act(() => {
      props().onClassesChange({
        classIds: ['c2'],
        studentsByClass: {
          c2: [{ kind: 'classlink', sourcedId: 'SID-e' }],
        },
      });
    });
    await act(async () => {
      await props().onSubmit(undefined);
    });
    expect(mockSetAssignmentTargets).toHaveBeenCalledTimes(1);
    const [call] = mockSetAssignmentTargets.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(call.assignmentId).toBe('assign-new');
    expect(call.kind).toBe('quiz');
  });

  it('assigns a question-bank quiz with its pool, slots and frozen copy', async () => {
    const bankQ = (id: string) => ({
      id,
      type: 'MC',
      text: id,
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
    });
    mockBankContents.set('bank-1', {
      id: 'bank-1',
      title: 'Vocab bank',
      questions: [bankQ('b1'), bankQ('b2'), bankQ('b3')],
    });
    mockSaveDriveSnapshot.mockResolvedValue('snapshot-1');
    mockLoadQuizData.mockResolvedValue({
      id: 'quiz-1',
      title: 'Cell Division',
      questions: [],
      bankSlots: [
        {
          id: 's1',
          bankId: 'bank-1',
          bankTitle: 'Vocab bank',
          mode: 'random',
          count: 2,
        },
      ],
      createdAt: 1000,
      updatedAt: 2000,
    });
    try {
      await renderAndPickQuiz();
      await act(async () => {
        await props().onSubmit(undefined);
      });
      await waitFor(() => {
        expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
      });
      const [quiz, settings, opts] = mockCreateAssignment.mock.calls[0] as [
        { driveFileId: string; questions: unknown[] },
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(quiz.questions).toHaveLength(3);
      expect(quiz.driveFileId).toBe('snapshot-1');
      expect(settings.resolvedDriveFileId).toBe('snapshot-1');
      expect(opts.bankSlots).toHaveLength(1);
    } finally {
      mockBankContents.clear();
    }
  });

  it('passes plc linkage (id + name) into settings on submit', async () => {
    await renderAndPickQuiz();

    await act(async () => {
      await props().onSubmit(undefined);
    });

    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });

    const [, settings] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(settings.plc).toBeDefined();
    expect((settings.plc as Record<string, unknown>).id).toBe(fakePlc.id);
    expect((settings.plc as Record<string, unknown>).name).toBe(fakePlc.name);
    expect(settings.plc).not.toHaveProperty('sheetUrl');
  });

  it('pools by the PLC library group whose title matches the picked quiz', async () => {
    mockPlcLibrary.splice(0, mockPlcLibrary.length, {
      title: '  cell   DIVISION ',
      syncGroupId: 'library-group-1',
    });
    try {
      await renderAndPickQuiz();
      await act(async () => {
        await props().onSubmit(undefined);
      });
      await waitFor(() => {
        expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
      });
      const [, , opts] = mockCreateAssignment.mock.calls[0] as [
        unknown,
        unknown,
        Record<string, unknown>,
      ];
      expect(opts.plcPoolSyncGroupId).toBe('library-group-1');
    } finally {
      mockPlcLibrary.length = 0;
    }
  });

  it('leaves plcPoolSyncGroupId unset when no library title matches', async () => {
    await renderAndPickQuiz();
    await act(async () => {
      await props().onSubmit(undefined);
    });
    await waitFor(() => {
      expect(mockCreateAssignment).toHaveBeenCalledTimes(1);
    });
    const [, , opts] = mockCreateAssignment.mock.calls[0] as [
      unknown,
      unknown,
      Record<string, unknown>,
    ];
    expect(opts).not.toHaveProperty('plcPoolSyncGroupId');
  });

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn();
    await renderAndPickQuiz({ onClose });

    await act(async () => {
      await props().onSubmit(undefined);
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
