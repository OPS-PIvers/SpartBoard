// Mini App student view of an ended assignment whose results the teacher published.
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Snap = { exists: () => boolean; data?: () => unknown };

const h = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  published: null as Record<string, unknown> | null,
  studentRole: true,
  paths: [] as string[],
}));

vi.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'uid-1',
      getIdTokenResult: () =>
        Promise.resolve({
          claims: h.studentRole ? { studentRole: true, classIds: [] } : {},
        }),
    },
    authStateReady: () => Promise.resolve(),
  },
  db: {},
  functions: {},
}));
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn(),
  onAuthStateChanged: (_a: unknown, cb: (u: { uid: string }) => void) => {
    cb({ uid: 'uid-1' });
    return () => undefined;
  },
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: { pseudonym: 'ps-1' } }),
}));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn((path: string): Promise<Snap> => {
    h.paths.push(path);
    if (path.includes('/published/') && h.published) {
      const published = h.published;
      return Promise.resolve({ exists: () => true, data: () => published });
    }
    return Promise.resolve({ exists: () => false });
  }),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn((_path: string, next: (snap: Snap) => void) => {
    const data = h.session;
    next({ exists: () => data !== null, data: () => data });
    return () => undefined;
  }),
}));

import { MiniAppStudentApp } from '@/components/miniApp/MiniAppStudentApp';

const session = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  appId: 'app-1',
  appTitle: 'Fractions',
  appHtml: '<html></html>',
  teacherUid: 't1',
  assignmentName: 'Fractions',
  status: 'ended',
  createdAt: 0,
  mode: 'submissions',
  resultsVersion: 2,
  ...over,
});

beforeEach(() => {
  window.history.pushState({}, '', '/miniapp/session-1');
  h.session = null;
  h.published = null;
  h.studentRole = true;
  h.paths = [];
});

describe('published Mini App results', () => {
  it('shows the student their own copy with answers and the correct answer', async () => {
    h.session = session({
      scoreVisibility: 'score-responses-and-answers',
      scorePublishedAt: 5,
    });
    h.published = {
      studentUid: 'uid-1',
      visibility: 'score-responses-and-answers',
      publishedAt: 5,
      score: 1,
      maxScore: 2,
      correctCount: 1,
      gradedCount: 2,
      items: [
        { id: 'q1', prompt: 'Which is larger?', answer: '3/4', correct: true },
        {
          id: 'q2',
          prompt: '3/4 of 20',
          answer: 12,
          correct: false,
          correctAnswer: '15',
        },
      ],
    };
    render(<MiniAppStudentApp />);
    expect(await screen.findByText('Your results')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 correct')).toBeInTheDocument();
    expect(screen.getByText('Correct answer: 15')).toBeInTheDocument();
    expect(h.paths).toContain('mini_app_sessions/session-1/published/ps-1');
  });

  it('shows what an older app sent, with its score from the app', async () => {
    h.session = session({
      scoreVisibility: 'score-and-responses',
      scorePublishedAt: 5,
    });
    h.published = {
      studentUid: 'uid-1',
      visibility: 'score-and-responses',
      publishedAt: 5,
      score: 4,
      maxScore: 5,
      gradedBy: 'app',
      details: { levelReached: 4 },
    };
    render(<MiniAppStudentApp />);
    expect(await screen.findByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('Score from the app')).toBeInTheDocument();
    expect(screen.getByText('What you sent')).toBeInTheDocument();
    expect(screen.getByText('Level reached')).toBeInTheDocument();
  });

  it('keeps the ended screen when nothing was published for this student', async () => {
    h.session = session({ scoreVisibility: 'score-only', scorePublishedAt: 5 });
    render(<MiniAppStudentApp />);
    expect(await screen.findByText('Session Ended')).toBeInTheDocument();
  });

  it('never reads a published copy when results are not published', async () => {
    h.session = session({ scoreVisibility: 'none' });
    render(<MiniAppStudentApp />);
    expect(await screen.findByText('Session Ended')).toBeInTheDocument();
    expect(h.paths.some((p) => p.includes('/published/'))).toBe(false);
  });
});
