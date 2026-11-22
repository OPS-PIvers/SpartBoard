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

  it('passes raw writes in an unlocked tab right after the admin acts, never local-only paths, and says which need their own audit', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/?viewAs=1');
    const mod = await import('./viewAsTab');
    const session = ['quiz_sessions/s1'];
    const response = ['quiz_sessions/s1/responses/r1'];
    const profile = ['users/u1/userProfile/profile'];
    const board = ['users/u1/dashboards/b1'];
    expect(mod.viewAsBlocksRawWrite(session)).toBe(true);
    expect(mod.viewAsBlocksRawWrite(response)).toBe(true);
    expect(mod.runAuditedWrite(() => mod.viewAsBlocksRawWrite(profile))).toBe(
      true
    );
    expect(mod.viewAsRawWriteNeedsAudit(session)).toBe(false);

    mod.updateViewAsTabState({ unlocked: true });
    expect(mod.viewAsBlocksRawWrite(session)).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(mod.viewAsBlocksRawWrite(session)).toBe(false);
    expect(mod.viewAsBlocksRawWrite(response)).toBe(false);
    expect(mod.viewAsBlocksRawWrite(profile)).toBe(false);
    expect(mod.viewAsBlocksRawWrite([...session, ...profile])).toBe(false);
    expect(mod.viewAsRawWriteNeedsAudit(response)).toBe(true);
    expect(
      mod.runAuditedWrite(() => mod.viewAsRawWriteNeedsAudit(profile))
    ).toBe(false);

    expect(mod.viewAsBlocksRawWrite(board)).toBe(true);
    expect(mod.viewAsBlocksRawWrite([...session, ...board])).toBe(true);
    expect(mod.viewAsBlocksRawWrite(['users/u1/plc_state/p1'])).toBe(true);
    expect(mod.viewAsBlocksRawWrite(['plcs/p1/presence/u1'])).toBe(true);
    expect(mod.viewAsBlocksRawWrite(['plcs/p1/notes/n1'])).toBe(false);
    expect(mod.viewAsBlocksRawWrite([])).toBe(true);
    expect(mod.runAuditedWrite(() => mod.viewAsBlocksRawWrite(board))).toBe(
      false
    );

    vi.advanceTimersByTime(30_001);
    expect(mod.viewAsBlocksRawWrite(response)).toBe(true);
    expect(mod.runAuditedWrite(() => mod.viewAsBlocksRawWrite(profile))).toBe(
      false
    );
    mod.openViewAsOutwardWindow(['quiz_sessions', 'quiz_assignments']);
    expect(mod.viewAsBlocksRawWrite(session)).toBe(false);
    expect(mod.viewAsBlocksRawWrite([...session, ...profile])).toBe(true);
    expect(mod.viewAsRawWriteNeedsAudit(session)).toBe(false);
    expect(mod.viewAsRawWriteNeedsAudit([...session, ...profile])).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(mod.viewAsRawWriteNeedsAudit(session)).toBe(true);
    mod.noteViewAsUserAction();

    mod.updateViewAsTabState({ ended: true });
    expect(mod.viewAsBlocksRawWrite(session)).toBe(true);
    expect(mod.runAuditedWrite(() => mod.viewAsBlocksRawWrite(profile))).toBe(
      true
    );
    expect(mod.viewAsRawWriteNeedsAudit(session)).toBe(false);
    vi.useRealTimers();
  });

  it('opens the Share to PLC window over every collection the bank share batch writes', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/?viewAs=1');
    const mod = await import('./viewAsTab');
    const { VIEW_AS_WRITES } = await import('@/hooks/useViewAsOutward');
    mod.updateViewAsTabState({ unlocked: true });
    vi.advanceTimersByTime(30_001);
    mod.openViewAsOutwardWindow(VIEW_AS_WRITES.sharePlc);
    const batch = ['synced_bank_owners/g1', 'synced_question_banks/g1'];
    expect(mod.viewAsBlocksRawWrite(batch)).toBe(false);
    expect(mod.viewAsRawWriteNeedsAudit(batch)).toBe(false);
    vi.useRealTimers();
  });

  it('never blocks raw writes in an ordinary tab', async () => {
    const mod = await import('./viewAsTab');
    expect(mod.viewAsBlocksRawWrite(['users/u1'])).toBe(false);
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
