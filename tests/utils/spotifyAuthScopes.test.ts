/**
 * Scope list is consumed by both the auth-URL builder (frontend) and the
 * token-exchange validator (backend, kept in sync via REQUIRED_SPOTIFY_SCOPES).
 * If the two drift, partial-consent enforcement breaks silently.
 */
import { describe, it, expect } from 'vitest';
import { SPOTIFY_SCOPES } from '@/utils/spotifyAuth';

describe('SPOTIFY_SCOPES', () => {
  it('includes the three Library-API scopes the browse face requires', () => {
    expect(SPOTIFY_SCOPES).toContain('user-read-recently-played');
    expect(SPOTIFY_SCOPES).toContain('playlist-read-private');
    expect(SPOTIFY_SCOPES).toContain('playlist-read-collaborative');
  });

  it('still includes the original playback scopes', () => {
    expect(SPOTIFY_SCOPES).toContain('streaming');
    expect(SPOTIFY_SCOPES).toContain('user-modify-playback-state');
    expect(SPOTIFY_SCOPES).toContain('user-read-playback-state');
  });
});
