// Score-only publish: a response the publish kept right/wrong off shows only the published score.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  VideoActivityPublicQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';

const { mockAuth, hookState, completeActivity, roleState } = vi.hoisted(() => ({
  roleState: { studentRole: true },
  mockAuth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: {
      uid: 'sso-uid-1',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({
          claims: roleState.studentRole
            ? { studentRole: true, classIds: ['A'] }
            : {},
        }),
    },
  },
  hookState: {
    session: null as import('@/types').VideoActivitySession | null,
    myResponse: null as import('@/types').VideoActivityResponse | null,
    contentPending: false,
    retakePending: false,
  },
  completeActivity: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  isConfigured: false,
  isAuthBypass: false,
  app: {},
  db: {},
  auth: mockAuth,
  storage: {},
  functions: {},
  GOOGLE_OAUTH_SCOPES: [] as string[],
  googleProvider: {},
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue(undefined),
  onAuthStateChanged: vi.fn(() => () => undefined),
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => ({})),
  addDoc: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/hooks/useStudentAssignmentPointer', () => ({
  useStudentAssignmentPointer: () => null,
}));

vi.mock('@/hooks/useVideoActivitySession', () => ({
  useVideoActivitySessionStudent: () => ({
    session: hookState.session,
    myResponse: hookState.myResponse,
    joinStatus: 'joined',
    error: null,
    lookupSession: vi.fn(),
    joinSession: vi.fn(),
    submitAnswer: vi.fn(),
    checkAnswer: vi.fn(),
    completeActivity,
    reportTabSwitch: vi.fn(),
    periodKeys: ['A'],
    contentPending: hookState.contentPending,
    retakePending: hookState.retakePending,
  }),
}));

vi.mock('@/components/videoActivity/VideoPlayer', () => ({
  VideoPlayer: (props: { onVideoEnd: () => void }) =>
    React.createElement(
      'button',
      { onClick: () => props.onVideoEnd() },
      'End video'
    ),
}));

import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';

const QUESTIONS = [
  { id: 'q1', timestamp: 5, text: 'Why?', type: 'MC', options: ['a', 'b'] },
] as VideoActivityPublicQuestion[];

const session = (): VideoActivitySession =>
  ({
    id: 'session-1',
    activityId: 'act-1',
    activityTitle: 'Mitosis clip',
    teacherUid: 't1',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [],
    publicQuestions: QUESTIONS,
    status: 'active',
    allowedPins: [],
    createdAt: 1,
    sessionOptions: { tabWarningsEnabled: false },
  }) as unknown as VideoActivitySession;

const response = (): VideoActivityResponse => ({
  studentUid: 'sso-uid-1',
  joinedAt: 1,
  answers: [{ questionId: 'q1', answer: 'a', answeredAt: 2 }],
  completedAt: null,
  score: null,
  completedAttempts: 0,
  tabSwitchWarnings: 0,
  classId: 'A',
});

beforeEach(() => {
  vi.clearAllMocks();
  roleState.studentRole = true;
  hookState.session = session();
  hookState.myResponse = response();
  window.history.replaceState({}, '', '/activity/session-1');
});

const published = (extra: Partial<VideoActivityResponse>) => {
  hookState.session = {
    ...session(),
    scoreVisibility: 'score-only',
    scorePublishedAt: 3,
  };
  hookState.myResponse = {
    ...response(),
    completedAt: 3,
    completedAttempts: 1,
    ...extra,
  };
};

describe('VideoActivityStudentApp: score-only completion', () => {
  it('counts right answers when the publish kept verdicts', async () => {
    published({
      score: 100,
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: 2, isCorrect: true },
      ],
    });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('1 of 1 correct')).toBeInTheDocument();
  });

  it('shows only the published score when verdicts were withheld', async () => {
    published({ score: 80, verdictsWithheld: true });
    render(<VideoActivityStudentApp />);
    expect(await screen.findByText('80%')).toBeInTheDocument();
    expect(screen.queryByText(/correct$/)).toBeNull();
  });

  it('says marking is pending when a withheld publish has no score yet', async () => {
    published({ score: null, verdictsWithheld: true });
    render(<VideoActivityStudentApp />);
    expect(
      await screen.findByText('Your teacher is still marking your answers.')
    ).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
  });
});
