/**
 * Detects and recovers from "stale chunk" failures that occur when an open tab
 * tries to lazy-load a JS chunk that no longer exists after a redeploy.
 *
 * Why: Vite emits hashed chunk filenames per build. After a deploy, the old
 * tab's `index.html` references chunks that 404 — and Firebase Hosting's SPA
 * rewrite (`** -> /index.html`) returns HTML for those URLs, so the browser
 * fails the import with a MIME-type error. Without recovery, the React tree
 * crashes to a blank screen.
 *
 * Recovery: on the first matching error in a session, force-reload the page
 * once. A sessionStorage flag prevents reload loops if the failure is real
 * (e.g. the chunk genuinely is broken on the server).
 */

const RELOAD_GUARD_KEY = 'spartboard:chunk-reload-attempted';

/**
 * Returns true if the error looks like a stale-chunk / failed dynamic-import
 * failure. Covers Vite, webpack, and the MIME-mismatch surface that Firebase's
 * SPA rewrite produces.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const err = error as { name?: string; message?: string };
  if (err.name === 'ChunkLoadError') return true;

  const message = typeof err.message === 'string' ? err.message : '';
  if (!message) return false;

  if (message.includes('Failed to fetch dynamically imported module'))
    return true;
  if (message.includes('error loading dynamically imported module'))
    return true;
  if (message.includes('Importing a module script failed')) return true;
  if (message.includes('Loading chunk') && message.includes('failed'))
    return true;
  if (message.includes('Loading CSS chunk')) return true;
  if (message.includes('MIME type') && message.includes('text/html'))
    return true;

  return false;
}

/**
 * Returns a Promise that never resolves or rejects. Used after kicking off a
 * page reload so React keeps showing the Suspense fallback (rather than
 * surfacing the original chunk error) for the brief moment before the reload
 * tears the page down.
 */
export function neverResolvingPromise<T = never>(): Promise<T> {
  return new Promise<T>(() => {
    /* intentionally never settles — page is reloading */
  });
}

/**
 * Triggers a one-shot full-page reload to pull in the new build. If we've
 * already attempted a reload this session, returns false so the caller can
 * fall back to an error UI instead of looping.
 */
export function attemptChunkReload(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') {
      return false;
    }
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    // sessionStorage can throw in privacy modes; if it does, allow the
    // reload anyway — looping is unlikely without storage to track state.
  }

  window.location.reload();
  return true;
}
