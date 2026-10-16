// Mini App student view lifecycle: end, reconnect, saves, turn-in and exclusion, pinned before the reducer refactor.
import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Snap = { exists: () => boolean; data?: () => unknown };

const h = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  summary: null as Record<string, unknown> | null,
  pointer: null as Record<string, unknown> | null,
  studentRole: false,
  emit: null as ((snap: Snap) => void) | null,
  emitError: null as ((err: unknown) => void) | null,
  setDoc: vi.fn((..._args: unknown[]) => Promise.resolve()),
  submit: vi.fn(
    (..._args: unknown[]): Promise<{ data: Record<string, unknown> }> =>
      Promise.resolve({ data: { attempt: 1, attemptsLeft: 0 } })
  ),
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
  httpsCallable: (_f: unknown, name: string) =>
    name === 'submitMiniAppResultV1'
      ? h.submit
      : () => Promise.resolve({ data: { pseudonym: 'ps-1' } }),
}));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(() => Promise.resolve()),
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn((path: string): Promise<Snap> => {
    if (path.includes('/submissions/') && h.summary) {
      const summary = h.summary;
      return Promise.resolve({ exists: () => true, data: () => summary });
    }
    if (path.startsWith('student_assignments/') && h.pointer) {
      const pointer = h.pointer;
      return Promise.resolve({ exists: () => true, data: () => pointer });
    }
    return Promise.resolve({ exists: () => false });
  }),
  serverTimestamp: vi.fn(),
  setDoc: h.setDoc,
  onSnapshot: vi.fn(
    (
      _path: string,
      next: (snap: Snap) => void,
      error: (err: unknown) => void
    ) => {
      h.emit = next;
      h.emitError = error;
      if (h.session) {
        const first = h.session;
        next({ exists: () => true, data: () => first });
      }
      return () => undefined;
    }
  ),
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

const emitSession = (data: Record<string, unknown>) =>
  act(() => {
    h.emit?.({ exists: () => true, data: () => data });
  });

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
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
  await settle();
  return { ...view, iframe, frameWindow, postMessage };
}

const post = (source: Window, data: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { source, data }));
  });

const result = (payload: unknown) => ({
  type: 'SPART_MINIAPP_RESULT',
  payload,
});

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (err: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.history.pushState({}, '', '/miniapp/session-1');
  h.session = null;
  h.summary = null;
  h.pointer = null;
  h.studentRole = false;
  h.emit = null;
  h.emitError = null;
  h.setDoc.mockReset();
  h.setDoc.mockResolvedValue(undefined);
  h.submit.mockReset();
  h.submit.mockResolvedValue({ data: { attempt: 1, attemptsLeft: 0 } });
});

