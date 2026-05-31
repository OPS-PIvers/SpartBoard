/**
 * Shared Google Identity Services (GIS) OAuth helpers for the Classroom Add-on
 * SPIKE pages (student handshake + teacher discovery).
 *
 * Throwaway alongside the spike routes — the real Phase 3 student runner and
 * Phase 2 teacher discovery will own a hardened version of this. Extracted so
 * the two spike pages don't duplicate the popup plumbing.
 *
 * OAuth consent CANNOT redirect inside Classroom's iframe, so we use the GIS
 * token popup (top-level) to obtain an access token.
 */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** Inject the GIS script once and resolve when `google.accounts.oauth2` is ready. */
export function ensureGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Not in a browser.'));
      return;
    }
    const ready = () =>
      typeof window.google !== 'undefined' && !!window.google.accounts?.oauth2;
    if (ready()) {
      resolve();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`
    );
    if (!script) {
      script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const deadline = Date.now() + 8000;
    const poll = window.setInterval(() => {
      if (ready()) {
        window.clearInterval(poll);
        resolve();
      } else if (Date.now() > deadline) {
        window.clearInterval(poll);
        reject(new Error('GIS script did not load.'));
      }
    }, 100);
  });
}

/**
 * Run the OAuth token popup for the given scope string, resolving with an
 * access token (or rejecting). `loginHint` pre-selects the launching account.
 */
export function requestAccessToken(
  scope: string,
  loginHint: string | undefined
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not set in this build.'));
      return;
    }
    // `hint` isn't in older @types/google.accounts; widen the config type.
    const init = window.google.accounts.oauth2.initTokenClient as (config: {
      client_id: string;
      scope: string;
      hint?: string;
      callback: (resp: { access_token?: string; error?: string }) => void;
    }) => { requestAccessToken: () => void };

    const client = init({
      client_id: CLIENT_ID,
      scope,
      hint: loginHint,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`OAuth error: ${resp.error}`));
          return;
        }
        if (!resp.access_token) {
          reject(new Error('No access token returned.'));
          return;
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}
