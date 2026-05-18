/**
 * Renders the Music widget's front face when `config.source === 'personal'`.
 *
 * Behaviour:
 *  - Not connected → prompt to flip widget and connect.
 *  - Connected + Premium + valid URL → Spotify Web Playback SDK control surface
 *    (album art + track name + play/pause). Plays the user-selected URI on
 *    a SpartBoard "device" that lives only in this browser tab.
 *  - Connected + Free OR SDK init failure → falls back to the standard
 *    Spotify embed iframe (30-second previews on Free accounts).
 *
 * Premium gating is the *runtime* check (Spotify returns 403 on Free
 * accounts), not a hard front-end gate — the iframe fallback works for
 * everyone and the settings dialog has already warned the teacher.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Music2,
  Pause,
  Play,
  Settings as SettingsIcon,
} from 'lucide-react';
import { WidgetData, MusicConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
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

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyPlayer: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const {
    isConnected,
    isPremium,
    state: authState,
    getAccessToken,
  } = useSpotifyAuth();

  const url = config.personalSpotifyUrl ?? '';
  const parsed = url ? parseSpotifyResource(url) : null;
  // The embed iframe only understands https URLs. If the teacher pasted a
  // `spotify:track:...` URI, normalize it via `spotifyOpenUrlFromInput` so
  // the Free-tier fallback below doesn't render a blank card.
  const openUrlForEmbed = url ? spotifyOpenUrlFromInput(url) : null;
  const embedUrl = openUrlForEmbed
    ? buildSpotifyEmbedUrl(openUrlForEmbed)
    : null;

  // ---------- empty / disconnected states ----------
  if (authState.status === 'unknown') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music2}
            title="Loading Spotify…"
            subtitle="Checking your connection."
          />
        }
      />
    );
  }

  if (!isConnected) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music2}
            title="Connect Spotify"
            subtitle="Flip this widget and connect your Spotify account."
          />
        }
      />
    );
  }

  if (!parsed) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={SettingsIcon}
            title="Pick something to play"
            subtitle="Flip the widget to paste a Spotify URL or search."
          />
        }
      />
    );
  }

  // Free accounts: skip SDK entirely and use the embed fallback (preview-only).
  if (!isPremium) {
    return embedUrl ? (
      <EmbedFallback url={embedUrl} title={config.personalSpotifyLabel} />
    ) : null;
  }

  return (
    <PremiumSdkPlayer
      widget={widget}
      contextUri={parsed.type === 'track' ? null : parsed.uri}
      trackUri={parsed.type === 'track' ? parsed.uri : null}
      label={config.personalSpotifyLabel}
      thumbnail={config.personalSpotifyThumbnail}
      getAccessToken={getAccessToken}
      embedFallbackUrl={embedUrl}
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
  widget: WidgetData;
  contextUri: string | null;
  trackUri: string | null;
  label?: string;
  thumbnail?: string;
  embedFallbackUrl: string | null;
  getAccessToken: () => Promise<string | null>;
}

const PremiumSdkPlayer: React.FC<PremiumProps> = ({
  widget,
  contextUri,
  trackUri,
  label,
  thumbnail,
  embedFallbackUrl,
  getAccessToken,
}) => {
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

  // Initialize the Web Playback SDK once per widget instance.
  useEffect(() => {
    let destroyed = false;

    const failSdk = (message: string) => {
      if (destroyed) return;
      setError(message);
      setSdkFailed(true);
    };

    loadSpotifySdk(
      async () => {
        if (destroyed || !window.Spotify) return;
        const player = new window.Spotify.Player({
          name: `SpartBoard (widget ${widget.id.slice(0, 6)})`,
          getOAuthToken: (cb) => {
            void getAccessToken().then((t) => {
              if (t) cb(t);
            });
          },
          volume: 0.5,
        });

        player.addListener('ready', ({ device_id }) => {
          if (destroyed) return;
          setDeviceId(device_id);
        });
        player.addListener('not_ready', () => {
          if (destroyed) return;
          setDeviceId(null);
        });
        player.addListener('player_state_changed', (s: SpotifyPlayerState) => {
          if (destroyed || !s) return;
          setIsPaused(s.paused);
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
  }, [widget.id, getAccessToken]);

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
