/**
 * PersonalSpotifyNowPlayingTab
 *
 * Renders the "Now Playing" tab for the Personal Spotify source.
 *
 * Props:
 *  - url: the raw Spotify URL/URI selected by the teacher, or null when
 *    nothing has been picked yet.
 *  - onSwitchToLibrary: callback fired when the teacher clicks the
 *    "Open library" CTA in the empty state.
 *
 * Behaviour:
 *  - url is null → empty state with "Open library" button.
 *  - url set + Premium + SDK init OK → Spotify Web Playback SDK surface
 *    (album art + track name + artist + play/pause button).
 *  - url set + Free tier OR SDK init failure → Spotify embed iframe
 *    (30-second previews).
 *
 * The SDK player and iframe fallback are copied verbatim from
 * PersonalSpotifyPlayer.tsx (intentional duplication — Task 11 will
 * strip the duplicate from PersonalSpotifyPlayer and wire the dispatch).
 */

import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Loader2, Music2, Pause, Play } from 'lucide-react';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import {
  parseSpotifyResource,
  playOnDevice,
  spotifyOpenUrlFromInput,
} from '@/utils/spotifyAuth';
import {
  loadSpotifySdk,
  SpotifyPlayer,
  SpotifyPlayerState,
} from '@/utils/spotifyPlaybackSdk';
import { buildSpotifyEmbedUrl } from './utils';

export interface SdkState {
  deviceId: string | null;
  isPlaying: boolean;
}

interface Props {
  url: string | null;
  thumbnail?: string;
  label?: string;
  onSwitchToLibrary: () => void;
  onSdkState?: (state: SdkState) => void;
}

export const PersonalSpotifyNowPlayingTab: React.FC<Props> = ({
  url,
  thumbnail,
  label,
  onSwitchToLibrary,
  onSdkState,
}) => {
  const { isPremium, getAccessToken } = useSpotifyAuth();

  // ── 1. Empty state ──────────────────────────────────────────────────────────
  if (!url) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center h-full text-slate-400"
        style={{ padding: 'min(20px, 5cqmin)', fontSize: 'min(13px, 4cqmin)' }}
      >
        <div style={{ marginBottom: 'min(8px, 2cqmin)' }}>
          Pick something from your library or search to start.
        </div>
        <button
          type="button"
          onClick={onSwitchToLibrary}
          className="text-green-400 hover:text-green-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded"
          style={{
            fontSize: 'min(12px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(4px, 1cqmin)',
          }}
        >
          Open library
        </button>
      </div>
    );
  }

  // ── 2. Parse URL and build embed URL ────────────────────────────────────────
  const parsed = parseSpotifyResource(url);
  const openUrlForEmbed = spotifyOpenUrlFromInput(url);
  const embedUrl = openUrlForEmbed
    ? buildSpotifyEmbedUrl(openUrlForEmbed)
    : null;

  // ── 3. Free tier → embed iframe ─────────────────────────────────────────────
  if (!isPremium) {
    return embedUrl ? <EmbedFallback url={embedUrl} title={label} /> : null;
  }

  // ── 4. Premium + parsed → SDK player ────────────────────────────────────────
  if (!parsed) {
    // URL is set but not parseable — the embed at least gives 30-second preview.
    return embedUrl ? <EmbedFallback url={embedUrl} title={label} /> : null;
  }

  return (
    <PremiumSdkPlayer
      contextUri={parsed.type === 'track' ? null : parsed.uri}
      trackUri={parsed.type === 'track' ? parsed.uri : null}
      thumbnail={thumbnail}
      label={label}
      getAccessToken={getAccessToken}
      embedFallbackUrl={embedUrl}
      onSdkState={onSdkState}
    />
  );
};

// ---------------------------------------------------------------------------
// Free-tier embed fallback
// ---------------------------------------------------------------------------

const EmbedFallback: React.FC<{ url: string; title?: string }> = ({
  url,
  title,
}) => (
  <WidgetLayout
    padding="p-0"
    content={
      <div className="w-full h-full overflow-hidden rounded-2xl bg-black">
        <iframe
          src={url}
          title={`Spotify: ${title ?? 'preview'}`}
          width="100%"
          height="100%"
          allow="encrypted-media; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="border-none w-full h-full"
        />
      </div>
    }
  />
);

