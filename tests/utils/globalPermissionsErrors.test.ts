import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setGlobalPermissionsErrorHandler,
  reportGlobalPermissionsError,
  __resetGlobalPermissionsErrorsForTests,
} from '@/utils/globalPermissionsErrors';

/**
 * Module-level dispatch that surfaces a "feature availability may be stale"
 * toast ONCE per session when the `global_permissions` snapshot fails. The
 * latch prevents a retrying snapshot from fanning out five toasts. The
 * `__resetForTests` export resets the module-level singleton per case.
 */

describe('globalPermissionsErrors', () => {
  beforeEach(() => {
    __resetGlobalPermissionsErrorsForTests();
  });

  it('dispatches through the registered handler and returns true', () => {
    const handler = vi.fn();
    setGlobalPermissionsErrorHandler(handler);
    expect(reportGlobalPermissionsError()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires the handler exactly once per session (latch)', () => {
    const handler = vi.fn();
    setGlobalPermissionsErrorHandler(handler);
    expect(reportGlobalPermissionsError()).toBe(true);
    // Subsequent reports are latched no-ops.
    expect(reportGlobalPermissionsError()).toBe(false);
    expect(reportGlobalPermissionsError()).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false and does not latch when no handler is registered', () => {
    // A report before any handler exists must NOT consume the latch — a
    // later report, once a handler is registered, still needs to surface.
    expect(reportGlobalPermissionsError()).toBe(false);

    const handler = vi.fn();
    setGlobalPermissionsErrorHandler(handler);
    expect(reportGlobalPermissionsError()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops firing after the handler is cleared with null', () => {
    const handler = vi.fn();
    setGlobalPermissionsErrorHandler(handler);
    setGlobalPermissionsErrorHandler(null);
    expect(reportGlobalPermissionsError()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('__resetForTests clears both the handler and the latch', () => {
    const first = vi.fn();
    setGlobalPermissionsErrorHandler(first);
    reportGlobalPermissionsError();
    expect(first).toHaveBeenCalledTimes(1);

    __resetGlobalPermissionsErrorsForTests();

    // Latch is cleared, but so is the handler — a bare report is a no-op.
    expect(reportGlobalPermissionsError()).toBe(false);

    // Re-registering surfaces again in the fresh session.
    const second = vi.fn();
    setGlobalPermissionsErrorHandler(second);
    expect(reportGlobalPermissionsError()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
