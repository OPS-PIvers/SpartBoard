import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { QuizQuestion } from '@/types';

const saveLast = vi.fn();
const saveLastVa = vi.fn();
let vaFlag = false;

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
    canAccessFeature: (id: string) => id === 'va-quiz-alignment' && vaFlag,
  }),
}));

vi.mock('@/hooks/useRosters', () => ({ useRosters: () => ({ rosters: [] }) }));
vi.mock('@/hooks/useRubrics', () => ({ useRubrics: () => ({ rubrics: [] }) }));
vi.mock('@/hooks/usePlcs', () => ({ usePlcs: () => ({ plcs: [] }) }));
vi.mock('@/hooks/useSetAssignmentTargets', () => ({
  useSetAssignmentTargets: () => ({ setAssignmentTargets: vi.fn() }),
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
const vaActivity = {
  id: 'va-1',
  title: 'My Video Activity',
  driveFileId: 'drive-va-1',
  youtubeUrl: 'https://youtu.be/x',
  questionCount: 1,
  createdAt: 1,
  updatedAt: 1,
};
vi.mock('@/hooks/useVideoActivity', () => ({
  useVideoActivity: () => ({
    activities: [vaActivity],
    loadActivityData: vi.fn(() => ({
      ...vaActivity,
      questions: [{ id: 'q1', points: 1 }],
    })),
    loading: false,
  }),
}));
const createVaAssignment = vi.fn((..._args: unknown[]) => ({ id: 'va-s1' }));
vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: () => ({
    createAssignment: createVaAssignment,
  }),
}));

import { LtiDeepLinkPicker } from '@/components/lti/LtiDeepLinkPicker';

describe('LtiDeepLinkPicker — assign stepper step bodies', () => {
  beforeEach(() => {
    signCallable.mockClear();
    createAssignment.mockClear();
    saveLast.mockClear();
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(
      () => undefined
    );
    window.history.pushState({}, '', '/lti/deep-link?lc=code-1');
  });

  it('shows the When and Quiz rule bodies and saves the rules on add', async () => {
    render(<LtiDeepLinkPicker />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
    fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));
    for (const name of [
      'When',
      'Attempts and order',
      'Quiz integrity',
      'What students see',
    ])
      expect(screen.getByRole('region', { name })).toBeTruthy();
    expect(screen.queryByLabelText(/due date \(optional\)/i)).toBeNull();
    expect(screen.queryByText('Manual')).toBeNull();
    // Schedule starts off, so no unsaved window or late-work switch shows.
    expect(screen.queryByText('Opens')).toBeNull();
    expect(
      screen.queryByRole('switch', { name: 'Allow submissions after close' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Shuffle questions' }));
    fireEvent.click(
      screen.getByRole('button', { name: /add quiz to schoology/i })
    );
    await waitFor(() => expect(signCallable).toHaveBeenCalled());
    const call = createAssignment.mock.calls.at(-1) as unknown[];
    const settings = call[1] as {
      sessionMode: string;
      sessionOptions: { shuffleQuestions?: boolean };
      dueAt?: number;
    };
    const options = call[2] as Record<string, unknown>;
    expect(settings.sessionMode).toBe('student');
    expect(settings.sessionOptions.shuffleQuestions).toBe(true);
    // An untouched When sets no window, so nothing closes tonight.
    expect(options.openAt).toBeNull();
    expect(options.closeAt).toBeNull();
    expect(settings.dueAt).toBeUndefined();
    expect(signCallable.mock.calls.at(-1)?.[0].dueAt).toBeUndefined();
    expect(saveLast).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionOptions: expect.objectContaining({ shuffleQuestions: true }),
      })
    );
  });
});

describe('LtiDeepLinkPicker — video activity rules (va-quiz-alignment)', () => {
  beforeEach(() => {
    signCallable.mockClear();
    createVaAssignment.mockClear();
    saveLastVa.mockClear();
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(
      () => undefined
    );
    window.history.pushState({}, '', '/lti/deep-link?lc=code-1');
  });

  it('flag on: the Video rule bodies set the session rules and save last-used', async () => {
    vaFlag = true;
    try {
      render(<LtiDeepLinkPicker />);
      fireEvent.click(
        await screen.findByRole('tab', { name: 'Video Activity' })
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Video Activity' })
      );
      fireEvent.click(
        await screen.findByRole('option', { name: 'My Video Activity' })
      );
      for (const name of ['Attempts and order', 'Video', 'Integrity'])
        expect(screen.getByRole('region', { name })).toBeTruthy();
      expect(screen.queryByText(/Inherits this activity/)).toBeNull();
      fireEvent.click(
        screen.getByRole('switch', { name: 'Autoplay after a question' })
      );
      fireEvent.click(
        screen.getByRole('button', { name: /add video activity to schoology/i })
      );
      await waitFor(() => expect(createVaAssignment).toHaveBeenCalled());
      const settings = (
        createVaAssignment.mock.calls.at(-1) as unknown[]
      )[1] as {
        sessionOptions: { answerRulesSet?: boolean };
        sessionSettings: { autoPlay: boolean };
      };
      expect(settings.sessionOptions.answerRulesSet).toBe(true);
      expect(settings.sessionSettings.autoPlay).toBe(true);
      expect(saveLastVa).toHaveBeenCalledOnce();
    } finally {
      vaFlag = false;
    }
  });

  it('flag off: keeps the read-only summary and the activity behavior', async () => {
    render(<LtiDeepLinkPicker />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Video Activity' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Video Activity' })
    );
    fireEvent.click(
      await screen.findByRole('option', { name: 'My Video Activity' })
    );
    expect(screen.getByText(/Inherits this activity/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Video' })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /add video activity to schoology/i })
    );
    await waitFor(() => expect(createVaAssignment).toHaveBeenCalled());
    const settings = (createVaAssignment.mock.calls.at(-1) as unknown[])[1] as {
      sessionOptions: { answerRulesSet?: boolean };
    };
    expect(settings.sessionOptions.answerRulesSet).toBeUndefined();
    expect(saveLastVa).not.toHaveBeenCalled();
  });
});

describe('LtiDeepLinkPicker — edited When', () => {
  beforeEach(() => {
    signCallable.mockClear();
    createAssignment.mockClear();
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(
      () => undefined
    );
    window.history.pushState({}, '', '/lti/deep-link?lc=code-1');
  });

  it('Schedule on sets the window and the line item due date', async () => {
    render(<LtiDeepLinkPicker />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quiz' }));
    fireEvent.click(await screen.findByRole('option', { name: 'My Quiz' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Schedule' }));
    expect(screen.getByText('Opens')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /add quiz to schoology/i })
    );
    await waitFor(() => expect(signCallable).toHaveBeenCalled());
    const call = createAssignment.mock.calls.at(-1) as unknown[];
    const settings = call[1] as { dueAt?: number };
    const options = call[2] as Record<string, unknown>;
    expect(typeof options.openAt).toBe('number');
    expect(typeof settings.dueAt).toBe('number');
    expect(signCallable.mock.calls.at(-1)?.[0].dueAt).toBe(settings.dueAt);
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
