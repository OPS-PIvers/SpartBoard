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
import { parseSpotifyResource, playOnDevice } from '@/utils/spotifyAuth';

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
  togglePlay: () => Promise<void>;
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
  const [sdkFailed, setSdkFailed] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyPlaybackTrack | null>(
    null
  );
  const playerRef = useRef<SpotifyPlayer | null>(null);
  // Mirror deviceId in a ref so togglePlay can read the connected device
  // without depending on deviceId state (which would re-create the callback
  // on every connect/disconnect).
  const deviceIdRef = useRef<string | null>(null);

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

    const failSdk = () => {
      if (destroyed) return;
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
          deviceIdRef.current = device_id;
          setDeviceId(device_id);
        });
        player.addListener('not_ready', () => {
          if (destroyed) return;
          deviceIdRef.current = null;
          setDeviceId(null);
        });
        player.addListener('player_state_changed', (s: SpotifyPlayerState) => {
          if (destroyed || !s) return;
          setIsPlaying(!s.paused);
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
            failSdk();
            return;
          }
          playerRef.current = player;
        } catch {
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
      try {
        playerRef.current?.disconnect();
      } catch {
        /* SDK can throw during teardown — best-effort */
      }
      playerRef.current = null;
      // Reset device/playback so a re-enable starts clean.
      deviceIdRef.current = null;
      setDeviceId(null);
      setIsPlaying(false);
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

  return {
    deviceId,
    isReady: deviceId !== null,
    sdkFailed,
    currentTrack,
    isPlaying,
    togglePlay,
  };
}
