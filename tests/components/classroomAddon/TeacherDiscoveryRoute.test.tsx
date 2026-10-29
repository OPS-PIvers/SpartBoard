import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizQuestion, VideoActivityQuestion } from '@/types';

// Regression: attach flow's maxPoints must dedup duplicate question ids like other LMS-attach surfaces.

const saveLast = vi.fn();
const saveLastVa = vi.fn();
let vaFlag = false;

const mockCallable = vi.fn((_params: { maxPoints: number }) => ({
  data: { attachmentId: 'att-1' },
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  // useRosters (mounted for the M17 targeting picker) reads this flag.
  isAuthBypass: false,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: () => mockCallable,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => ({ exists: () => false })),
  updateDoc: vi.fn(() => undefined),
  setDoc: vi.fn(() => undefined),
}));

// The M17 targeting picker mounts these; neither is under test here.
vi.mock('@/hooks/useRosters', () => ({
  useRosters: () => ({ rosters: [] }),
}));
vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ rubrics: [] }),
}));

vi.mock('@/components/classroomAddon/gisOAuth', () => ({
  ensureGis: vi.fn(() => undefined),
  requestAccessToken: vi.fn(() => 'addon-access-token'),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 't@example.com', displayName: 'T' },
    signInWithGoogle: vi.fn(),
    googleAccessToken: 'drive-token',
    canAccessFeature: (id: string) => id === 'va-quiz-alignment' && vaFlag,
    ensureGoogleScope: vi.fn(() => null),
  }),
}));

vi.mock('@/hooks/useLastVideoAssignSettings', () => ({
  useLastVideoAssignSettings: () => ({
    lastUsed: null,
    loaded: true,
    save: saveLastVa,
  }),
}));

vi.mock('@/hooks/useLastQuizAssignSettings', () => ({
  useLastQuizAssignSettings: () => ({ lastUsed: null, save: saveLast }),
}));

// Two entries sharing the same id — simulates a Drive-sync/arrayUnion duplicate.
const dupQuestion: QuizQuestion = {
  id: 'q-dup',
  type: 'MC',
  points: 10,
} as unknown as QuizQuestion;
const duplicatedQuestions: QuizQuestion[] = [dupQuestion, dupQuestion];

const loadQuizData = vi.fn(() => ({
  id: 'quiz-1',
  title: 'My Quiz',
  questions: duplicatedQuestions,
  createdAt: 0,
  updatedAt: 0,
}));

const createAssignment = vi.fn((..._args: unknown[]) => ({
  id: 'assign-1',
  code: 'ABC123',
}));

vi.mock('@/hooks/useBankSources', () => ({
  useBankSources: () => ({
    loadBankContentsForQuiz: () => Promise.resolve(new Map()),
  }),
}));

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: [
      {
        id: 'quiz-1',
        title: 'My Quiz',
        driveFileId: 'drive-file-1',
        questionCount: 2,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    loadQuizData,
    loading: false,
  }),
}));

vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({ createAssignment }),
}));

const dupVaQuestion: VideoActivityQuestion = {
  id: 'q-dup',
  type: 'MC',
  points: 10,
  timestamp: 0,
} as unknown as VideoActivityQuestion;
const duplicatedActivityQuestions: VideoActivityQuestion[] = [
  dupVaQuestion,
  dupVaQuestion,
];

const loadActivityData = vi.fn(() => ({
  id: 'va-1',
  title: 'My Video Activity',
  questions: duplicatedActivityQuestions,
  createdAt: 0,
  updatedAt: 0,
}));

vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [
      {
        id: 'va-1',
        title: 'My Video Activity',
        driveFileId: 'drive-file-2',
        questionCount: 2,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    loadActivityData,
    loading: false,
  }),
}));

const createVaAssignment = vi.fn((..._args: unknown[]) => ({
  id: 'assign-2',
  code: 'DEF456',
}));

vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    createAssignment: createVaAssignment,
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

import { ClassroomAddonTeacherSpike } from '@/components/classroomAddon/TeacherDiscoveryRoute';

