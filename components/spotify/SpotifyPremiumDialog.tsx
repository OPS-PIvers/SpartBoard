/**
 * Notice that personal Spotify playback in the Music widget needs a Spotify
 * Premium subscription. Free accounts can still connect, but the Web
 * Playback SDK refuses to start playback; Spotify will reject
 * `PUT /me/player/play` with 403 and the widget falls back to the embed
 * iframe (which limits Free users to 30-sec previews).
 *
 * Three exits:
 *   - "Got it, continue" — proceeds with the connect flow
 *   - "Don't show this again" + "Continue" — persists the suppression and
 *     proceeds; future connect attempts skip this dialog
 *   - "Cancel" — caller reverts to curated-stations source
 *
 * The "don't show again" preference lives in `utils/spotifyPremiumNotice.ts`
 * so this file exports only a React component (keeps Vite's react-refresh
 * happy).
 *
 * Uses the shared `Modal` component for backdrop, Escape-to-close, body
 * scroll lock, and `createPortal` to `document.body` (which also escapes
 * the settings panel's `will-change: transform` containing block, so a
 * `position: fixed` modal renders against the viewport).
 */

import React, { useState } from 'react';
import { Music2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
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

  const customHeader = (
    <div className="flex items-center gap-2.5 px-6 pt-5 pb-2">
      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
        <Music2 className="w-5 h-5 text-green-700" />
      </div>
      <h3
        id="spotify-premium-title"
        className="text-lg font-bold text-slate-900"
      >
        Spotify Premium required
      </h3>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2">
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
  );

  return (
    <Modal
      isOpen
      onClose={onCancel}
      maxWidth="max-w-md"
      ariaLabelledby="spotify-premium-title"
      customHeader={customHeader}
      contentClassName="px-0 pb-0"
      footer={footer}
      footerClassName="p-6 pt-3 border-t border-slate-100"
    >
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
    </Modal>
  );
};
