/**
 * OAuth callback page that the Spotify consent popup lands on.
 *
 * Reads `?code=...&state=...` (or `?error=...`) from the URL, posts the
 * result back to `window.opener` via `postMessage`, then closes itself.
 * The opener (`connectSpotify` in `utils/spotifyAuth.ts`) handles the
 * backend exchange.
 *
 * Falls back to a manual "Close window" button if `window.opener` is
 * missing — typically because the user opened the URL in a fresh tab or
 * the opener was reloaded mid-flow.
 */

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { SpotifyCallbackMessage } from '@/utils/spotifyAuth';

interface InitialState {
  status: 'posting' | 'orphaned';
  message: SpotifyCallbackMessage;
  initialError: string;
}

/**
 * Compute the initial render state synchronously from URL + window.opener.
 * Doing this in a useState initializer avoids `react-hooks/set-state-in-effect`
 * by keeping all decisions inside the render phase rather than chasing them
 * with a setState() inside useEffect.
 */
function computeInitialState(): InitialState {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') ?? undefined;
  const state = params.get('state') ?? undefined;
  const error = params.get('error') ?? undefined;
  const message: SpotifyCallbackMessage = {
    source: 'spartboard-spotify-callback',
    code,
    state,
    error,
  };
  const opener = window.opener as Window | null;
  const hasOpener = !!opener && !opener.closed;
  return {
    status: hasOpener ? 'posting' : 'orphaned',
    message,
    initialError: error ?? '',
  };
}

export const SpotifyCallback: React.FC = () => {
  const [initial] = useState<InitialState>(computeInitialState);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    if (initial.status !== 'posting') return;
    const opener = window.opener as Window | null;
    if (!opener || opener.closed) return;

    try {
      opener.postMessage(initial.message, window.location.origin);
    } catch (err) {
      console.error('[SpotifyCallback] postMessage failed', err);
      // Defer the state update past the effect's synchronous body so
      // `react-hooks/set-state-in-effect` doesn't flag a cascading render.
      // postMessage failures here are terminal (the opener can't receive
      // the code) so there's nothing else for the effect to do this tick.
      queueMicrotask(() =>
        setPostError(err instanceof Error ? err.message : String(err))
      );
      return;
    }

    // Tiny delay so the opener's message listener has a tick to run before
    // the popup window vanishes. Closing is best-effort — some browsers
    // block window.close() on windows not opened by script.
    const t = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignored */
      }
    }, 100);
    return () => window.clearTimeout(t);
  }, [initial]);

  const showError = postError !== null;
  const orphanedMessage = initial.initialError
    ? `Spotify reported: ${initial.initialError}`
    : 'Return to SpartBoard to finish connecting Spotify.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {showError ? (
          <>
            <h1 className="text-lg font-semibold text-slate-800">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-500 mt-2">{postError}</p>
          </>
        ) : initial.status === 'orphaned' ? (
          <>
            <h1 className="text-lg font-semibold text-slate-800">
              Spotify connection
            </h1>
            <p className="text-sm text-slate-500 mt-2">{orphanedMessage}</p>
            <button
              type="button"
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
            >
              Close window
            </button>
          </>
        ) : (
          <>
            <Loader2 className="w-10 h-10 text-green-600 animate-spin mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-slate-800">
              Connecting Spotify…
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              You can close this window if it doesn&apos;t close on its own.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
