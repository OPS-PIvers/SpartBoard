/**
 * useSpotifyWebPlayback — owns the Spotify Web Playback SDK connection.
 *
 * Why a hook (and why owned above the tabs)
 * -----------------------------------------
 * The SDK creates a *playback device* that Spotify routes audio to. That
 * device must outlive any single tab: a teacher should be able to tap a
 * track in the Library tab (before ever opening Now Playing) and have it
 * play, and switching away from Now Playing must NOT stop the music. By
 * mounting this hook in PersonalSpotifyBrowser (which stays mounted across
 * tab switches) the device lives for the whole browse session.
 *
 * Previously the SDK lived inside PersonalSpotifyNowPlayingTab, so the
 * device only existed while that tab was visible — tapping from Library
 * did nothing (deviceId null) and leaving the tab disconnected playback.
 *
 * Inert when disabled
 * -------------------
 * Free-tier accounts can't use the SDK at all (it requires Premium). Pass
 * `enabled=false` to keep the hook fully inert: no script load, no device,
 * `sdkFailed=false`. The caller renders the embed-iframe fallback instead.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  loadSpotifySdk,
  SpotifyPlayer,
  SpotifyPlayerState,
} from '@/utils/spotifyPlaybackSdk';
import {
  parseSpotifyResource,
  playOnDevice,
  setRepeatMode,
  setShuffle,
  waitForDeviceRegistration,
} from '@/utils/spotifyAuth';

export interface SpotifyPlaybackTrack {
  name: string;
  artist: string;
  image?: string;
}

export interface UseSpotifyWebPlaybackReturn {
  deviceId: string | null;
  isReady: boolean;
  /** true when SDK init failed or the account isn't Premium → caller should render the iframe fallback */
  sdkFailed: boolean;
  currentTrack: SpotifyPlaybackTrack | null;
  isPlaying: boolean;
  /** Current repeat mode: 0 = off, 1 = repeat-context, 2 = repeat-track. */
  repeatMode: number;
  /** Native Spotify shuffle on/off. */
  shuffle: boolean;
  togglePlay: () => Promise<void>;
  /** Skip to the next track in the current context (no-op if no player). */
  next: () => Promise<void>;
  /** Skip to the previous track in the current context (no-op if no player). */
  previous: () => Promise<void>;
  /** Cycle repeat: off → track → context → off (best-effort, no-op if no device). */
  cycleRepeat: () => Promise<void>;
  /** Toggle native Spotify shuffle (best-effort, no-op if no device). */
  toggleShuffle: () => Promise<void>;
}

/**
 * Owns the Spotify Web Playback SDK connection. Mounting this hook creates a
 * playback device that stays alive for the hook's lifetime — independent of
 * which Music-widget tab is visible. Pass enabled=false (e.g. for Free
 * accounts) to keep the hook inert (no SDK load, sdkFailed=false, deviceId=null).
 *
 * `targetUri` is the currently-selected Spotify resource (track/album/playlist
 * URI). When the device is connected but nothing is loaded yet, the first
 * togglePlay() starts this URI on the device — restoring reload-resume and
 * paste-URL-then-press-play. Held in a ref so changing it doesn't re-init the SDK.
 */
