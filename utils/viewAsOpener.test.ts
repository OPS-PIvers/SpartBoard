import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startMock = vi.fn();
const updateMock = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string) =>
    name === 'startViewAsSessionV1' ? startMock : updateMock,
}));

import { openViewAsTab } from './viewAsOpener';
import { VIEW_AS_ENDED, VIEW_AS_HANDOFF, VIEW_AS_READY } from './viewAsTab';

const SESSION = {
  sid: 's1',
  token: 'tok',
  targetUid: 'u1',
  targetEmail: 'jane@orono.k12.mn.us',
  adminTarget: false,
  expiresAt: 123,
};

interface FakeWin {
  postMessage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  closed: boolean;
}

const fakeWin = (): FakeWin => ({
  postMessage: vi.fn(),
  close: vi.fn(),
  closed: false,
});

const sendReady = (source: unknown, origin = window.location.origin) => {
  const ev = new MessageEvent('message', {
    data: { type: VIEW_AS_READY },
    origin,
  });
  Object.defineProperty(ev, 'source', { value: source });
  window.dispatchEvent(ev);
};

describe('openViewAsTab', () => {
  let win: FakeWin;

  beforeEach(() => {
    vi.useFakeTimers();
    win = fakeWin();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    startMock.mockReset().mockResolvedValue({ data: SESSION });
    updateMock.mockReset().mockResolvedValue({ data: { ended: true } });
  });

  afterEach(() => {
    win.closed = true;
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the tab before minting and hands off the token once the tab is ready', async () => {
    await openViewAsTab('jane@orono.k12.mn.us');
    expect(window.open).toHaveBeenCalledWith('/?viewAs=1', '_blank');
    expect(startMock).toHaveBeenCalledWith({
      targetEmail: 'jane@orono.k12.mn.us',
    });
    expect(win.postMessage).not.toHaveBeenCalled();

    sendReady(win);
    expect(win.postMessage).toHaveBeenCalledWith(
      { type: VIEW_AS_HANDOFF, session: SESSION },
      window.location.origin
    );
  });

  it('ignores ready messages from other origins or windows', async () => {
    await openViewAsTab('jane@orono.k12.mn.us');
    sendReady(win, 'https://evil.example');
    sendReady(fakeWin());
    expect(win.postMessage).not.toHaveBeenCalled();
  });

  it('delivers immediately when the tab was ready before the mint returned', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    startMock.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = openViewAsTab('jane@orono.k12.mn.us');
    sendReady(win);
    expect(win.postMessage).not.toHaveBeenCalled();
    resolve({ data: SESSION });
    await pending;
    expect(win.postMessage).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the tab reloads after the handoff', async () => {
    await openViewAsTab('jane@orono.k12.mn.us');
    sendReady(win);
    sendReady(win);
    expect(updateMock).toHaveBeenCalledWith({ action: 'end', sid: 's1' });
    expect(win.postMessage).toHaveBeenLastCalledWith(
      { type: VIEW_AS_ENDED },
      window.location.origin
    );
  });

  it('ends the session when the tab is closed', async () => {
    await openViewAsTab('jane@orono.k12.mn.us');
    win.closed = true;
    vi.advanceTimersByTime(1500);
    expect(updateMock).toHaveBeenCalledWith({ action: 'end', sid: 's1' });
  });

  it('closes the tab and rethrows when the mint fails', async () => {
    startMock.mockRejectedValue(new Error('View as is turned off.'));
    await expect(openViewAsTab('jane@orono.k12.mn.us')).rejects.toThrow(
      'View as is turned off.'
    );
    expect(win.close).toHaveBeenCalled();
  });

  it('reports a blocked pop-up', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    await expect(openViewAsTab('jane@orono.k12.mn.us')).rejects.toThrow(
      /pop-ups/
    );
    expect(startMock).not.toHaveBeenCalled();
  });
});
