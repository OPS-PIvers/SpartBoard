// Mini App results v2 in the student runner (docs/plans/MINI_APP_RESULTS.md D2, D6, D8): v2 sessions
// get the helper and submit through the callable; v1 and view-only sessions are untouched.
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  summary: null as Record<string, unknown> | null,
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
  submit: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ data: { attempt: 1, attemptsLeft: 0 } })
  ),
}));

vi.mock('@/config/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'uid-1',
      getIdTokenResult: () => Promise.resolve({ claims: {} }),
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
  httpsCallable: (_f: unknown, name: string) =>
    name === 'submitMiniAppResultV1'
      ? h.submit
      : () => Promise.resolve({ data: { pseudonym: 'ps-1' } }),
}));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn((path: string) =>
    Promise.resolve(
      path.includes('/submissions/') && h.summary
        ? { exists: () => true, data: () => h.summary }
        : { exists: () => false }
    )
  ),
  serverTimestamp: vi.fn(),
  setDoc: h.setDoc,
  onSnapshot: vi.fn((_path: string, next: (snap: unknown) => void) => {
    next({ exists: () => true, data: () => h.session });
    return () => undefined;
  }),
}));

import { MiniAppStudentApp } from '@/components/miniApp/MiniAppStudentApp';

const APP =
  '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>';

const session = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  appId: 'app-1',
  appTitle: 'Fractions',
  appHtml: APP,
  teacherUid: 't1',
  assignmentName: 'Fractions',
  status: 'active',
  createdAt: 0,
  mode: 'submissions',
  submissionsEnabled: true,
  ...over,
});

async function mountFrame() {
  const view = render(<MiniAppStudentApp />);
  const iframe = await waitFor(() => {
    const el = view.container.querySelector('iframe');
    expect(el).not.toBeNull();
    return el as HTMLIFrameElement;
  });
  const postMessage = vi.fn();
  const frameWindow = { postMessage } as unknown as Window;
  Object.defineProperty(iframe, 'contentWindow', { value: frameWindow });
  // Let the runner's message listener and summary check settle.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return { ...view, iframe, frameWindow, postMessage };
}

const post = (source: Window, data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { source, data }));
  });

beforeEach(() => {
  window.history.pushState({}, '', '/miniapp/session-1');
  h.summary = null;
  h.setDoc.mockClear();
  h.submit.mockReset();
  h.submit.mockResolvedValue({ data: { attempt: 1, attemptsLeft: 0 } });
});

describe('v1 sessions are unchanged', () => {
  it('runs the app as-is and writes a legacy result directly', async () => {
    h.session = session();
    const { iframe, frameWindow, postMessage } = await mountFrame();
    expect(iframe.getAttribute('srcdoc')).toBe(APP);

    iframe.dispatchEvent(new Event('load'));
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'SPART_MINIAPP_INIT',
        payload: { submissionsEnabled: true, timeMultiplier: undefined },
      },
      '*'
    );

    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { score: 3 } });
    await waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(1));
    expect(h.submit).not.toHaveBeenCalled();
  });

  it('ignores helper submit messages', async () => {
    h.session = session();
    const { frameWindow } = await mountFrame();
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: { items: [] },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('never injects the helper into a view-only share', async () => {
    h.session = session({
      mode: 'view-only',
      submissionsEnabled: false,
      resultsVersion: 2,
    });
    const { iframe, frameWindow } = await mountFrame();
    expect(iframe.getAttribute('srcdoc')).toBe(APP);
    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { score: 3 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.setDoc).not.toHaveBeenCalled();
  });
});

describe('v2 sessions', () => {
  it('injects the helper inside the head, after the doctype', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: 1 });
    const { iframe } = await mountFrame();
    const doc = iframe.getAttribute('srcdoc') ?? '';
    expect(
      doc.startsWith('<!DOCTYPE html><html><head><script data-spart-helper')
    ).toBe(true);
    expect(doc).toContain('window.SpartBoard');
  });

  it('sends attemptsLeft with INIT', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: 2 });
    const { iframe, postMessage } = await mountFrame();
    iframe.dispatchEvent(new Event('load'));
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'SPART_MINIAPP_INIT',
        payload: {
          submissionsEnabled: true,
          timeMultiplier: undefined,
          attemptsLeft: 2,
        },
      },
      '*'
    );
  });

  it('submits through the callable and answers the frame', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: 2 });
    h.submit.mockResolvedValue({
      data: { attempt: 1, attemptsLeft: 1, score: 1, maxScore: 1 },
    });
    const { frameWindow, postMessage } = await mountFrame();
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: { items: [{ id: 'q1', answer: 'B' }] },
    });
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        {
          type: 'SPART_MINIAPP_SUBMIT_RESULT',
          requestId: 'r1',
          ok: true,
          result: { attempt: 1, attemptsLeft: 1, score: 1, maxScore: 1 },
        },
        '*'
      )
    );
    expect(h.submit).toHaveBeenCalledWith({
      sessionId: 'session-1',
      kind: 'result',
      payload: { items: [{ id: 'q1', answer: 'B' }] },
    });
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('routes an old app message through the callable as legacy', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: null });
    const { frameWindow } = await mountFrame();
    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { score: 3 } });
    await waitFor(() =>
      expect(h.submit).toHaveBeenCalledWith({
        sessionId: 'session-1',
        kind: 'legacy',
        payload: { score: 3 },
      })
    );
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('turns in when the server says the attempts are used up', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: 1 });
    h.submit.mockRejectedValue(
      Object.assign(new Error('attempts-exhausted'), {
        code: 'functions/resource-exhausted',
      })
    );
    const { frameWindow, postMessage } = await mountFrame();
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: { items: [] },
    });
    expect(await screen.findByText('Turned in')).toBeInTheDocument();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SPART_MINIAPP_SUBMIT_RESULT',
        requestId: 'r1',
        ok: false,
        error: expect.objectContaining({ code: 'attempts-exhausted' }),
      }),
      '*'
    );
  });

  it('shows Turned in to a returning student with no attempts left', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: 1 });
    h.summary = { studentUid: 'uid-1', attemptCount: 1, payload: {} };
    render(<MiniAppStudentApp />);
    expect(await screen.findByText('Turned in')).toBeInTheDocument();
  });
});
