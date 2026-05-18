/**
 * Per-user "don't show Premium dialog again" preference.
 *
 * Stored in localStorage (`spartboard.spotify.premium-dismiss.<uid>`) because
 * it's a UX-only flag with no security implications and no value in syncing
 * across devices — a teacher reinstalling their browser is fine to see the
 * notice again.
 *
 * Lives in `utils/` rather than alongside the dialog component so the dialog
 * file only exports a React component (avoids the react-refresh lint warning
 * about mixed exports).
 */

const DISMISS_KEY_PREFIX = 'spartboard.spotify.premium-dismiss.';

export function hasDismissedSpotifyPremiumNotice(uid: string | null): boolean {
  if (!uid || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY_PREFIX + uid) === '1';
  } catch {
    return false;
  }
}

export function setSpotifyPremiumNoticeDismissed(uid: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY_PREFIX + uid, '1');
  } catch {
    /* localStorage may be disabled — silently ignore */
  }
}
