/**
 * Shared list-state primitives for the personal-Spotify browse lists:
 *  - SpotifyRowSkeleton — pulse placeholder while recents/playlists load.
 *  - SpotifyReconnectBanner — shown when scope rotation requires a reconnect
 *    (error.kind === 'scope').
 *
 * Used by the Default layout's Songs/Playlists views. Kept cq-scaled so they
 * render correctly inside the container-query widget surface.
 */

import React from 'react';

export const SpotifyRowSkeleton: React.FC = () => (
  <div
    data-testid="spotify-row-skeleton"
    className="flex items-center animate-pulse"
    style={{
      gap: 'min(12px, 3cqmin)',
      padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
    }}
  >
    <div
      className="rounded-md bg-slate-700"
      style={{ width: 'min(56px, 14cqmin)', height: 'min(56px, 14cqmin)' }}
    />
    <div className="flex-1 space-y-2">
      <div
        className="bg-slate-700 rounded"
        style={{ height: 'min(16px, 4cqmin)', width: '75%' }}
      />
      <div
        className="bg-slate-800 rounded"
        style={{ height: 'min(12px, 3cqmin)', width: '50%' }}
      />
    </div>
  </div>
);

export const SpotifyReconnectBanner: React.FC<{ onReconnect: () => void }> = ({
  onReconnect,
}) => (
  <div
    className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100"
    style={{
      margin: 'min(12px, 3cqmin)',
      padding: 'min(16px, 4cqmin)',
      fontSize: 'min(15px, 4.5cqmin)',
    }}
  >
    <div style={{ marginBottom: 'min(8px, 2cqmin)' }} className="font-semibold">
      Spotify connection needs an update
    </div>
    <div
      style={{ marginBottom: 'min(12px, 3cqmin)' }}
      className="text-amber-200/80"
    >
      Your access has expanded. Reconnect to unlock playlists and recents.
    </div>
    <button
      type="button"
      onClick={onReconnect}
      className="rounded-md bg-amber-500 text-amber-950 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      style={{
        fontSize: 'min(15px, 4.5cqmin)',
        padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
      }}
    >
      Reconnect
    </button>
  </div>
);
