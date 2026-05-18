/**
 * One-time-per-user notice that personal Spotify playback in the Music
 * widget needs a Spotify Premium subscription. Free accounts can still
 * connect, but the Web Playback SDK refuses to start playback; Spotify
 * will reject `PUT /me/player/play` with 403 and the widget falls back
 * to the embed iframe (which limits Free users to 30-sec previews).
 *
 * Three exits:
 *   - "Got it, continue" — proceeds; remembered as shown for this session
 *   - "Don't show this again" + "Continue" — saves the preference and proceeds
 *   - "Cancel" — caller reverts to curated-stations source
 *
 * The "don't show again" preference lives in `utils/spotifyPremiumNotice.ts`
 * so this file exports only a React component (keeps Vite's react-refresh
 * happy).
 */

import React, { useState } from 'react';
import { Music2, X } from 'lucide-react';
import { setSpotifyPremiumNoticeDismissed } from '@/utils/spotifyPremiumNotice';

interface Props {
  uid: string;
  onContinue: () => void;
  onCancel: () => void;
}

export const SpotifyPremiumDialog: React.FC<Props> = ({
  uid,
  onContinue,
  onCancel,
}) => {
  const [dontShow, setDontShow] = useState(false);

  const handleContinue = () => {
    if (dontShow) setSpotifyPremiumNoticeDismissed(uid);
    onContinue();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spotify-premium-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Music2 className="w-5 h-5 text-green-700" />
            </div>
            <h2
              id="spotify-premium-title"
              className="text-lg font-bold text-slate-900"
            >
              Spotify Premium required
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition"
            aria-label="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3 text-sm text-slate-700">
          <p>
            Using your personal Spotify account for full playback in the Music
            widget requires an active{' '}
            <span className="font-semibold">Spotify Premium</span> subscription.
          </p>
          <p className="text-slate-600">
            If you connect a free Spotify account, the widget will fall back to
            the standard Spotify embed (which limits free accounts to 30-second
            previews). You can disconnect at any time and return to the curated
            stations.
          </p>
        </div>

        <label className="flex items-center gap-2 px-6 py-3 border-t border-slate-100 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
          />
          <span className="text-sm text-slate-700">
            Don&apos;t show this again
          </span>
        </label>

        <div className="px-6 pb-5 pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition"
          >
            Got it, continue
          </button>
        </div>
      </div>
    </div>
  );
};
