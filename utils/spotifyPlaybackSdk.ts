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
 */

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const pendingCallbacks: (() => void)[] = [];

export function loadSpotifySdk(callback: () => void): void {
  if (typeof window === 'undefined') return;
  if (window.Spotify?.Player) {
    callback();
    return;
  }
  pendingCallbacks.push(callback);
  if (document.querySelector(`script[src="${SDK_SRC}"]`)) return;
  const previousHandler = window.onSpotifyWebPlaybackSDKReady;
  window.onSpotifyWebPlaybackSDKReady = () => {
    if (typeof previousHandler === 'function') previousHandler();
    pendingCallbacks.splice(0).forEach((cb) => cb());
  };
  const tag = document.createElement('script');
  tag.src = SDK_SRC;
  tag.async = true;
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
