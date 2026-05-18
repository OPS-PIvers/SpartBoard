/**
 * useSpotifyAuth — connection state + profile for the current user's Spotify account.
 *
 * - Calls `refreshSpotifyAccessToken` on mount to detect whether a
 *   refresh_token is already persisted for this user (any signed-in user
 *   who had previously connected). If it succeeds, we treat them as
 *   connected and fetch the profile.
 * - `connect()` runs the popup auth flow and persists the refresh_token.
 * - `disconnect()` clears the local cache and tells the backend to drop
 *   the stored refresh_token.
 * - `getAccessToken()` returns a valid token (refreshing if needed) for
 *   downstream Web Playback SDK / Web API calls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import {
  ConnectOutcome,
  cacheAccessToken,
  clearAccessTokenCache,
  connectSpotify,
  disconnectSpotify,
  fetchSpotifyProfile,
  getValidAccessToken,
  SpotifyUserProfile,
} from '@/utils/spotifyAuth';

export type SpotifyConnectionState =
  | { status: 'unknown' }
  | { status: 'disconnected' }
  | { status: 'connected'; profile: SpotifyUserProfile }
  | { status: 'connecting' }
  | { status: 'error'; message: string };

export interface UseSpotifyAuth {
  state: SpotifyConnectionState;
  isConnected: boolean;
  isPremium: boolean;
  connect: () => Promise<ConnectOutcome>;
  disconnect: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export function useSpotifyAuth(): UseSpotifyAuth {
  const { user } = useAuth();
  const [state, setState] = useState<SpotifyConnectionState>({
    status: 'unknown',
  });
  // Track the uid the current state was computed for so a sign-out/sign-in
  // doesn't accidentally show a stale connected state.
  const lastUidRef = useRef<string | null>(null);

  // Detect existing connection on mount + on user change.
  useEffect(() => {
    if (!user) {
      lastUidRef.current = null;
      clearAccessTokenCache();
      setState({ status: 'disconnected' });
      return;
    }
    if (lastUidRef.current === user.uid && state.status !== 'unknown') return;
    lastUidRef.current = user.uid;

    let cancelled = false;
    setState({ status: 'unknown' });

    void (async () => {
      const token = await getValidAccessToken();
      if (cancelled) return;
      if (!token) {
        setState({ status: 'disconnected' });
        return;
      }
      try {
        const profile = await fetchSpotifyProfile(token);
        if (cancelled) return;
        setState({ status: 'connected', profile });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // `state.status` intentionally omitted: the lastUidRef guard handles
    // re-runs and we don't want a state setter inside the effect to loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    setState({ status: 'connecting' });
    const outcome = await connectSpotify();
    if (outcome.kind === 'success') {
      cacheAccessToken(outcome.result.accessToken, outcome.result.expiresIn);
      try {
        const profile = await fetchSpotifyProfile(outcome.result.accessToken);
        setState({ status: 'connected', profile });
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (outcome.kind === 'cancelled') {
      setState({ status: 'disconnected' });
    } else {
      setState({
        status: 'error',
        message:
          outcome.kind === 'error'
            ? outcome.reason
            : `Spotify requires re-consent (${outcome.cause}).`,
      });
    }
    return outcome;
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectSpotify();
    setState({ status: 'disconnected' });
  }, []);

  const getAccessToken = useCallback(() => getValidAccessToken(), []);

  return {
    state,
    isConnected: state.status === 'connected',
    isPremium: state.status === 'connected' && state.profile.isPremium,
    connect,
    disconnect,
    getAccessToken,
  };
}
