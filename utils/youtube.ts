/**
 * Shared YouTube IFrame API singleton.
 *
 * Extracted from MusicWidget so both MusicWidget and VideoActivityWidget share
 * the same API loader and type declarations without double-loading the script.
 *
 * MusicWidget re-exports from here for backward compatibility.
 */

// ---------------------------------------------------------------------------
// YouTube IFrame API singleton loader
// Prevents collision when multiple widgets are mounted simultaneously.
// ---------------------------------------------------------------------------

const ytPendingCallbacks: (() => void)[] = [];

const ytErrorCallbacks: (() => void)[] = [];

let ytLoadFailed = false;

export const loadYouTubeApi = (
  callback: () => void,
  onError?: () => void
): void => {
  if (window.YT?.Player) {
    callback();
    return;
  }
  // The failed script tag stays in <head>, so later callers would otherwise wait forever.
  if (ytLoadFailed) {
    onError?.();
    return;
  }
  ytPendingCallbacks.push(callback);
  if (onError) ytErrorCallbacks.push(onError);
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const previousHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousHandler === 'function') previousHandler();
      ytPendingCallbacks.splice(0).forEach((cb) => cb());
      ytErrorCallbacks.length = 0;
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      ytLoadFailed = true;
      ytErrorCallbacks.splice(0).forEach((cb) => cb());
    };
    document.head.appendChild(tag);
  }
};

const foreignPending = new WeakMap<Window, (() => void)[]>();

/** Loads the API into another window (a Present popup), so its players talk to that window. */
export const loadYouTubeApiIn = (win: Window, callback: () => void): void => {
  if (win === window) {
    loadYouTubeApi(callback);
    return;
  }
  if (win.YT?.Player) {
    callback();
    return;
  }
  const queued = foreignPending.get(win);
  if (queued) {
    queued.push(callback);
    return;
  }
  foreignPending.set(win, [callback]);
  const previousHandler = win.onYouTubeIframeAPIReady;
  win.onYouTubeIframeAPIReady = () => {
    if (typeof previousHandler === 'function') previousHandler();
    (foreignPending.get(win) ?? []).splice(0).forEach((cb) => cb());
  };
  const tag = win.document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  win.document.head.appendChild(tag);
};

/** Extracts the 11-character video ID from any YouTube URL format. */
export const extractYouTubeId = (url: string): string | null => {
  const m = url.match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
};

/** Embed URL for an ambient board background (muted, no controls). */
export const buildBackgroundVideoSrc = (
  videoId: string,
  origin: string,
  playlistLoop: boolean
): string => {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    disablekb: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    origin,
  });
  // YouTube's playlist loop reloads the video, which restarts quality at 720p or lower.
  if (playlistLoop) {
    params.set('loop', '1');
    params.set('playlist', videoId);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

/** Returns the Spotify embed URL, or null if the URL is not a valid https Spotify URL. */
export const buildSpotifyEmbedUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      (hostname !== 'spotify.com' && !hostname.endsWith('.spotify.com'))
    ) {
      return null;
    }
    if (parsed.pathname.startsWith('/embed/')) return parsed.toString();
    parsed.pathname = `/embed${parsed.pathname}`;
    return parsed.toString();
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Extended YouTube player interface
// Covers all methods used by both MusicWidget and VideoActivityWidget.
// ---------------------------------------------------------------------------

export interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  /** Returns a YT.PlayerState constant (see YT_PLAYER_STATE below). */
  getPlayerState: () => number;
  destroy: () => void;
}

/** YouTube IFrame API player state constants. */
export const YT_PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

// ---------------------------------------------------------------------------
// Global type declarations for YouTube IFrame API
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          height?: string;
          width?: string;
          videoId?: string;
          playerVars?: Record<string, string | number | boolean>;
          events?: {
            onStateChange?: (event: { data: number }) => void;
            onReady?: () => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
