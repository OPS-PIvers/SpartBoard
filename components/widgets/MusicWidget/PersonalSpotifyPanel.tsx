/**
 * "Use my own Spotify" panel rendered inside the Music widget settings when
 * `config.source === 'personal'`. Encapsulates:
 *   - Connect / Disconnect flow (via `useSpotifyAuth`)
 *   - Premium-required dialog gate (first-time-per-user)
 *   - Spotify URL paste field + live search dropdown
 *   - Account status display (email + Premium badge)
 *
 * Kept as its own file because the settings flow is the most complex part of
 * the widget and would otherwise dominate Settings.tsx.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Disc3,
  ListMusic,
  Loader2,
  LogOut,
  Music2,
  Search,
} from 'lucide-react';
import { WidgetData, MusicConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import {
  parseSpotifyResource,
  searchSpotify,
  SpotifySearchResult,
  spotifyOpenUrlFromInput,
} from '@/utils/spotifyAuth';
import { SpotifyPremiumDialog } from '@/components/spotify/SpotifyPremiumDialog';
import { hasDismissedSpotifyPremiumNotice } from '@/utils/spotifyPremiumNotice';

const TYPE_ICONS = {
  track: Disc3,
  album: Disc3,
  playlist: ListMusic,
  artist: Music2,
} as const;

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyPanel: React.FC<Props> = ({ widget }) => {
  const { user } = useAuth();
  const { updateWidget } = useDashboard();
  const config = widget.config as MusicConfig;
  const { state, isConnected, isPremium, connect, disconnect, getAccessToken } =
    useSpotifyAuth();

  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [urlInput, setUrlInput] = useState(config.personalSpotifyUrl ?? '');
  const [searchResults, setSearchResults] = useState<SpotifySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [disconnectWarning, setDisconnectWarning] = useState<string | null>(
    null
  );

  // Keep the input in sync if the config changes externally (e.g. via another tab).
  useEffect(() => {
    setUrlInput(config.personalSpotifyUrl ?? '');
  }, [config.personalSpotifyUrl]);

  // Debounced Spotify search whenever the user types something that isn't a URL.
  // URLs go straight to the save handler — no point burning a search call.
  useEffect(() => {
    const trimmed = urlInput.trim();
    if (!trimmed || !isConnected) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    if (parseSpotifyResource(trimmed)) {
      // Pasted a valid URL — no search needed.
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const token = await getAccessToken();
        if (!token) {
          setSearchError('Spotify session expired — reconnect.');
          setSearchResults([]);
          return;
        }
        const results = await searchSpotify(token, trimmed, controller.signal);
        setSearchResults(results);
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [urlInput, isConnected, getAccessToken]);

  const triggerConnect = useCallback(async () => {
    // Error prettification + state surfacing live in `useSpotifyAuth` so
    // every subscriber (panel + already-mounted player) sees the same
    // message. We just need to fire the popup here.
    setDisconnectWarning(null);
    await connect();
  }, [connect]);

  const triggerDisconnect = useCallback(async () => {
    setDisconnectWarning(null);
    const result = await disconnect();
    if (!result.ok) {
      setDisconnectWarning(result.message);
    }
  }, [disconnect]);

  const handleConnectClick = useCallback(() => {
    if (!user) return;
    if (hasDismissedSpotifyPremiumNotice(user.uid)) {
      void triggerConnect();
      return;
    }
    setShowPremiumDialog(true);
  }, [user, triggerConnect]);

  const handlePremiumContinue = useCallback(() => {
    setShowPremiumDialog(false);
    void triggerConnect();
  }, [triggerConnect]);

  const handlePremiumCancel = useCallback(() => {
    setShowPremiumDialog(false);
    // Revert source so the widget goes back to curated stations.
    updateWidget(widget.id, { config: { ...config, source: 'curated' } });
  }, [config, widget.id, updateWidget]);

  const handleUrlBlur = useCallback(() => {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      updateWidget(widget.id, {
        config: {
          ...config,
          personalSpotifyUrl: '',
          personalSpotifyLabel: '',
          personalSpotifyThumbnail: '',
        },
      });
      return;
    }
    if (!parseSpotifyResource(trimmed)) return;
    // Clear the cached label + thumbnail unless this input already matches
    // the saved selection. Without this, pasting a different valid URL
    // leaves the prior track's label/thumbnail displayed alongside the new
    // URL until the SDK happens to update it.
    if (trimmed === config.personalSpotifyUrl) return;
    updateWidget(widget.id, {
      config: {
        ...config,
        personalSpotifyUrl: trimmed,
        personalSpotifyLabel: '',
        personalSpotifyThumbnail: '',
      },
    });
  }, [urlInput, config, widget.id, updateWidget]);

  const pickResult = useCallback(
    (result: SpotifySearchResult) => {
      const openUrl = spotifyOpenUrlFromInput(result.uri) ?? result.uri;
      updateWidget(widget.id, {
        config: {
          ...config,
          personalSpotifyUrl: openUrl,
          personalSpotifyLabel: `${result.name} — ${result.subtitle}`,
          personalSpotifyThumbnail: result.imageUrl ?? '',
        },
      });
      setUrlInput(openUrl);
      setSearchResults([]);
    },
    [config, widget.id, updateWidget]
  );

  return (
    <div className="space-y-4">
      {showPremiumDialog && user && (
        <SpotifyPremiumDialog
          uid={user.uid}
          onContinue={handlePremiumContinue}
          onCancel={handlePremiumCancel}
        />
      )}

      {/* ── Connection status / Connect button ── */}
      {state.status === 'unknown' && (
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking Spotify connection…
        </div>
      )}

      {state.status === 'disconnected' && (
        <button
          type="button"
          onClick={handleConnectClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold text-sm transition shadow-sm"
        >
          <Music2 className="w-4 h-4" />
          Connect Spotify account
        </button>
      )}

      {state.status === 'connecting' && (
        <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200 text-sm text-green-700">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for Spotify consent…
        </div>
      )}

      {state.status === 'error' && (
        <div className="space-y-2">
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-700">
            <p className="font-semibold mb-1">Couldn&apos;t connect Spotify</p>
            <p>{state.message}</p>
          </div>
          <button
            type="button"
            onClick={handleConnectClick}
            className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition"
          >
            Try again
          </button>
        </div>
      )}

      {state.status === 'connected' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-green-900 truncate">
                  {state.profile.displayName ??
                    state.profile.email ??
                    'Spotify connected'}
                </p>
                <p className="text-xs text-green-700 flex items-center gap-1">
                  {isPremium ? (
                    <>
                      <Crown className="w-3 h-3" />
                      Premium
                    </>
                  ) : (
                    'Free (preview-only playback)'
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void triggerDisconnect()}
              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition"
              title="Disconnect Spotify"
              aria-label="Disconnect Spotify"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {disconnectWarning && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              {disconnectWarning}
            </div>
          )}

          {!isPremium && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              Your Spotify account isn&apos;t Premium. Playback will fall back
              to Spotify&apos;s embed player (30-second previews only).
            </div>
          )}

          {/* ── URL / search input ── */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Spotify URL or search
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="Paste a Spotify URL or search…"
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            {config.personalSpotifyLabel && (
              <p className="text-xs text-slate-500 truncate">
                Selected:{' '}
                <span className="text-slate-700 font-medium">
                  {config.personalSpotifyLabel}
                </span>
              </p>
            )}
            {searchError && (
              <p className="text-xs text-red-600">{searchError}</p>
            )}
          </div>

          {/* ── Search results ── */}
          {(isSearching || searchResults.length > 0) && (
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              {isSearching && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 bg-slate-50">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Searching Spotify…
                </div>
              )}
              {searchResults.map((r) => {
                const Icon = TYPE_ICONS[r.type] ?? Music2;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onClick={() => pickResult(r)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition text-left border-b border-slate-100 last:border-b-0"
                  >
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {r.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {r.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
