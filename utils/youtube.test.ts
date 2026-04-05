import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  extractYouTubeId,
  buildSpotifyEmbedUrl,
  loadYouTubeApi,
} from './youtube';

describe('extractYouTubeId', () => {
  it('extracts ID from standard watch URL', () => {
    expect(
      extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from youtu.be short URL', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts ID from embed URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts ID from shorts URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts ID from watch URL with extra parameters', () => {
    expect(
      extractYouTubeId(
        'https://www.youtube.com/watch?foo=bar&v=dQw4w9WgXcQ&baz=qux'
      )
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from v/ URL format', () => {
    expect(extractYouTubeId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('returns null for invalid URLs', () => {
    expect(extractYouTubeId('https://example.com')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
  });

  it('handles empty or null input gracefully', () => {
    expect(extractYouTubeId('')).toBeNull();
  });

  it('handles IDs with hyphens and underscores', () => {
    expect(
      extractYouTubeId('https://www.youtube.com/watch?v=-_A-Za-z0-9')
    ).toBe('-_A-Za-z0-9');
  });
});

describe('buildSpotifyEmbedUrl', () => {
  it('returns null for invalid URLs', () => {
    expect(buildSpotifyEmbedUrl('not a url')).toBeNull();
  });

  it('returns null for non-HTTPS protocols', () => {
    expect(
      buildSpotifyEmbedUrl('http://open.spotify.com/track/123')
    ).toBeNull();
  });

  it('returns null for non-Spotify hostnames', () => {
    expect(buildSpotifyEmbedUrl('https://example.com/track/123')).toBeNull();
  });

  it('converts a standard track URL to an embed URL', () => {
    expect(
      buildSpotifyEmbedUrl(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
      )
    ).toBe('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT');
  });

  it('converts a standard playlist URL to an embed URL', () => {
    expect(
      buildSpotifyEmbedUrl(
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
      )
    ).toBe('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M');
  });

  it('preserves query parameters when converting', () => {
    expect(
      buildSpotifyEmbedUrl('https://open.spotify.com/track/4cOd?si=123')
    ).toBe('https://open.spotify.com/embed/track/4cOd?si=123');
  });

  it('returns the same URL if it is already an embed URL', () => {
    expect(
      buildSpotifyEmbedUrl('https://open.spotify.com/embed/track/123')
    ).toBe('https://open.spotify.com/embed/track/123');
  });

  it('works with the spotify.com domain without open.', () => {
    expect(buildSpotifyEmbedUrl('https://spotify.com/track/123')).toBe(
      'https://spotify.com/embed/track/123'
    );
  });
});

describe('loadYouTubeApi', () => {
  let originalYT: typeof window.YT;
  let originalOnYouTubeIframeAPIReady: typeof window.onYouTubeIframeAPIReady;

  beforeEach(() => {
    // Save original global properties
    originalYT = window.YT;
    originalOnYouTubeIframeAPIReady = window.onYouTubeIframeAPIReady;

    // Clear DOM and specific globals
    document.head.innerHTML = '';
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
  });

  afterEach(() => {
    // Restore global properties
    window.YT = originalYT;
    window.onYouTubeIframeAPIReady = originalOnYouTubeIframeAPIReady;
    document.head.innerHTML = '';
  });

  it('calls the callback immediately if YT.Player is already available', () => {
    // Mock the YT and Player object structure sufficiently to satisfy TS rules
    window.YT = {
      Player: class MockPlayer {} as unknown as NonNullable<
        typeof window.YT
      >['Player'],
    } as unknown as typeof window.YT;

    const callback = vi.fn();

    loadYouTubeApi(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(document.head.innerHTML).toBe(''); // No script added
  });

  it('adds the script tag and sets up the global handler if YT.Player is not available', () => {
    const callback = vi.fn();

    loadYouTubeApi(callback);

    expect(callback).not.toHaveBeenCalled();
    const script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    expect(script).not.toBeNull();
    expect(typeof window.onYouTubeIframeAPIReady).toBe('function');
  });

  it('queues multiple callbacks and adds the script tag only once', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    loadYouTubeApi(callback1);
    loadYouTubeApi(callback2);

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();

    const scripts = document.querySelectorAll(
      'script[src*="youtube.com/iframe_api"]'
    );
    expect(scripts.length).toBe(1);
  });

  it('invokes all queued callbacks when the API is ready', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    loadYouTubeApi(callback1);
    loadYouTubeApi(callback2);

    // Simulate API ready
    if (window.onYouTubeIframeAPIReady) {
      window.onYouTubeIframeAPIReady();
    }

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).toHaveBeenCalledTimes(1);
  });

  it('preserves and calls any previously defined onYouTubeIframeAPIReady handler', () => {
    const previousHandler = vi.fn();
    window.onYouTubeIframeAPIReady = previousHandler;

    const callback = vi.fn();
    loadYouTubeApi(callback);

    // Simulate API ready
    if (window.onYouTubeIframeAPIReady) {
      window.onYouTubeIframeAPIReady();
    }

    expect(previousHandler).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
