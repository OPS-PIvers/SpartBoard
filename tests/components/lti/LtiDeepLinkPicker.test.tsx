import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizQuestion } from '@/types';

let availabilityOn = false;

const signCallable = vi.fn((_params: { dueAt?: number }) => ({
  data: { jwt: 'jwt-1', returnUrl: 'https://app.schoology.com/return' },
}));
const exchangeCallable = vi.fn(() => ({
  data: {
    isDeepLinking: true,
    contextId: 'ctx-1',
    contextTitle: 'Period 1',
    deepLinking: { deep_link_return_url: 'https://app.schoology.com/return' },
  },
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) =>
    name === 'ltiExchange' ? exchangeCallable : signCallable,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  updateDoc: vi.fn(() => undefined),
  setDoc: vi.fn(() => undefined),
}));

vi.mock('@/utils/googleSession', () => ({ isGoogleSession: () => true }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 't@example.com', displayName: 'T' },
    signInWithGoogle: vi.fn(),
    googleAccessToken: 'drive-token',
    canAccessFeature: (id: string) =>
      id === 'assign-availability' && availabilityOn,
  }),
}));

vi.mock('@/hooks/useRosters', () => ({ useRosters: () => ({ rosters: [] }) }));
vi.mock('@/hooks/useRubrics', () => ({ useRubrics: () => ({ rubrics: [] }) }));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [] }) }));
vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({ setAssignmentTargets: vi.fn() }),
}));
vi.mock('@/hooks/useLastQuizAssignSettings', () => ({
  useLastQuizAssignSettings: () => ({ lastUsed: null }),
}));

const loadQuizData = vi.fn(() => ({
  id: 'quiz-1',
  title: 'My Quiz',
  questions: [{ id: 'q1', type: 'MC', points: 1 } as unknown as QuizQuestion],
  createdAt: 0,
  updatedAt: 0,
}));
const createAssignment = vi.fn((..._args: unknown[]) => ({
  id: 'assign-1',
  code: 'ABC123',
}));

const bankContents = new Map<string, unknown>();
const saveDriveSnapshot = vi.fn((..._args: unknown[]) =>
  Promise.resolve('snapshot-file-1')
);
vi.mock('@/hooks/useBankSources', () => ({
  useBankSources: () => ({
    loadBankContentsForQuiz: () => Promise.resolve(bankContents),
  }),
}));

vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    quizzes: [
      {
        id: 'quiz-1',
        title: 'My Quiz',
        driveFileId: 'drive-file-1',
        questionCount: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    loadQuizData,
    saveDriveSnapshot,
    loading: false,
  }),
}));
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({
    createAssignment,
    setAssignmentTargetSkippedCount: vi.fn(),
  }),
}));
vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [],
    loadActivityData: vi.fn(),
    loading: false,
  }),
}));
vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({ createAssignment: vi.fn() }),
}));

import { LtiDeepLinkPicker } from '@/components/lti/LtiDeepLinkPicker';

describe('LtiDeepLinkPicker — availability', () => {
  beforeEach(() => {
    signCallable.mockClear();
    createAssignment.mockClear();
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(
      () => undefined
    );
    window.history.pushState({}, '', '/lti/deep-link?lc=code-1');
  });

  const pickQuiz = async () => {
    render(<LtiDeepLinkPicker />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
    fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));
  };

  const addQuiz = async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /add quiz to schoology/i })
    );
    await waitFor(() => expect(signCallable).toHaveBeenCalled());
    const call = createAssignment.mock.calls.at(-1) as unknown[];
    return {
      settings: call[1] as Record<string, unknown>,
      options: call[2] as Record<string, unknown>,
      signed: signCallable.mock.calls.at(-1)?.[0],
    };
  };

  it('flag off: the standalone due date drives the assignment and the line item', async () => {
    availabilityOn = false;
    await pickQuiz();
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: '2026-10-20' },
    });
    const { settings, options, signed } = await addQuiz();
    const expected = new Date(2026, 9, 20, 23, 59, 59, 0).getTime();
    expect(settings.dueAt).toBe(expected);
    expect(signed?.dueAt).toBe(expected);
    expect(options.openAt).toBeNull();
    expect(options.closeAt).toBeNull();
  });

  it('flag on: hides the standalone due date and uses the section window and due', async () => {
    availabilityOn = true;
    try {
      await pickQuiz();
      expect(screen.queryByLabelText(/due date \(optional\)/i)).toBeNull();
      const { settings, options, signed } = await addQuiz();
      expect(typeof options.openAt).toBe('number');
      expect(typeof options.closeAt).toBe('number');
      expect(settings.dueAt).toBe(options.closeAt);
      expect(settings.dueAtHasTime).toBe(true);
      expect(signed?.dueAt).toBe(options.closeAt);
    } finally {
      availabilityOn = false;
    }
  });
});

describe('LtiDeepLinkPicker — question bank quizzes', () => {
  beforeEach(() => {
    signCallable.mockClear();
    createAssignment.mockClear();
    saveDriveSnapshot.mockClear();
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(
      () => undefined
    );
    window.history.pushState({}, '', '/lti/deep-link?lc=code-1');
  });

  it('assigns the bank pool and slots instead of an empty quiz', async () => {
    const bankQ = (id: string) =>
      ({
        id,
        type: 'MC',
        text: id,
        correctAnswer: 'a',
        incorrectAnswers: ['b'],
      }) as unknown as QuizQuestion;
    bankContents.set('bank-1', {
      id: 'bank-1',
      title: 'Vocab bank',
      questions: [bankQ('b1'), bankQ('b2'), bankQ('b3')],
    });
    loadQuizData.mockImplementationOnce(() => ({
      id: 'quiz-1',
      title: 'My Quiz',
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
      createdAt: 0,
      updatedAt: 0,
    }));
    try {
      render(<LtiDeepLinkPicker />);
      fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
      fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));
      fireEvent.click(
        screen.getByRole('button', { name: /add quiz to schoology/i })
      );
      await waitFor(() => expect(signCallable).toHaveBeenCalled());
      const call = createAssignment.mock.calls.at(-1) as unknown[];
      const quiz = call[0] as { driveFileId: string; questions: unknown[] };
      const settings = call[1] as Record<string, unknown>;
      const options = call[2] as Record<string, unknown>;
      expect(quiz.questions).toHaveLength(3);
      expect(quiz.driveFileId).toBe('snapshot-file-1');
      expect(settings.resolvedDriveFileId).toBe('snapshot-file-1');
      expect(options.bankSlots).toHaveLength(1);
      expect(saveDriveSnapshot).toHaveBeenCalledOnce();
    } finally {
      bankContents.clear();
    }
  });
});
