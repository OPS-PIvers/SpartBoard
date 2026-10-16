// Mini App runner keeps the newest app post that lands while an earlier one is still saving
// (widget state audit MA-4): it saves next instead of being dropped.
import '@testing-library/jest-dom';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  session: null as Record<string, unknown> | null,
  summary: null as Record<string, unknown> | null,
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
  getDoc: vi.fn(
    (path: string): Promise<{ exists: () => boolean; data?: () => unknown }> =>
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
  h.setDoc.mockReset();
  h.setDoc.mockResolvedValue(undefined);
  h.submit.mockReset();
  h.submit.mockResolvedValue({ data: { attempt: 1, attemptsLeft: 0 } });
});

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('posts that land mid-save', () => {
  it('v1 saves the newest queued payload after the in-flight write', async () => {
    h.session = session();
    const first = deferred();
    h.setDoc.mockImplementationOnce(() => first.promise);
    const { frameWindow } = await mountFrame();

    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { step: 1 } });
    await waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(1));
    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { step: 2 } });
    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { step: 3 } });
    expect(h.setDoc).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    await waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(2));
    expect(h.setDoc.mock.calls[1][1]).toMatchObject({ payload: { step: 3 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.setDoc).toHaveBeenCalledTimes(2);
  });

  it('v2 sends the newest queued legacy post after the in-flight call', async () => {
    h.session = session({ resultsVersion: 2 });
    let release: () => void = () => undefined;
    h.submit.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = () => r({ data: { attempt: 0, attemptsLeft: null } });
        })
    );
    const { frameWindow } = await mountFrame();

    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { step: 1 } });
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(1));
    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { step: 2 } });
    post(frameWindow, { type: 'SPART_MINIAPP_RESULT', payload: { step: 3 } });
    expect(h.submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(h.submit).toHaveBeenCalledTimes(2));
    expect(h.submit.mock.calls[1][0]).toMatchObject({
      kind: 'legacy',
      payload: { step: 3 },
    });
  });

  it('v2 still answers busy to a helper submit while saving', async () => {
    h.session = session({ resultsVersion: 2 });
    let release: () => void = () => undefined;
    h.submit.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = () => r({ data: { attempt: 1, attemptsLeft: null } });
        })
    );
    const { frameWindow, postMessage } = await mountFrame();

    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r1',
      payload: { items: [] },
    });
    post(frameWindow, {
      type: 'SPART_MINIAPP_SUBMIT',
      requestId: 'r2',
      payload: { items: [] },
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'r2',
        ok: false,
        error: expect.objectContaining({ code: 'busy' }),
      }),
      '*'
    );
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.submit).toHaveBeenCalledTimes(1);
  });
});
