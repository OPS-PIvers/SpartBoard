import { afterEach, describe, expect, it, vi } from 'vitest';

describe('viewAsTab', () => {
  const realLocal = window.localStorage;
  const realSession = window.sessionStorage;

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: realLocal,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: realSession,
      configurable: true,
    });
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  it('is inert in an ordinary tab', async () => {
    const mod = await import('./viewAsTab');
    expect(mod.isViewAsTab).toBe(false);
    expect(mod.viewAsStorageIsolated).toBe(false);
    expect(mod.viewAsBlocksWrite()).toBe(false);
    expect(mod.viewAsSuppressesBackgroundWrites()).toBe(false);
    expect(() => mod.assertViewAsCanWrite()).not.toThrow();
    expect(window.localStorage).toBe(realLocal);
    expect(mod.getViewAsTabState().blockedNotice).toBe(0);
  });

  it('isolates storage and blocks writes in a view-as tab', async () => {
    realLocal.setItem('google_access_token', 'admin-token');
    window.history.replaceState({}, '', '/?viewAs=1');
    const mod = await import('./viewAsTab');

    expect(mod.isViewAsTab).toBe(true);
    expect(mod.viewAsStorageIsolated).toBe(true);
    expect(window.localStorage).not.toBe(realLocal);
    expect(window.localStorage.getItem('google_access_token')).toBeNull();
    window.localStorage.removeItem('google_access_token');
    window.sessionStorage.setItem('k', 'v');
    expect(window.sessionStorage.getItem('k')).toBe('v');
    expect(realLocal.getItem('google_access_token')).toBe('admin-token');
    expect(realSession.getItem('k')).toBeNull();

    expect(mod.viewAsSuppressesBackgroundWrites()).toBe(true);
    expect(mod.viewAsBlocksWrite()).toBe(true);
    expect(mod.getViewAsTabState().blockedNotice).toBe(1);
    expect(() => mod.assertViewAsCanWrite()).toThrow(mod.ViewAsReadOnlyError);
    realLocal.removeItem('google_access_token');
  });

  it('lets user saves through and audits them once unlocked', async () => {
    window.history.replaceState({}, '', '/?viewAs=1');
    const mod = await import('./viewAsTab');
    expect(mod.viewAsAuditsWrite()).toBe(false);
    mod.updateViewAsTabState({ unlocked: true });
    expect(mod.viewAsBlocksWrite()).toBe(false);
    expect(() => mod.assertViewAsCanWrite()).not.toThrow();
    expect(mod.viewAsSuppressesBackgroundWrites()).toBe(true);
    expect(mod.viewAsAuditsWrite()).toBe(true);
    mod.updateViewAsTabState({ ended: true });
    expect(mod.viewAsAuditsWrite()).toBe(false);
    expect(mod.viewAsBlocksWrite()).toBe(true);
  });

  it('notifies subscribers on state changes', async () => {
    const mod = await import('./viewAsTab');
    const listener = vi.fn();
    const unsub = mod.subscribeViewAsTab(listener);
    mod.updateViewAsTabState({ ended: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mod.getViewAsTabState().ended).toBe(true);
    unsub();
    mod.updateViewAsTabState({ ended: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
