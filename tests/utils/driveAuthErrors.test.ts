import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isDriveAuthError,
  reportDriveAuthError,
  setDriveAuthErrorHandler,
  onDriveTokenChange,
  authError,
  DriveAuthError,
  subscribeDriveReconnected,
  notifyDriveReconnected,
  __resetDriveAuthErrorsForTests,
} from '@/utils/driveAuthErrors';

describe('driveAuthErrors', () => {
  beforeEach(() => {
    __resetDriveAuthErrorsForTests();
  });

  describe('isDriveAuthError', () => {
    it('matches a DriveAuthError instance regardless of message content', () => {
      // The `instanceof` branch is the preferred classification path —
      // tests should pass even when the message contains nothing
      // auth-related.
      expect(isDriveAuthError(new DriveAuthError('anything at all'))).toBe(
        true
      );
    });

    it('matches the explicit "Google Drive access expired" message', () => {
      expect(
        isDriveAuthError(
          new Error('Google Drive access expired. Please sign in again.')
        )
      ).toBe(true);
    });

    it('matches the explicit "Google Sheets access is not granted" message', () => {
      expect(
        isDriveAuthError(
          new Error('Google Sheets access is not granted. Sign in again.')
        )
      ).toBe(true);
    });

    it('matches messages embedding standalone 401 / 403', () => {
      expect(
        isDriveAuthError(new Error('Failed to fetch (401 Unauthorized)'))
      ).toBe(true);
      expect(
        isDriveAuthError(new Error('Failed to fetch (403 Forbidden)'))
      ).toBe(true);
    });

    it('does not false-positive on file IDs that contain 401 / 403', () => {
      // The word-boundary regex should reject IDs like "abc4019xyz" or
      // "...Drive_403abc..." appearing inside other tokens.
      expect(isDriveAuthError(new Error('File abc4019xyz not found'))).toBe(
        false
      );
      expect(isDriveAuthError(new Error('Lookup failed for abc403zzz'))).toBe(
        false
      );
    });

    it('returns false for non-Error values', () => {
      expect(isDriveAuthError(undefined)).toBe(false);
      expect(isDriveAuthError(null)).toBe(false);
      expect(isDriveAuthError('401')).toBe(false);
      expect(isDriveAuthError({ message: '401' })).toBe(false);
    });
  });

  describe('reportDriveAuthError — latch + handler interaction', () => {
    it('returns false and does not fire when error is not an auth error', () => {
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      expect(reportDriveAuthError(new Error('Some other failure'))).toBe(false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('fires the handler exactly once across multiple reports in the same episode', () => {
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      reportDriveAuthError(new Error('Google Drive access expired'));
      reportDriveAuthError(new Error('Google Drive access expired'));
      reportDriveAuthError(new Error('Failed (401)'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does NOT latch when no handler is registered (so a later report can still surface)', () => {
      // Pre-handler error: nothing fires, but the latch must remain open
      // so the next report — once a handler exists — can still toast.
      reportDriveAuthError(new Error('Google Drive access expired'));

      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('clears the handler when set to null and stops firing', () => {
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      setDriveAuthErrorHandler(null);
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onDriveTokenChange — re-arm semantics', () => {
    it('resets the latch when a new (different) token arrives', () => {
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      onDriveTokenChange('token-1');
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(1);

      // Same token across many consumer mounts: latch stays in place.
      onDriveTokenChange('token-1');
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(1);

      // Real token rotation: re-arms.
      onDriveTokenChange('token-2');
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('resets the latch on sign-out (token === null)', () => {
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      onDriveTokenChange('token-1');
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(1);

      onDriveTokenChange(null);
      // Sign-in to the same cached token re-arms — first stale episode of
      // the new session toasts again.
      onDriveTokenChange('token-1');
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('does NOT reset the latch on null → null mounts (no-Drive-auth steady state)', () => {
      // Regression: ~22 useGoogleDrive consumers each fire onDriveTokenChange
      // on mount. When the user has no Drive auth (preview, never connected,
      // or signed out before sign-in), every mount passes `null` — the latch
      // must stay set so a second failed Drive call doesn't re-spam the
      // reconnect toast.
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      onDriveTokenChange(null);
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(1);

      // Multiple subsequent consumer mounts in the same disconnected state.
      onDriveTokenChange(null);
      onDriveTokenChange(null);
      onDriveTokenChange(null);

      // Another failing Drive call — should NOT re-fire the toast.
      reportDriveAuthError(new Error('Google Drive access expired'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('drive-reconnected pub/sub', () => {
    it('fans out a notify to every subscriber', () => {
      const a = vi.fn();
      const b = vi.fn();
      subscribeDriveReconnected(a);
      subscribeDriveReconnected(b);
      notifyDriveReconnected();
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('returns an unsubscribe function that detaches the handler', () => {
      const handler = vi.fn();
      const unsubscribe = subscribeDriveReconnected(handler);
      unsubscribe();
      notifyDriveReconnected();
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits exactly once on a real token rotation (null → token)', () => {
      const handler = vi.fn();
      subscribeDriveReconnected(handler);
      onDriveTokenChange('token-1');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits exactly once on a token-to-different-token rotation', () => {
      const handler = vi.fn();
      onDriveTokenChange('token-1'); // initial — subscribed AFTER, so missed.
      subscribeDriveReconnected(handler);
      onDriveTokenChange('token-2');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does NOT emit when the same token replays (consumer-mount no-op)', () => {
      const handler = vi.fn();
      onDriveTokenChange('token-1');
      subscribeDriveReconnected(handler);
      onDriveTokenChange('token-1');
      onDriveTokenChange('token-1');
      expect(handler).not.toHaveBeenCalled();
    });

    it('does NOT emit on sign-out (token → null)', () => {
      const handler = vi.fn();
      onDriveTokenChange('token-1');
      subscribeDriveReconnected(handler);
      onDriveTokenChange(null);
      expect(handler).not.toHaveBeenCalled();
    });

    it('keeps fanning out to remaining handlers when one throws', () => {
      const thrower = vi.fn(() => {
        throw new Error('boom');
      });
      const other = vi.fn();
      subscribeDriveReconnected(thrower);
      subscribeDriveReconnected(other);
      // Swallow the expected console.error noise from the in-flight handler.
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        /* swallow */
      });
      notifyDriveReconnected();
      expect(thrower).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(1);
      errSpy.mockRestore();
    });

    it('tolerates a handler unsubscribing itself mid-fanout', () => {
      const handler = vi.fn();
      let unsubscribeSelf: (() => void) | null = null;
      const selfRemoving = vi.fn(() => {
        unsubscribeSelf?.();
      });
      unsubscribeSelf = subscribeDriveReconnected(selfRemoving);
      subscribeDriveReconnected(handler);
      notifyDriveReconnected();
      // Both fire on this fanout (the snapshot is taken before iteration).
      expect(selfRemoving).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledTimes(1);
      // On the next fanout, only the still-subscribed handler fires.
      notifyDriveReconnected();
      expect(selfRemoving).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('authError', () => {
    it('returns a DriveAuthError and reports it through the auth surface', () => {
      const handler = vi.fn();
      setDriveAuthErrorHandler(handler);
      const err = authError(
        'Google Drive access expired. Please sign in again.'
      );
      expect(err).toBeInstanceOf(DriveAuthError);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('access expired');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('still constructs a DriveAuthError when no handler is registered', () => {
      const err = authError(
        'Google Drive access expired. Please sign in again.'
      );
      expect(err).toBeInstanceOf(DriveAuthError);
    });
  });
});
