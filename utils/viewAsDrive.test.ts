import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const callableMock = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callableMock,
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

describe('viewAsDrive', () => {
  const realLocal = window.localStorage;
  const realSession = window.sessionStorage;
  const realFetch = window.fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')));
    window.fetch = fetchSpy as unknown as typeof fetch;
    callableMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: realLocal,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: realSession,
      configurable: true,
    });
    window.fetch = realFetch;
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  const loadViewAsTab = () => {
    window.history.replaceState({}, '', '/?viewAs=1');
    return import('./viewAsDrive');
  };

  it('is inert in an ordinary tab', async () => {
    const mod = await import('./viewAsDrive');
    expect(await mod.fetchViewAsDriveToken()).toBeNull();
    expect(callableMock).not.toHaveBeenCalled();
    expect(mod.noDriveMessage('Sign in')).toBe('Sign in');
    await window.fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('classifies Google API writes', async () => {
    const { isGoogleApiWrite } = await import('./viewAsDrive');
    const drive = 'https://www.googleapis.com/drive/v3/files/abc';
    expect(isGoogleApiWrite(drive)).toBe(false);
    expect(isGoogleApiWrite(drive, { method: 'patch' })).toBe(true);
    expect(
      isGoogleApiWrite(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=media',
        { method: 'POST' }
      )
    ).toBe(true);
    expect(
      isGoogleApiWrite('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
      })
    ).toBe(true);
    expect(isGoogleApiWrite(new Request(drive, { method: 'DELETE' }))).toBe(
      true
    );
    expect(
      isGoogleApiWrite(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
        { method: 'POST' }
      )
    ).toBe(false);
    expect(
      isGoogleApiWrite('https://us-central1-x.cloudfunctions.net/fn', {
        method: 'POST',
      })
    ).toBe(false);
  });

  it('blocks Drive writes but lets reads through in a view-as tab', async () => {
    const mod = await loadViewAsTab();
    const { ViewAsReadOnlyError } = await import('./viewAsTab');
    await expect(
      window.fetch('https://www.googleapis.com/drive/v3/files/abc', {
        method: 'PATCH',
      })
    ).rejects.toBeInstanceOf(ViewAsReadOnlyError);
    expect(fetchSpy).not.toHaveBeenCalled();

    await window.fetch('https://www.googleapis.com/drive/v3/files/abc');
    await window.fetch('https://identitytoolkit.googleapis.com/v1/x', {
      method: 'POST',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mod.noDriveMessage('Sign in')).toBe(mod.VIEW_AS_DRIVE_UNAVAILABLE);
  });

  it('lets Drive writes through once edits are unlocked', async () => {
    await loadViewAsTab();
    const tab = await import('./viewAsTab');
    tab.updateViewAsTabState({ unlocked: true });
    await window.fetch('https://www.googleapis.com/drive/v3/files/abc', {
      method: 'PATCH',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    tab.updateViewAsTabState({ unlocked: false });
  });

  it('returns the target token and marks Drive available', async () => {
    const mod = await loadViewAsTab();
    callableMock.mockResolvedValue({
      data: { available: true, accessToken: 'tok', expiresIn: 3599 },
    });
    const [a, b] = await Promise.all([
      mod.fetchViewAsDriveToken(),
      mod.fetchViewAsDriveToken(),
    ]);
    expect(a).toEqual({ accessToken: 'tok', expiresIn: 3599 });
    expect(b).toEqual(a);
    expect(callableMock).toHaveBeenCalledTimes(1);
    expect(mod.getViewAsDriveStatus()).toBe('available');
  });

  it('stops asking once the target has no stored grant', async () => {
    const mod = await loadViewAsTab();
    const listener = vi.fn();
    mod.subscribeViewAsDrive(listener);
    callableMock.mockResolvedValue({ data: { available: false } });
    expect(await mod.fetchViewAsDriveToken()).toBeNull();
    expect(mod.getViewAsDriveStatus()).toBe('unavailable');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(await mod.fetchViewAsDriveToken()).toBeNull();
    expect(callableMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a transient failure but not after a refusal', async () => {
    const mod = await loadViewAsTab();
    callableMock.mockRejectedValueOnce({ code: 'functions/unavailable' });
    expect(await mod.fetchViewAsDriveToken()).toBeNull();
    expect(mod.getViewAsDriveStatus()).toBe('pending');

    callableMock.mockRejectedValueOnce({ code: 'functions/permission-denied' });
    expect(await mod.fetchViewAsDriveToken()).toBeNull();
    expect(mod.getViewAsDriveStatus()).toBe('unavailable');
    expect(callableMock).toHaveBeenCalledTimes(2);
  });
});
