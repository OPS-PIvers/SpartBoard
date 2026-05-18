/**
 * useSpotifyAuth — connection state + profile for the current user's Spotify account.
 *
 * Shared state model
 * ------------------
 * The connection state lives in a module-level singleton so every `useSpotifyAuth`
 * subscriber (e.g. the Music widget's settings panel AND its already-mounted
 * front-face player) observes the same status. Without this, connecting from
 * the settings panel wouldn't update the front-face player until it remounted.
 *
 * Per-uid cache invalidation
 * --------------------------
 * The module-level access-token cache (in `utils/spotifyAuth.ts`) is keyed
 * globally, not per uid. We explicitly clear it whenever Firebase's signed-in
 * uid changes so user B can't inherit user A's still-valid Spotify session in
 * the same browser tab.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import {
  ConnectOutcome,
  cacheAccessToken,
  clearAccessTokenCache,
  connectSpotify,
  disconnectSpotify,
  DisconnectOutcome,
  fetchSpotifyProfile,
  getValidAccessToken,
  prettifyConnectErrorReason,
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
  disconnect: () => Promise<DisconnectOutcome>;
  getAccessToken: () => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Module-level singleton state + subscribers
// ---------------------------------------------------------------------------

let sharedState: SpotifyConnectionState = { status: 'unknown' };
const subscribers = new Set<(s: SpotifyConnectionState) => void>();
/** uid the singleton state was initialized for. `null` = signed out or not yet seen. */
let initializedForUid: string | null = null;
/** Guards against duplicate initial-probe round-trips when multiple hooks mount at once. */
let inflightInit: Promise<void> | null = null;

function setSharedState(next: SpotifyConnectionState): void {
  sharedState = next;
  subscribers.forEach((cb) => cb(next));
}

/**
 * Run the initial "is this user already connected?" probe exactly once per
 * uid, broadcasting the result to every mounted hook instance via
 * `setSharedState`. Concurrent mounts share the same in-flight promise so we
 * don't fire duplicate `refreshSpotifyAccessToken` + `/me` round-trips.
 */
function initializeForUid(uid: string): Promise<void> {
  if (initializedForUid === uid && sharedState.status !== 'unknown') {
    return Promise.resolve();
  }
  if (inflightInit) return inflightInit;
  initializedForUid = uid;
  inflightInit = (async () => {
    setSharedState({ status: 'unknown' });
    const token = await getValidAccessToken();
    // Uid may have changed mid-probe (rapid sign-out/sign-in). Re-check.
    if (initializedForUid !== uid) return;
    if (!token) {
      setSharedState({ status: 'disconnected' });
      return;
    }
    try {
      const profile = await fetchSpotifyProfile(token);
      if (initializedForUid !== uid) return;
      setSharedState({ status: 'connected', profile });
    } catch (err) {
      if (initializedForUid !== uid) return;
      setSharedState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })().finally(() => {
    inflightInit = null;
  });
  return inflightInit;
}

export function useSpotifyAuth(): UseSpotifyAuth {
  const { user } = useAuth();
  const [state, setState] = useState<SpotifyConnectionState>(sharedState);

  // Subscribe this component to shared-state updates for its entire lifetime.
  useEffect(() => {
    subscribers.add(setState);
    // Sync once after subscription in case the singleton changed between
    // render and effect commit (race with another hook instance's
    // connect/disconnect). Deferred past the effect body so
    // `react-hooks/set-state-in-effect` doesn't flag a cascading render —
    // and so React batches it with anything else in the same microtask.
    queueMicrotask(() => {
      setState(sharedState);
    });
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  // React to sign-in/sign-out/uid-switch.
  useEffect(() => {
    if (!user) {
      // Sign-out — clear token cache and state so a different signed-in user
      // doesn't inherit the previous session.
      if (initializedForUid !== null) {
        initializedForUid = null;
        clearAccessTokenCache();
        setSharedState({ status: 'disconnected' });
      }
      return;
    }
    // Uid switch (user A → user B in the same tab). Invalidate the global
    // token cache before probing — otherwise user B's first getValidAccessToken()
    // call returns user A's still-valid cached access_token.
    if (initializedForUid !== null && initializedForUid !== user.uid) {
      clearAccessTokenCache();
      initializedForUid = null;
      setSharedState({ status: 'unknown' });
    }
    void initializeForUid(user.uid);
  }, [user]);

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    setSharedState({ status: 'connecting' });
    const outcome = await connectSpotify();
    if (outcome.kind === 'success') {
      cacheAccessToken(outcome.result.accessToken, outcome.result.expiresIn);
      try {
        const profile = await fetchSpotifyProfile(outcome.result.accessToken);
        setSharedState({ status: 'connected', profile });
      } catch (err) {
        setSharedState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (outcome.kind === 'cancelled') {
      setSharedState({ status: 'disconnected' });
    } else {
      setSharedState({
        status: 'error',
        message:
          outcome.kind === 'error'
            ? prettifyConnectErrorReason(outcome.reason)
            : `Spotify needs re-consent (${outcome.cause}). Try connecting again.`,
      });
    }
    return outcome;
  }, []);

  const disconnect = useCallback(async (): Promise<DisconnectOutcome> => {
    const result = await disconnectSpotify();
    if (result.ok) {
      setSharedState({ status: 'disconnected' });
    } else {
      setSharedState({ status: 'error', message: result.message });
    }
    return result;
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
