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
 *
 * Uid races
 * ---------
 * Two paths are guarded against rapid sign-in switches:
 *   1. `initializeForUid` reads `initializedForUid` after every await and
 *      bails if it changed. The in-flight init is keyed by uid so a new
 *      sign-in doesn't get back the previous user's probe promise.
 *   2. `connect` captures the starting uid, opens the Spotify popup, then
 *      verifies the uid is still current BEFORE calling the backend
 *      exchange. Without that check the exchange would run under the new
 *      user's auth and persist the previous user's refresh_token under
 *      the wrong `/users/{uid}/private/spotifyAuth` path.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import {
  ConnectOutcome,
  cacheAccessToken,
  clearAccessTokenCache,
  disconnectSpotify,
  DisconnectOutcome,
  exchangeSpotifyCode,
  fetchSpotifyProfile,
  getValidAccessToken,
  getValidAccessTokenOrNull,
  prettifyConnectErrorReason,
  runSpotifyAuthPopup,
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
/**
 * In-flight initial probe, keyed by uid. Sharing across concurrent mounts
 * avoids duplicate round-trips. Keying by uid prevents a rapid switch from
 * returning the previous user's probe — the new uid kicks off its own.
 */
let inflight: { uid: string; promise: Promise<void> } | null = null;

function setSharedState(next: SpotifyConnectionState): void {
  sharedState = next;
  subscribers.forEach((cb) => cb(next));
}

function initializeForUid(uid: string): Promise<void> {
  if (initializedForUid === uid && sharedState.status !== 'unknown') {
    return Promise.resolve();
  }
  if (inflight && inflight.uid === uid) return inflight.promise;
  initializedForUid = uid;
  const promise = (async () => {
    setSharedState({ status: 'unknown' });
    const result = await getValidAccessToken();
    if (initializedForUid !== uid) return;
    if (result.status === 'needs-consent') {
      setSharedState({ status: 'disconnected' });
      return;
    }
    if (result.status === 'transient') {
      // Don't flip to "disconnected" for a transient backend failure —
      // the stored refresh_token is still valid, the next probe will
      // pick it up. Surface as an error so the teacher can retry.
      setSharedState({ status: 'error', message: result.message });
      return;
    }
    if (result.status === 'no-cache-bump') {
      // Cache was cleared mid-flight (sign-out, disconnect, or uid switch
      // landed concurrently). The new state was already set by whichever
      // path did the invalidation; don't overwrite it.
      return;
    }
    try {
      const profile = await fetchSpotifyProfile(result.token);
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
    // Only clear if it's still ours — a uid switch may have replaced it
    // with a new probe whose `finally` should be the one that clears.
    if (inflight && inflight.uid === uid) inflight = null;
  });
  inflight = { uid, promise };
  return promise;
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
      if (initializedForUid !== null) {
        initializedForUid = null;
        inflight = null;
        clearAccessTokenCache();
        setSharedState({ status: 'disconnected' });
      }
      return;
    }
    // Uid switch (user A → user B in the same tab). Invalidate the global
    // token cache before probing — otherwise user B's first getValidAccessToken()
    // call returns user A's still-valid cached access_token. Clearing
    // `inflight` here forces a fresh probe for B even if A's probe is still
    // in flight.
    if (initializedForUid !== null && initializedForUid !== user.uid) {
      clearAccessTokenCache();
      initializedForUid = null;
      inflight = null;
      setSharedState({ status: 'unknown' });
    }
    void initializeForUid(user.uid);
  }, [user]);

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    const startUid = user?.uid ?? null;
    if (!startUid) {
      return { kind: 'error', reason: 'not-signed-in' };
    }
    setSharedState({ status: 'connecting' });

    // Step 1: popup. No backend call here — the popup just collects the
    // PKCE code from Spotify's consent screen.
    const popup = await runSpotifyAuthPopup();

    // Uid check #1: bail BEFORE the backend exchange if the user switched
    // during consent. Calling exchange under user B's auth would store
    // user A's refresh_token under `/users/B/private/spotifyAuth` — a
    // cross-user credential write that the server can't detect.
    if (initializedForUid !== startUid) {
      // The effect's uid-switch path has already set state to 'unknown'
      // and kicked off the new uid's probe; don't overwrite it.
      return { kind: 'cancelled' };
    }

    if (popup.kind === 'cancelled') {
      setSharedState({ status: 'disconnected' });
      return { kind: 'cancelled' };
    }
    if (popup.kind === 'error') {
      setSharedState({
        status: 'error',
        message: prettifyConnectErrorReason(popup.reason),
      });
      return { kind: 'error', reason: popup.reason };
    }

    // Step 2: exchange the code for tokens. Now safe because startUid is
    // confirmed current.
    const outcome = await exchangeSpotifyCode({
      code: popup.code,
      codeVerifier: popup.codeVerifier,
      redirectUri: popup.redirectUri,
    });

    // Uid check #2: belt-and-suspenders. The exchange itself was fast
    // (< 1s typically) but if a switch landed during it, don't pollute
    // the new uid's state machine with the previous account.
    if (initializedForUid !== startUid) return { kind: 'cancelled' };

    if (outcome.kind === 'success') {
      cacheAccessToken(outcome.result.accessToken, outcome.result.expiresIn);
      try {
        const profile = await fetchSpotifyProfile(outcome.result.accessToken);
        if (initializedForUid !== startUid) return { kind: 'cancelled' };
        setSharedState({ status: 'connected', profile });
      } catch (err) {
        if (initializedForUid !== startUid) return { kind: 'cancelled' };
        setSharedState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (outcome.kind === 'needs-consent') {
      setSharedState({
        status: 'error',
        message: `Spotify needs re-consent (${outcome.cause}). Try connecting again.`,
      });
    } else if (outcome.kind === 'error') {
      setSharedState({
        status: 'error',
        message: prettifyConnectErrorReason(outcome.reason),
      });
    } else {
      // `cancelled` from exchangeSpotifyCode is unreachable in practice (the
      // popup handles cancellation), but the discriminated union allows it
      // so we fall back to the same path the popup-cancel branch uses.
      setSharedState({ status: 'disconnected' });
    }
    return outcome;
  }, [user]);

  const disconnect = useCallback(async (): Promise<DisconnectOutcome> => {
    const result = await disconnectSpotify();
    if (result.ok) {
      setSharedState({ status: 'disconnected' });
    } else {
      setSharedState({ status: 'error', message: result.message });
    }
    return result;
  }, []);

  const getAccessToken = useCallback(() => getValidAccessTokenOrNull(), []);

  return {
    state,
    isConnected: state.status === 'connected',
    isPremium: state.status === 'connected' && state.profile.isPremium,
    connect,
    disconnect,
    getAccessToken,
  };
}
