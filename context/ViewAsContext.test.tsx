import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const signOutMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const updateMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

vi.mock('firebase/auth', () => ({
  signInWithCustomToken: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => updateMock,
}));
vi.mock('@/utils/viewAsTab', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/viewAsTab')>()),
  viewAsStorageIsolated: true,
}));

const SESSION = {
  sid: 's1',
  token: 'tok-1',
  targetUid: 'u1',
  targetEmail: 'jane@orono.k12.mn.us',
  adminTarget: false,
  expiresAt: Date.now() + 60 * 60 * 1000,
};

const Probe: React.FC = () => {
  const { useViewAs } = probeHooks;
  const v = useViewAs();
  return (
    <div>
      <span data-testid="who">{v?.targetEmail}</span>
      <span data-testid="ro">{String(v?.readOnly)}</span>
      <button onClick={() => void v?.unlock('fixing a setting')}>unlock</button>
      <button onClick={() => void v?.end()}>end</button>
    </div>
  );
};
let probeHooks: typeof import('./useViewAs');

const handoff = (session: unknown, source: unknown = window) => {
  const ev = new MessageEvent('message', {
    data: { type: 'spart-view-as-handoff', session },
    origin: window.location.origin,
  });
  Object.defineProperty(ev, 'source', { value: source });
  window.dispatchEvent(ev);
};

describe('ViewAsGate', () => {
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    // The mocked module survives resetModules, so reset its store by hand.
    (await import('@/utils/viewAsTab')).updateViewAsTabState({
      session: null,
      unlocked: false,
      ended: false,
      blockedNotice: 0,
    });
    probeHooks = await import('./useViewAs');
    signInMock.mockReset().mockResolvedValue({});
    signOutMock.mockReset().mockResolvedValue(undefined);
    updateMock.mockReset();
    postSpy = vi
      .spyOn(window, 'postMessage')
      .mockImplementation(() => undefined);
    vi.spyOn(window, 'close').mockImplementation(() => undefined);
    Object.defineProperty(window, 'opener', {
      value: window,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  const mount = async () => {
    const { ViewAsGate } = await import('./ViewAsContext');
    probeHooks = await import('./useViewAs');
    render(
      <ViewAsGate loader={<span>loading</span>}>
        <Probe />
      </ViewAsGate>
    );
  };

  it('shows the ended screen when there is no opener', async () => {
    Object.defineProperty(window, 'opener', {
      value: null,
      configurable: true,
    });
    await mount();
    expect(await screen.findByText('View as ended')).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('signs in with the handed-off token and exposes a read-only session', async () => {
    await mount();
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledWith(
      { type: 'spart-view-as-ready' },
      window.location.origin
    );
    await act(async () => {
      handoff(SESSION);
      await flush();
    });
    expect(signInMock).toHaveBeenCalledWith(expect.anything(), 'tok-1');
    expect(screen.getByTestId('who')).toHaveTextContent(SESSION.targetEmail);
    expect(screen.getByTestId('ro')).toHaveTextContent('true');
  });

  it('ignores a handoff that is not from the opener', async () => {
    await mount();
    await act(async () => {
      handoff(SESSION, {});
      await flush();
    });
    expect(signInMock).not.toHaveBeenCalled();
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('unlock re-signs in with the unlocked token', async () => {
    await mount();
    await act(async () => {
      handoff(SESSION);
      await flush();
    });
    updateMock.mockResolvedValue({
      data: { token: 'tok-2', expiresAt: SESSION.expiresAt, unlocked: true },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('unlock'));
      await flush();
    });
    expect(updateMock).toHaveBeenCalledWith({
      action: 'unlock',
      reason: 'fixing a setting',
    });
    expect(signInMock).toHaveBeenLastCalledWith(expect.anything(), 'tok-2');
    expect(screen.getByTestId('ro')).toHaveTextContent('false');
  });

  it('end ends the session, signs out and closes the tab', async () => {
    await mount();
    await act(async () => {
      handoff(SESSION);
      await flush();
    });
    updateMock.mockResolvedValue({ data: { ended: true } });
    await act(async () => {
      fireEvent.click(screen.getByText('end'));
      await flush();
    });
    expect(updateMock).toHaveBeenCalledWith({ action: 'end' });
    expect(signOutMock).toHaveBeenCalled();
    expect(window.close).toHaveBeenCalled();
    expect(screen.getByText('View as ended')).toBeInTheDocument();
  });
});
