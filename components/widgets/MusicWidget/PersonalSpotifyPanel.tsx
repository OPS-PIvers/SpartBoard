/**
 * "Use my own Spotify" panel rendered inside the Music widget settings when
 * `config.source === 'personal'`. Encapsulates:
 *   - Connect / Disconnect flow (via `useSpotifyAuth`)
 *   - Premium-required dialog gate (first-time-per-user)
 *   - Account status display (email + Premium badge)
 *
 * Track/playlist selection lives on the widget front face (Search tab), which
 * writes `config.personalSpotifyUrl` directly — this panel is purely config.
 *
 * Kept as its own file because the settings flow is the most complex part of
 * the widget and would otherwise dominate Settings.tsx.
 */

import React, { useCallback, useState } from 'react';
import { CheckCircle2, Crown, Loader2, LogOut, Music2 } from 'lucide-react';
import { WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { SpotifyPremiumDialog } from '@/components/spotify/SpotifyPremiumDialog';
import { hasDismissedSpotifyPremiumNotice } from '@/utils/spotifyPremiumNotice';

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyPanel: React.FC<Props> = ({ widget }) => {
  const { user } = useAuth();
  const { updateWidget } = useDashboard();
  const { state, isPremium, connect, disconnect } = useSpotifyAuth();

  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [disconnectWarning, setDisconnectWarning] = useState<string | null>(
    null
  );

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
    // updateWidget merges partial config into existing state in
    // DashboardContext, so only the changed key is passed.
    updateWidget(widget.id, { config: { source: 'curated' } });
  }, [widget.id, updateWidget]);

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
            {state.message.toLowerCase().includes('403') && (
              <p className="mt-2 text-xs text-red-600">
                If you connected the wrong Spotify account: click{' '}
                <span className="font-semibold">Disconnect</span> below, then
                log out at{' '}
                <a
                  href="https://accounts.spotify.com/logout"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  accounts.spotify.com/logout
                </a>{' '}
                before clicking Connect again.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={triggerDisconnect}
              className="flex-1 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={handleConnectClick}
              className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition"
            >
              Try again
            </button>
          </div>
          {disconnectWarning && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              {disconnectWarning}
            </div>
          )}
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
        </div>
      )}
    </div>
  );
};