describe('session lifecycle', () => {
  it('shows the ended screen to a student who reconnects after the end', async () => {
    h.session = session({ status: 'ended' });
    const view = render(<MiniAppStudentApp />);
    expect(await screen.findByText('Session Ended')).toBeInTheDocument();
    expect(view.container.querySelector('iframe')).toBeNull();
  });

  it('swaps the app for the ended screen when the teacher ends it', async () => {
    h.session = session();
    const { container } = await mountFrame();
    emitSession(session({ status: 'ended' }));
    expect(screen.getByText('Session Ended')).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('remounts the app with a fresh view when the teacher reopens it', async () => {
    h.session = session();
    const { frameWindow } = await mountFrame();
    post(frameWindow, result({ step: 1 }));
    await waitFor(() =>
      expect(screen.queryByLabelText('Mark this assignment as done')).toBeNull()
    );
    emitSession(session({ status: 'ended' }));
    emitSession(session());
    await settle();
    expect(document.querySelector('iframe')).not.toBeNull();
    // A fresh view re-reads the submission doc; none exists here, so I'm Done returns.
    expect(
      screen.getByLabelText('Mark this assignment as done')
    ).toBeInTheDocument();
  });

  it('teacher ends while a save is in flight: the ended screen wins and a late failure is not shown', async () => {
    h.session = session();
    const write = deferred();
    h.setDoc.mockImplementationOnce(() => write.promise);
    const { frameWindow } = await mountFrame();
    post(frameWindow, result({ step: 1 }));
    expect(await screen.findByText('Saving your answer…')).toBeInTheDocument();

    emitSession(session({ status: 'ended' }));
    expect(screen.getByText('Session Ended')).toBeInTheDocument();

    await act(async () => {
      write.reject(new Error('permission-denied'));
      await write.promise.catch(() => undefined);
    });
    await settle();
    expect(screen.getByText('Session Ended')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('teacher ends while a v2 submit is in flight: the ended screen wins', async () => {
    h.session = session({ resultsVersion: 2 });
    let fail: (err: unknown) => void = () => undefined;
    h.submit.mockImplementationOnce(
      () =>
        new Promise((_r, rej) => {
          fail = rej;
        })
    );
    const { frameWindow } = await mountFrame();
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: { items: [] },
    });
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    emitSession(session({ resultsVersion: 2, status: 'ended' }));
    await act(async () => {
      fail({ code: 'functions/failed-precondition' });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByText('Session Ended')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows not found for a missing session, and keeps it after a listener error', async () => {
    render(<MiniAppStudentApp />);
    await waitFor(() => expect(h.emit).not.toBeNull());
    act(() => {
      h.emit?.({ exists: () => false });
    });
    expect(screen.getByText(/Activity not found/)).toBeInTheDocument();
    act(() => {
      h.emitError?.(new Error('offline'));
    });
    expect(screen.getByText(/Activity not found/)).toBeInTheDocument();
  });

  it('keeps not found even if the doc appears afterwards', async () => {
    render(<MiniAppStudentApp />);
    await waitFor(() => expect(h.emit).not.toBeNull());
    act(() => {
      h.emit?.({ exists: () => false });
    });
    emitSession(session());
    expect(screen.getByText(/Activity not found/)).toBeInTheDocument();
  });
});

describe('saves', () => {
  it('shows Saved, hides I am Done, then clears the toast', async () => {
    h.session = session();
    const { frameWindow } = await mountFrame();
    post(frameWindow, result({ step: 1 }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mark this assignment as done')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Saved')).toBeNull(), {
      timeout: 5000,
    });
    expect(screen.queryByLabelText('Mark this assignment as done')).toBeNull();
  });

  it('shows an error with Retry, and a retry that works saves', async () => {
    h.session = session();
    h.setDoc.mockRejectedValueOnce(new Error('offline'));
    const { frameWindow } = await mountFrame();
    post(frameWindow, result({ step: 1 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save your answer."
    );
    // Failure leaves I'm Done available.
    expect(
      screen.getByLabelText('Mark this assignment as done')
    ).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: /Retry/ }).click();
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(h.setDoc).toHaveBeenCalledTimes(2);
    expect(h.setDoc.mock.calls[1][1]).toMatchObject({
      payload: { step: 1 },
    });
  });

  it('v2 retry resends with the same kind but no request id', async () => {
    h.session = session({ resultsVersion: 2 });
    h.submit.mockRejectedValueOnce({ code: 'functions/unavailable' });
    const { frameWindow } = await mountFrame();
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: { items: [1] },
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    act(() => {
      screen.getByRole('button', { name: /Retry/ }).click();
    });
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(2));
    expect(h.submit.mock.calls[1][0]).toMatchObject({
      kind: 'result',
      payload: { items: [1] },
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('v2 invalid result goes quietly back to idle', async () => {
    h.session = session({ resultsVersion: 2 });
    h.submit.mockRejectedValueOnce({ code: 'functions/invalid-argument' });
    const { frameWindow } = await mountFrame();
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: {},
    });
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Saving your answer…')).toBeNull();
    expect(
      screen.getByLabelText('Mark this assignment as done')
    ).toBeInTheDocument();
  });

  it('I am Done writes the marker and hides itself; a failure brings it back', async () => {
    h.session = session();
    h.setDoc.mockRejectedValueOnce(new Error('offline'));
    await mountFrame();
    act(() => {
      screen.getByLabelText('Mark this assignment as done').click();
    });
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByLabelText('Mark this assignment as done')
    ).toBeInTheDocument();
    act(() => {
      screen.getByLabelText('Mark this assignment as done').click();
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(h.setDoc.mock.calls[1][1]).toMatchObject({
      payload: { completed: true },
    });
    expect(screen.queryByLabelText('Mark this assignment as done')).toBeNull();
  });

  it('hides I am Done for a returning student who already submitted', async () => {
    h.session = session();
    h.summary = { submittedAt: 1, studentUid: 'uid-1', payload: {} };
    await mountFrame();
    expect(screen.queryByLabelText('Mark this assignment as done')).toBeNull();
  });

  it('a returning v1 student with a large attempt count is not turned in', async () => {
    h.session = session({ attemptLimit: 1 });
    h.summary = { attemptCount: 5, payload: {} };
    const { container } = await mountFrame();
    expect(container.querySelector('iframe')).not.toBeNull();
    expect(screen.queryByText('Turned in')).toBeNull();
  });
});

describe('turn-in and exclusion', () => {
  it('a v2 returning student under the limit keeps the app with attempts left', async () => {
    h.session = session({ resultsVersion: 2, attemptLimit: 3 });
    h.summary = { attemptCount: 1, payload: {} };
    const { postMessage, iframe } = await mountFrame();
    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'SPART_MINIAPP_INIT',
        payload: expect.objectContaining({ attemptsLeft: 2 }),
      }),
      '*'
    );
  });

  it('shows the excluded notice to a skipped student, even with attempts used up', async () => {
    h.studentRole = true;
    h.pointer = { excluded: true };
    h.session = session({ resultsVersion: 2, attemptLimit: 1 });
    h.summary = { attemptCount: 1, payload: {} };
    const view = render(<MiniAppStudentApp />);
    await settle();
    await settle();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(view.container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('Turned in')).toBeNull();
  });
});
