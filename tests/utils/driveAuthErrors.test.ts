import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isDriveAuthError,
  reportDriveAuthError,
  setDriveAuthErrorHandler,
  onDriveTokenChange,
  authError,
  DriveAuthError,
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
