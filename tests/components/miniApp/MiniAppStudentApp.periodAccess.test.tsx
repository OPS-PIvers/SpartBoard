// Per-period Mini-app sessions: the student is seated in their period, sees a locked card
// (no app) until it opens, and a paused overlay that holds submissions if it closes mid-activity.
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiniAppSession, PeriodAccess } from '@/types';

const NOW = 1_800_000_000_000;

const h = vi.hoisted(() => ({
  claims: {} as Record<string, unknown>,
  session: null as Record<string, unknown> | null,
  contentReadable: false,
  sessionListener: null as ((snap: unknown) => void) | null,
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'uid-1',
      getIdTokenResult: () => Promise.resolve({ claims: h.claims }),
    },
    authStateReady: () => Promise.resolve(),
  },
  db: {},
  functions: {},
}));
vi.mock('@/utils/serverTime', () => ({ getServerNow: () => NOW }));
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
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  serverTimestamp: vi.fn(),
  setDoc: h.setDoc,
  onSnapshot: vi.fn(
    (
      path: string,
      next: (snap: unknown) => void,
      error: (err: unknown) => void
    ) => {
      if (path.endsWith('/content/app')) {
        if (h.contentReadable)
          next({
            exists: () => true,
            data: () => ({ appHtml: '<html>the app</html>' }),
          });
        else error({ code: 'permission-denied' });
        return () => undefined;
      }
      h.sessionListener = next;
      next({ exists: () => true, data: () => h.session });
      return () => undefined;
    }
  ),
}));

import { MiniAppStudentApp } from '@/components/miniApp/MiniAppStudentApp';

const period = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'open',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P1',
  ...over,
});

const session = (over: Partial<MiniAppSession> = {}) =>
  ({
    id: 'session-1',
    appId: 'app-1',
    appTitle: 'Fractions',
    appHtml: '',
    teacherUid: 't1',
    assignmentName: 'Fractions',
    status: 'active',
    createdAt: 0,
    submissionsEnabled: true,
    mode: 'submissions',
    appInContent: true,
    accessMode: 'assignment',
    periodAccess: { A: period(), B: period({ label: 'P3' }) },
    ...over,
  }) as MiniAppSession;

function pushSession(next: MiniAppSession) {
  h.session = next as unknown as Record<string, unknown>;
  act(() => {
    h.sessionListener?.({ exists: () => true, data: () => h.session });
  });
}

const seatWrites = () =>
  h.setDoc.mock.calls.filter(([ref]) => String(ref).includes('/seats/'));
const submissionWrites = () =>
  h.setDoc.mock.calls.filter(([ref]) => String(ref).includes('/submissions/'));

beforeEach(() => {
  vi.clearAllMocks();
  h.claims = { studentRole: true, classIds: ['A'] };
  h.contentReadable = false;
  h.session = null;
  window.history.pushState({}, '', '/miniapp/session-1');
});

describe('MiniAppStudentApp — per-period access', () => {
  it('seats a signed-in student from their class claim and shows a locked card with no app', async () => {
    h.session = session({
      periodAccess: { A: period({ state: 'closed' }), B: period() },
    }) as unknown as Record<string, unknown>;
    const { container } = render(<MiniAppStudentApp />);
    expect(await screen.findByText('Not open yet')).toBeInTheDocument();
    expect(seatWrites()).toEqual([
      ['mini_app_sessions/session-1/seats/uid-1', { classId: 'A' }],
    ]);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('loads the app from the content doc once the period is open', async () => {
    h.session = session() as unknown as Record<string, unknown>;
    h.contentReadable = true;
    const { container } = render(<MiniAppStudentApp />);
    await waitFor(() =>
      expect(container.querySelector('iframe')).not.toBeNull()
    );
    expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe(
      '<html>the app</html>'
    );
  });

  it('asks an anonymous student for a sign-in in assessment mode, without a seat', async () => {
    h.claims = {};
    h.session = session({ accessMode: 'assessment' }) as unknown as Record<
      string,
      unknown
    >;
    render(<MiniAppStudentApp />);
    expect(
      await screen.findByText(/needs your school sign-in/i)
    ).toBeInTheDocument();
    expect(seatWrites()).toHaveLength(0);
  });

  it('lets an anonymous student pick their period in assignment mode', async () => {
    h.claims = {};
    h.session = session() as unknown as Record<string, unknown>;
    render(<MiniAppStudentApp />);
    fireEvent.click(await screen.findByRole('button', { name: 'P3' }));
    await waitFor(() =>
      expect(seatWrites()).toEqual([
        ['mini_app_sessions/session-1/seats/uid-1', { classId: 'B' }],
      ])
    );
  });

  it('pauses in place and holds a submission while the period is shut, then sends it', async () => {
    h.session = session() as unknown as Record<string, unknown>;
    h.contentReadable = true;
    const { container } = render(<MiniAppStudentApp />);
    const iframe = await waitFor(() => {
      const el = container.querySelector('iframe');
      expect(el).not.toBeNull();
      return el as HTMLIFrameElement;
    });
    const frameWindow = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: frameWindow });

    pushSession(
      session({ periodAccess: { A: period({ state: 'paused' }), B: period() } })
    );
    expect(
      await screen.findByText('Paused for your class')
    ).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBe(iframe);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frameWindow,
          data: { type: 'SPART_MINIAPP_RESULT', payload: { score: 3 } },
        })
      );
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(submissionWrites()).toHaveLength(0);

    pushSession(session());
    await waitFor(() => expect(submissionWrites()).toHaveLength(1));
    expect(submissionWrites()[0][1]).toMatchObject({ payload: { score: 3 } });
    expect(screen.queryByText('Paused for your class')).toBeNull();
  });

  it('leaves a legacy session alone: no seat, app straight from the session', async () => {
    h.session = session({
      appInContent: undefined,
      accessMode: undefined,
      periodAccess: undefined,
      appHtml: '<html>legacy</html>',
    }) as unknown as Record<string, unknown>;
    const { container } = render(<MiniAppStudentApp />);
    await waitFor(() =>
      expect(container.querySelector('iframe')?.getAttribute('srcdoc')).toBe(
        '<html>legacy</html>'
      )
    );
    expect(seatWrites()).toHaveLength(0);
  });
});