describe('ClassroomAddonTeacherSpike attach flow — maxPoints dedup', () => {
  beforeEach(() => {
    mockCallable.mockClear();
    window.history.pushState(
      {},
      '',
      '/classroom-addon/teacher?courseId=course-1&itemId=item-1&addOnToken=tok-1'
    );
  });

  it('dedupes duplicate question ids when computing the attached quiz maxPoints', async () => {
    render(<ClassroomAddonTeacherSpike />);

    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
    fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));

    fireEvent.click(screen.getByRole('button', { name: /attach quiz/i }));

    await waitFor(() => expect(mockCallable).toHaveBeenCalled());

    const lastCall = mockCallable.mock.calls.at(-1);
    if (!lastCall) throw new Error('mockCallable was not called');
    // Two entries of the SAME 10-point question id must dedup to 10, not 20.
    expect(lastCall[0].maxPoints).toBe(10);
  });

  it('dedupes duplicate question ids when computing the attached video activity maxPoints', async () => {
    render(<ClassroomAddonTeacherSpike />);

    fireEvent.click(screen.getByRole('tab', { name: 'Video Activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Video Activity' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'My Video Activity' })
    );

    fireEvent.click(
      screen.getByRole('button', { name: /attach video activity/i })
    );

    await waitFor(() => expect(mockCallable).toHaveBeenCalled());

    const lastCall = mockCallable.mock.calls.at(-1);
    if (!lastCall) throw new Error('mockCallable was not called');
    // Two entries of the SAME 10-point question id must dedup to 10, not 20.
    expect(lastCall[0].maxPoints).toBe(10);
  });
});

describe('ClassroomAddonTeacherSpike attach flow — assign step bodies', () => {
  beforeEach(() => {
    mockCallable.mockClear();
    createAssignment.mockClear();
    createVaAssignment.mockClear();
    window.history.pushState(
      {},
      '',
      '/classroom-addon/teacher?courseId=course-1&itemId=item-1&addOnToken=tok-1'
    );
  });

  it('the Quiz rule bodies drive the rules and an untouched When sets no window', async () => {
    saveLast.mockClear();
    render(<ClassroomAddonTeacherSpike />);
    fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
    fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));
    for (const name of [
      'When',
      'Attempts and order',
      'Quiz integrity',
      'What students see',
    ])
      expect(screen.getByRole('region', { name })).toBeTruthy();
    // Schedule starts off, so no unsaved window or late-work switch shows.
    expect(screen.queryByText('Opens')).toBeNull();
    expect(
      screen.queryByRole('switch', { name: 'Allow submissions after close' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle questions' }));
    fireEvent.click(screen.getByRole('button', { name: /attach quiz/i }));
    await waitFor(() => expect(createAssignment).toHaveBeenCalled());
    const call = createAssignment.mock.calls.at(-1) as unknown[];
    const settings = call[1] as {
      sessionOptions: { shuffleQuestions?: boolean };
      dueAt?: number;
    };
    const options = call[2] as Record<string, unknown>;
    expect(settings.sessionOptions.shuffleQuestions).toBe(true);
    // An untouched When sets no window, so nothing closes tonight.
    expect(options.openAt).toBeNull();
    expect(options.closeAt).toBeNull();
    expect(settings.dueAt).toBeUndefined();
    expect(saveLast).toHaveBeenCalledOnce();
  });

  it('video activities get the When body, and Schedule on sets the due date', async () => {
    render(<ClassroomAddonTeacherSpike />);
    fireEvent.click(screen.getByRole('tab', { name: 'Video Activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Video Activity' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'My Video Activity' })
    );
    expect(screen.getByRole('region', { name: 'When' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Quiz integrity' })).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule' }));
    fireEvent.click(
      screen.getByRole('button', { name: /attach video activity/i })
    );
    await waitFor(() => expect(createVaAssignment).toHaveBeenCalled());
    const settings = (createVaAssignment.mock.calls.at(-1) as unknown[])[1] as {
      sessionOptions: { dueAt?: number };
    };
    expect(typeof settings.sessionOptions.dueAt).toBe('number');
  });

  it('va-quiz-alignment: the Video rule bodies replace the summary and set the session rules', async () => {
    vaFlag = true;
    saveLastVa.mockClear();
    try {
      render(<ClassroomAddonTeacherSpike />);
      fireEvent.click(screen.getByRole('tab', { name: 'Video Activity' }));
      fireEvent.click(screen.getByRole('button', { name: 'Video Activity' }));
      fireEvent.click(
        await screen.findByRole('option', { name: 'My Video Activity' })
      );
      for (const name of [
        'When',
        'Attempts and order',
        'Video',
        'Integrity',
        'What students see',
      ])
        expect(screen.getByRole('region', { name })).toBeTruthy();
      expect(screen.queryByText(/Inherits this activity/)).toBeNull();
      fireEvent.click(
        screen.getByRole('switch', { name: 'Allow skipping ahead' })
      );
      fireEvent.click(
        screen.getByRole('button', { name: /attach video activity/i })
      );
      await waitFor(() => expect(createVaAssignment).toHaveBeenCalled());
      const settings = (
        createVaAssignment.mock.calls.at(-1) as unknown[]
      )[1] as {
        sessionOptions: { answerRulesSet?: boolean };
        sessionSettings: { allowSkipping: boolean };
      };
      expect(settings.sessionOptions.answerRulesSet).toBe(true);
      expect(settings.sessionSettings.allowSkipping).toBe(true);
      expect(saveLastVa).toHaveBeenCalledOnce();
    } finally {
      vaFlag = false;
    }
  });
});
