// Self-paced VA: a rejoining student's player is sent to their last answered question.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  VideoActivityPublicQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';

interface CapturedPlayerProps {
  seekRequest: { time: number; nonce: number } | null | undefined;
  startSeconds: number | undefined;
}

const { mockAuth, hookState, completeActivity, roleState, playerProps } =
  vi.hoisted(() => {
    const captured: CapturedPlayerProps = {
      seekRequest: undefined,
      startSeconds: undefined,
    };
    return {
      playerProps: captured,
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
    };
  });

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
  VideoPlayer: (props: {
    seekRequest?: { time: number; nonce: number } | null;
    startSeconds?: number;
  }) => {
    playerProps.seekRequest = props.seekRequest;
    playerProps.startSeconds = props.startSeconds;
    return null;
  },
}));

import { VideoActivityStudentApp } from '@/components/videoActivity/VideoActivityStudentApp';

const QUESTIONS = [
  { id: 'q1', timestamp: 120, text: 'Why?', type: 'MC', options: ['a', 'b'] },
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
  playerProps.seekRequest = undefined;
  playerProps.startSeconds = undefined;
  hookState.session = session();
  hookState.myResponse = response();
  window.history.replaceState({}, '', '/activity/session-1');
});

describe('VideoActivityStudentApp: resume', () => {
  it('sends the player to the last answered question', async () => {
    render(<VideoActivityStudentApp />);
    await waitFor(() =>
      expect(playerProps.seekRequest).toMatchObject({ time: 120 })
    );
  });

  it('starts the player at the last answered question', async () => {
    render(<VideoActivityStudentApp />);
    await waitFor(() => expect(playerProps.startSeconds).toBe(120));
  });

  it('sends no seek when nothing is answered', async () => {
    hookState.myResponse = { ...response(), answers: [] };
    render(<VideoActivityStudentApp />);
    await new Promise((r) => setTimeout(r, 50));
    expect(playerProps.seekRequest ?? null).toBeNull();
    expect(playerProps.startSeconds).toBeUndefined();
  });
});