// ---------------------------------------------------------------------------
// Premium SDK player
// ---------------------------------------------------------------------------

interface PremiumProps {
  contextUri: string | null;
  trackUri: string | null;
  thumbnail?: string;
  label?: string;
  embedFallbackUrl: string | null;
  getAccessToken: () => Promise<string | null>;
  onSdkState?: (state: SdkState) => void;
}

const PremiumSdkPlayer: React.FC<PremiumProps> = ({
  contextUri,
  trackUri,
  thumbnail,
  label,
  embedFallbackUrl,
  getAccessToken,
  onSdkState,
}) => {
  // Stable instance ID for the Spotify Player name.
  const instanceId = useId();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Any unrecoverable SDK failure (script never loaded, init/auth/account
  // errors, connect() returned false) sets this. When true the component
  // falls back to the embed iframe rather than rendering a broken SDK shell.
  const [sdkFailed, setSdkFailed] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<{
    name?: string;
    artist?: string;
    image?: string;
  }>({});
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const lastPlayedUriRef = useRef<string | null>(null);
  // Ref to hold the latest onSdkState callback without re-running the SDK
  // setup effect on every render. Updated via useLayoutEffect so the closure
  // inside the SDK effect always reads the current value without causing a
  // re-init of the SDK player.
  const onSdkStateRef = useRef(onSdkState);
  useLayoutEffect(() => {
    onSdkStateRef.current = onSdkState;
  });

  // Initialize the Web Playback SDK once per component instance.
  useEffect(() => {
    let destroyed = false;
    // Track local deviceId and isPaused so SDK event handlers can emit a
    // consistent SdkState without depending on stale React state.
    let localDeviceId: string | null = null;
    let localIsPaused = true;

    const failSdk = (message: string) => {
      if (destroyed) return;
      setError(message);
      setSdkFailed(true);
    };

    loadSpotifySdk(
      async () => {
        if (destroyed || !window.Spotify) return;
        const player = new window.Spotify.Player({
          name: `SpartBoard (${instanceId})`,
          getOAuthToken: (cb) => {
            void getAccessToken().then((t) => {
              if (t) cb(t);
            });
          },
          volume: 0.5,
        });

        player.addListener('ready', ({ device_id }) => {
          if (destroyed) return;
          localDeviceId = device_id;
          setDeviceId(device_id);
          onSdkStateRef.current?.({
            deviceId: device_id,
            isPlaying: !localIsPaused,
          });
        });
        player.addListener('not_ready', () => {
          if (destroyed) return;
          localDeviceId = null;
          setDeviceId(null);
          onSdkStateRef.current?.({ deviceId: null, isPlaying: false });
        });
        player.addListener('player_state_changed', (s: SpotifyPlayerState) => {
          if (destroyed || !s) return;
          localIsPaused = s.paused;
          setIsPaused(s.paused);
          onSdkStateRef.current?.({
            deviceId: localDeviceId,
            isPlaying: !s.paused,
          });
          const t = s.track_window?.current_track;
          setCurrentTrack({
            name: t?.name,
            artist: t?.artists?.map((a) => a.name).join(', '),
            image: t?.album?.images?.[0]?.url,
          });
        });
        player.addListener('initialization_error', ({ message }) => {
          failSdk(`Spotify SDK init failed: ${message}`);
        });
        player.addListener('authentication_error', ({ message }) => {
          failSdk(`Spotify auth error: ${message}`);
        });
        player.addListener('account_error', ({ message }) => {
          failSdk(
            message.toLowerCase().includes('premium')
              ? 'Spotify Premium is required for full playback. Falling back to preview.'
              : `Spotify account error: ${message}`
          );
        });
        player.addListener('playback_error', ({ message }) => {
          // Playback errors are usually transient (network blip) — surface
          // but don't collapse to the embed; the user can retry.
          if (!destroyed) setError(`Spotify playback error: ${message}`);
        });

        try {
          const connected = await player.connect();
          if (!connected) {
            failSdk('Spotify Web Playback SDK could not connect.');
            return;
          }
          playerRef.current = player;
        } catch (err) {
          failSdk(err instanceof Error ? err.message : String(err));
        }
      },
      (err) => {
        // SDK script never loaded (CDN blocked, network failure, timeout).
        failSdk(
          `Couldn't load Spotify Web Playback SDK: ${err.message}. Falling back to preview.`
        );
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
    };
  }, [getAccessToken, instanceId]);

  const togglePlay = async () => {
    if (!playerRef.current) return;
    setError(null);

    // First play: start the selected URI on this device.
    const targetUri = trackUri ?? contextUri;
    if (targetUri && lastPlayedUriRef.current !== targetUri) {
      const token = await getAccessToken();
      if (!token || !deviceId) {
        setError('Spotify not ready yet — try again in a moment.');
        return;
      }
      try {
        await playOnDevice(token, deviceId, {
          contextUri: contextUri ?? undefined,
          uris: trackUri ? [trackUri] : undefined,
        });
        lastPlayedUriRef.current = targetUri;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'spotify-premium-required') {
          // Premium-required can surface here too (Spotify returns 403 on the
          // play API even when the SDK itself initialized fine — e.g. account
          // downgraded between connect and first play). Flip sdkFailed so the
          // render-time guard below swaps in the embed iframe; without this
          // the user sees a permanently-broken play button.
          setError(
            'Spotify rejected playback (Premium required). Falling back to preview.'
          );
          setSdkFailed(true);
        } else {
          setError(msg);
        }
      }
      return;
    }

    try {
      await playerRef.current.togglePlay();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Any unrecoverable SDK failure → embed iframe so the teacher still gets
  // *something* rather than a broken card. Covers Premium-required, SDK
  // script load failure, init/auth errors, and connect()-returned-false.
  if (sdkFailed && embedFallbackUrl) {
    return <EmbedFallback url={embedFallbackUrl} title={label} />;
  }

  const displayImage = currentTrack.image ?? thumbnail;
  const displayName = currentTrack.name ?? label ?? 'Spotify';
  const displayArtist = currentTrack.artist ?? '';

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="w-full h-full rounded-2xl overflow-hidden relative bg-gradient-to-br from-slate-900 via-slate-800 to-green-950 flex flex-col">
          <div
            className="flex-1 flex flex-col items-center justify-center text-center"
            style={{
              padding: 'min(16px, 5cqmin)',
              gap: 'min(12px, 4cqmin)',
            }}
          >
            {displayImage ? (
              <img
                src={displayImage}
                alt=""
                className="rounded-xl object-cover shadow-2xl"
                style={{
                  width: 'min(140px, 50cqmin)',
                  height: 'min(140px, 50cqmin)',
                }}
              />
            ) : (
              <div
                className="rounded-xl bg-slate-700 flex items-center justify-center shadow-2xl"
                style={{
                  width: 'min(140px, 50cqmin)',
                  height: 'min(140px, 50cqmin)',
                }}
              >
                <Music2
                  className="text-slate-400"
                  style={{
                    width: 'min(48px, 20cqmin)',
                    height: 'min(48px, 20cqmin)',
                  }}
                />
              </div>
            )}
            <div className="w-full">
              <p
                className="font-black text-white truncate"
                style={{ fontSize: 'min(16px, 7cqmin)' }}
              >
                {displayName}
              </p>
              {displayArtist && (
                <p
                  className="font-medium text-white/70 truncate"
                  style={{
                    fontSize: 'min(12px, 5cqmin)',
                    marginTop: 'min(2px, 1cqmin)',
                  }}
                >
                  {displayArtist}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void togglePlay()}
              aria-label={isPaused ? 'Play' : 'Pause'}
              disabled={!deviceId}
              className="rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: 'min(56px, 20cqmin)',
                height: 'min(56px, 20cqmin)',
              }}
            >
              {!deviceId ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: '40%', height: '40%' }}
                />
              ) : isPaused ? (
                <Play
                  className="fill-current"
                  style={{ width: '40%', height: '40%', marginLeft: '8%' }}
                />
              ) : (
                <Pause
                  className="fill-current"
                  style={{ width: '40%', height: '40%' }}
                />
              )}
            </button>
            {error && (
              <p
                className="text-amber-300 font-medium"
                style={{ fontSize: 'min(11px, 4cqmin)' }}
              >
                {error}
              </p>
            )}
          </div>
        </div>
      }
    />
  );
};