export function useSpotifyWebPlayback(
  enabled: boolean,
  getAccessToken: () => Promise<string | null>,
  targetUri: string | null
): UseSpotifyWebPlaybackReturn {
  // Stable instance name for the Spotify Player so the device shows up
  // consistently in the user's Spotify Connect device list.
  const instanceId = useId();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatModeState] = useState(0);
  const [shuffle, setShuffleState] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyPlaybackTrack | null>(
    null
  );
  const playerRef = useRef<SpotifyPlayer | null>(null);
  // Mirror deviceId in a ref so togglePlay can read the connected device
  // without depending on deviceId state (which would re-create the callback
  // on every connect/disconnect).
  const deviceIdRef = useRef<string | null>(null);
  // Mirror repeatMode/shuffle in refs so cycleRepeat/toggleShuffle read the
  // current value without re-creating their callbacks on every state change.
  const repeatModeRef = useRef(0);
  const shuffleRef = useRef(false);

  // Hold the latest getAccessToken / targetUri without re-running the SDK setup
  // effect on every render (the caller passes a fresh closure / value each
  // render). The SDK's getOAuthToken callback and togglePlay read through these
  // refs, so they always see current values.
  const getAccessTokenRef = useRef(getAccessToken);
  const targetUriRef = useRef(targetUri);
  useLayoutEffect(() => {
    getAccessTokenRef.current = getAccessToken;
    targetUriRef.current = targetUri;
  });

  // Initialize the Web Playback SDK while enabled. Re-runs only when `enabled`
  // flips (instanceId is stable for the component's lifetime).
  useEffect(() => {
    if (!enabled) return;

    let destroyed = false;
    // Generation counter bumped on every event that invalidates an in-flight
    // device-registration poll: re-emit of `ready` (SDK reconnects with a new
    // device_id), `not_ready` (device gone), or `failSdk` (any fatal listener).
    // The poll closure captures the generation at start and bails on resolve
    // if it has moved on — without this, a stale poll's `.then()` would
    // resurrect a dead device_id over the current null/failed state.
    let pollGeneration = 0;

    // Forward-declare playerRef-disconnect into a local so failSdk can use it
    // without piercing the outer ref. We assign `player` below once connect()
    // wires up the SDK.
    const disconnectActivePlayer = () => {
      try {
        playerRef.current?.disconnect();
      } catch {
        /* SDK can throw during teardown — best-effort */
      }
      playerRef.current = null;
    };

    const failSdk = () => {
      if (destroyed) return;
      // Invalidate any in-flight registration poll before flipping the flag,
      // so a poll that resolves between here and the next render can't
      // overwrite sdkFailed=true with a stale setDeviceId.
      pollGeneration++;
      // The SDK player is still connected to Spotify Connect even after we
      // give up on it — without an explicit disconnect, the orphan device
      // hogs the user's active-device slot and can later "steal" playback
      // from the embed iframe fallback. Tear it down here, mirroring the
      // unmount cleanup path.
      disconnectActivePlayer();
      deviceIdRef.current = null;
      setDeviceId(null);
      setSdkFailed(true);
    };

    loadSpotifySdk(
      async () => {
        if (destroyed || !window.Spotify) return;
        // Clear any failure from a prior enabled session. Without this, an
        // enabled→disabled→enabled cycle after a failure (e.g. Free↔Premium or
        // disconnect→reconnect) would keep the stale sdkFailed=true and leave
        // the caller stuck on the iframe fallback even though the SDK is
        // re-initing. Done here (not synchronously in the effect body) to avoid
        // the react-hooks/set-state-in-effect anti-pattern; this callback runs
        // asynchronously once the SDK script is present.
        setSdkFailed(false);
        const player = new window.Spotify.Player({
          name: `SpartBoard (${instanceId})`,
          getOAuthToken: (cb) => {
            void getAccessTokenRef.current().then((t) => {
              if (t) cb(t);
            });
          },
          volume: 0.5,
        });

        player.addListener('ready', ({ device_id }) => {
          if (destroyed) return;
          // Don't expose device_id to the UI until Spotify Connect has actually
          // registered it server-side. The SDK fires 'ready' as soon as the
          // local device object exists, but server-side registration lags by
          // 1-3 seconds; calling /play, /repeat, /shuffle, or even /me/player
          // (transfer) before then returns 404 "Device not found". Polling
          // /v1/me/player/devices until the id is visible is the canonical fix.
          //
          // The poll captures its own generation. `not_ready`, a second
          // `ready`, and `failSdk` all bump pollGeneration so a late-resolving
          // poll can't write its (now stale) device_id back over the current
          // state.
          const myGeneration = ++pollGeneration;
          const isStillCurrent = () =>
            !destroyed && pollGeneration === myGeneration;
          void waitForDeviceRegistration(
            () => getAccessTokenRef.current(),
            device_id,
            () => !isStillCurrent()
          )
            .then((registered) => {
              if (!isStillCurrent()) return;
              if (registered) {
                deviceIdRef.current = device_id;
                setDeviceId(device_id);
              } else {
                // Device never appeared on Spotify Connect within the polling
                // window — fall back to the embed iframe.
                failSdk();
              }
            })
            .catch(() => {
              // waitForDeviceRegistration is defensive (fetchSpotifyDevices
              // swallows its own errors), so this catch is belt-and-suspenders
              // for an unexpected rejection (e.g. getAccessToken throwing).
              // Without it, an unhandled rejection would leave the hook stuck
              // — deviceId null AND sdkFailed false — the exact silent broken
              // state this patch was built to prevent.
              if (!isStillCurrent()) return;
              failSdk();
            });
        });
        player.addListener('not_ready', () => {
          if (destroyed) return;
          // Invalidate any in-flight registration poll: the device the poll
          // was tracking is gone, and we must not let its eventual resolve
          // setDeviceId back to the now-dead id.
          pollGeneration++;
          deviceIdRef.current = null;
          setDeviceId(null);
        });
        player.addListener('player_state_changed', (s: SpotifyPlayerState) => {
          if (destroyed || !s) return;
          setIsPlaying(!s.paused);
          const rm = s.repeat_mode ?? 0;
          repeatModeRef.current = rm;
          setRepeatModeState(rm);
          const sh = s.shuffle ?? false;
          shuffleRef.current = sh;
          setShuffleState(sh);
          const t = s.track_window?.current_track;
          setCurrentTrack(
            t
              ? {
                  name: t.name,
                  artist: t.artists?.map((a) => a.name).join(', ') ?? '',
                  image: t.album?.images?.[0]?.url,
                }
              : null
          );
        });
        // Fatal errors mean the SDK genuinely can't work for this session →
        // flip sdkFailed so the caller swaps in the embed iframe.
        player.addListener('initialization_error', failSdk);
        player.addListener('authentication_error', failSdk);
        player.addListener('account_error', failSdk);
        // playback_error is transient (a single track/context failing to start,
        // a momentary network blip) — it must NOT collapse the whole session to
        // the iframe fallback. Warn only; the SDK stays usable for the next play.
        player.addListener('playback_error', (e) => {
          if (destroyed) return;
          console.warn('[useSpotifyWebPlayback] playback_error (transient)', e);
        });

        try {
          const connected = await player.connect();
          if (destroyed) {
            // Connection completed after teardown — disconnect immediately.
            try {
              player.disconnect();
            } catch {
              /* best-effort */
            }
            return;
          }
          if (!connected) {
            // Disconnect the local player BEFORE failSdk: at this point
            // playerRef.current is still null, so failSdk's disconnect helper
            // would no-op and leak the orphan SDK device.
            try {
              player.disconnect();
            } catch {
              /* best-effort */
            }
            failSdk();
            return;
          }
          playerRef.current = player;
        } catch {
          // Same orphan-cleanup concern as the !connected path: player exists
          // but isn't in playerRef yet.
          try {
            player.disconnect();
          } catch {
            /* best-effort */
          }
          failSdk();
        }
      },
      () => {
        // SDK script never loaded (CDN blocked, network failure, timeout).
        failSdk();
      }
    );

    return () => {
      destroyed = true;
      // Invalidate any in-flight registration poll so its .then() bails.
      pollGeneration++;
      disconnectActivePlayer();
      // Reset device/playback so a re-enable starts clean.
      deviceIdRef.current = null;
      setDeviceId(null);
      setIsPlaying(false);
      repeatModeRef.current = 0;
      setRepeatModeState(0);
      shuffleRef.current = false;
      setShuffleState(false);
    };
  }, [enabled, instanceId]);

  const togglePlay = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    // First play: nothing loaded on this device yet but we have a target →
    // start it. player.togglePlay() only toggles already-loaded content, so on
    // a freshly-connected device it would no-op (no player_state_changed ever
    // fires). This restores the original "start the saved URI on first play"
    // behavior the SDK-hoist refactor dropped (reload-resume + paste-URL-then-
    // open-Now-Playing).
    if (!currentTrack && targetUriRef.current && deviceIdRef.current) {
      const token = await getAccessTokenRef.current();
      if (!token) return;
      const uri = targetUriRef.current;
      const parsed = parseSpotifyResource(uri);
      const payload =
        parsed?.type === 'track' ? { uris: [uri] } : { contextUri: uri };
      try {
        await playOnDevice(token, deviceIdRef.current, payload);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Premium-required can surface here (Spotify returns 403 on the play
        // API even when the SDK initialized fine — e.g. account downgraded
        // between connect and first play). Flip sdkFailed so the caller swaps
        // in the embed iframe rather than leaving a permanently-broken button.
        if (msg === 'spotify-premium-required') {
          setSdkFailed(true);
        } else {
          console.warn(
            '[useSpotifyWebPlayback.togglePlay] first-play failed',
            err
          );
        }
      }
      return;
    }
    try {
      await player.togglePlay();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'spotify-premium-required') {
        setSdkFailed(true);
      }
    }
  }, [currentTrack]);

  const next = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      await player.nextTrack();
    } catch (err) {
      console.warn('[useSpotifyWebPlayback.next] failed', err);
    }
  }, []);

  const previous = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      await player.previousTrack();
    } catch (err) {
      console.warn('[useSpotifyWebPlayback.previous] failed', err);
    }
  }, []);

  // Cycle repeat off(0) → track(2) → context(1) → off(0). The Spotify SDK
  // reports repeat as 0/1/2 but the REST API takes string states, so map the
  // *next* mode to its string before calling setRepeatMode. Best-effort: a
  // missing device/token or a REST failure (e.g. 404 on an inactive device)
  // just warns — the controls are used while playback is active.
  const cycleRepeat = useCallback(async () => {
    const device = deviceIdRef.current;
    if (!device) return;
    const token = await getAccessTokenRef.current();
    if (!token) return;
    // off(0) → track(2) → context(1) → off(0)
    const nextMode =
      repeatModeRef.current === 0 ? 2 : repeatModeRef.current === 2 ? 1 : 0;
    const nextState =
      nextMode === 2 ? 'track' : nextMode === 1 ? 'context' : 'off';
    try {
      await setRepeatMode(token, device, nextState);
    } catch (err) {
      console.warn('[useSpotifyWebPlayback.cycleRepeat] failed', err);
    }
  }, []);

  const toggleShuffle = useCallback(async () => {
    const device = deviceIdRef.current;
    if (!device) return;
    const token = await getAccessTokenRef.current();
    if (!token) return;
    try {
      await setShuffle(token, device, !shuffleRef.current);
    } catch (err) {
      console.warn('[useSpotifyWebPlayback.toggleShuffle] failed', err);
    }
  }, []);

  return {
    deviceId,
    isReady: deviceId !== null,
    sdkFailed,
    currentTrack,
    isPlaying,
    repeatMode,
    shuffle,
    togglePlay,
    next,
    previous,
    cycleRepeat,
    toggleShuffle,
  };
}
