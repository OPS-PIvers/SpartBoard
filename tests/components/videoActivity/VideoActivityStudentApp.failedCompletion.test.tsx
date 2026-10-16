// Self-paced VA: a failed completion write keeps the student on the activity with Finish to retry.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  VideoActivityPublicQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';

const { mockAuth, hookState, completeActivity } = vi.hoisted(() => ({
  mockAuth: {
    authStateReady: vi.fn().mockResolvedValue(undefined),
    currentUser: {
      uid: 'sso-uid-1',
      isAnonymous: false,
      getIdTokenResult: () =>
        Promise.resolve({ claims: { studentRole: true, classIds: ['A'] } }),
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
  hookState.session = session();
  hookState.myResponse = response();
  window.history.replaceState({}, '', '/activity/session-1');
});

describe('VideoActivityStudentApp: failed completion', () => {
  it('offers Finish instead of a false completion screen, and retries', async () => {
    completeActivity
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    render(<VideoActivityStudentApp />);
    fireEvent.click(await screen.findByText('End video'));

    const finish = await screen.findByText('Finish activity');
    expect(screen.queryByText('Activity Complete!')).toBeNull();
    expect(completeActivity).toHaveBeenCalledTimes(1);

    fireEvent.click(finish);
    await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Activity Complete!')).toBeInTheDocument();
  });

  it('shows the completion screen when the write succeeds', async () => {
    completeActivity.mockResolvedValueOnce(undefined);
    render(<VideoActivityStudentApp />);
    fireEvent.click(await screen.findByText('End video'));
    expect(await screen.findByText('Activity Complete!')).toBeInTheDocument();
    expect(screen.queryByText('Finish activity')).toBeNull();
  });
});
