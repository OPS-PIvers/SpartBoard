/**
 * Spotify Web Playback SDK loader + minimal type surface.
 *
 * The SDK script (`https://sdk.scdn.co/spotify-player.js`) must be loaded
 * once per page. It calls `window.onSpotifyWebPlaybackSDKReady` exactly
 * once when ready; we fan that out to multiple pending callbacks so a
 * dashboard with two music widgets doesn't trample its own initialization.
 *
 * The SDK only works in browsers that support EME (Encrypted Media
 * Extensions) — i.e. Chrome / Edge / Firefox / Safari on desktop, but
 * NOT iOS Safari. Callers should fall back to the embed iframe when
 * `window.Spotify` never arrives.
 *
 * Failure modes
 * -------------
 * The loader reports failures via the optional `onError` callback:
 *   - `script-load-failed` — `<script>` emitted an `error` event (CDN blocked,
 *     CSP violation, network down).
 *   - `timeout` — neither `error` nor `onSpotifyWebPlaybackSDKReady` fired
 *     within `SDK_LOAD_TIMEOUT_MS`.
 * Without this, pending callbacks would sit forever and widgets would render
 * a permanently disabled play button instead of falling back to the embed.
 */

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const SDK_LOAD_TIMEOUT_MS = 15_000;

interface PendingCallback {
  onReady: () => void;
  onError?: (err: Error) => void;
  timeoutId: number;
}

const pending: PendingCallback[] = [];
let scriptInjected = false;
let scriptFailed: Error | null = null;

function fulfillAllReady(): void {
  while (pending.length) {
    const cb = pending.shift();
    if (!cb) continue;
    window.clearTimeout(cb.timeoutId);
    cb.onReady();
  }
}

function failAllPending(err: Error): void {
  while (pending.length) {
    const cb = pending.shift();
    if (!cb) continue;
    window.clearTimeout(cb.timeoutId);
    cb.onError?.(err);
  }
}

export function loadSpotifySdk(
  onReady: () => void,
  onError?: (err: Error) => void
): void {
  if (typeof window === 'undefined') return;
  if (window.Spotify?.Player) {
    onReady();
    return;
  }
  // A previous load attempt definitively failed — don't keep new callers
  // waiting on a script tag that's never going to load.
  if (scriptFailed) {
    onError?.(scriptFailed);
    return;
  }

  const timeoutId = window.setTimeout(() => {
    const err = new Error('timeout');
    // Mark globally so future callers fail fast too.
    scriptFailed = err;
    failAllPending(err);
  }, SDK_LOAD_TIMEOUT_MS);

  pending.push({ onReady, onError, timeoutId });

  if (scriptInjected) return;
  scriptInjected = true;

  const previousHandler = window.onSpotifyWebPlaybackSDKReady;
  window.onSpotifyWebPlaybackSDKReady = () => {
    if (typeof previousHandler === 'function') previousHandler();
    fulfillAllReady();
  };

  const tag = document.createElement('script');
  tag.src = SDK_SRC;
  tag.async = true;
  tag.onerror = () => {
    const err = new Error('script-load-failed');
    scriptFailed = err;
    failAllPending(err);
  };
  document.head.appendChild(tag);
}

// ---------------------------------------------------------------------------
// Type declarations — covers only the surface the Music widget uses.
// The real SDK has many more events and methods.
// ---------------------------------------------------------------------------

export interface SpotifyPlayerInitOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

export interface SpotifyPlayerState {
  paused: boolean;
  track_window?: {
    current_track?: {
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
      album?: { images?: Array<{ url: string }> };
    };
  };
}

export interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  togglePlay: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
  addListener: ((
    event: 'ready',
    cb: (data: { device_id: string }) => void
  ) => void) &
    ((event: 'not_ready', cb: (data: { device_id: string }) => void) => void) &
    ((
      event: 'player_state_changed',
      cb: (state: SpotifyPlayerState) => void
    ) => void) &
    ((
      event:
        | 'initialization_error'
        | 'authentication_error'
        | 'account_error'
        | 'playback_error',
      cb: (data: { message: string }) => void
    ) => void);
  removeListener: (event: string) => void;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: SpotifyPlayerInitOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}
