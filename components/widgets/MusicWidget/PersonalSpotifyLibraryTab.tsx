import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useSpotifyLibrary } from '@/hooks/useSpotifyLibrary';
import { SpotifyResultRow } from './SpotifyResultRow';

export interface SpotifyPlayablePick {
  type: 'track' | 'playlist' | 'album';
  uri: string;
}

interface Props {
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
}

const Skeleton: React.FC = () => (
  <div
    data-testid="spotify-row-skeleton"
    className="flex items-center animate-pulse"
    style={{
      gap: 'min(8px, 2cqmin)',
      padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
    }}
  >
    <div
      className="rounded-sm bg-slate-700"
      style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
    />
    <div className="flex-1 space-y-1">
      <div className="h-3 bg-slate-700 rounded w-3/4" />
      <div className="h-2 bg-slate-800 rounded w-1/2" />
    </div>
  </div>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    className="text-slate-500 uppercase tracking-wider px-2"
    style={{
      fontSize: 'min(10px, 3cqmin)',
      letterSpacing: '0.05em',
      marginTop: 'min(12px, 3cqmin)',
      marginBottom: 'min(4px, 1cqmin)',
    }}
  >
    {children}
  </div>
);

export const PersonalSpotifyLibraryTab: React.FC<Props> = ({
  currentUri,
  onPlay,
  onReconnect,
}) => {
  const { playlists, recents, isLoading, error, refresh } = useSpotifyLibrary();

  if (error?.kind === 'scope') {
    return (
      <div
        className="m-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100"
        style={{
          padding: 'min(12px, 3cqmin)',
          fontSize: 'min(12px, 3.5cqmin)',
        }}
      >
        <div className="mb-2 font-semibold">
          Spotify connection needs an update
        </div>
        <div className="mb-3 text-amber-200/80">
          Your access has expanded. Reconnect to unlock playlists and recents.
        </div>
        <button
          type="button"
          onClick={onReconnect}
          className="px-3 py-1 rounded-md bg-amber-500 text-amber-950 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          style={{ fontSize: 'min(12px, 3.5cqmin)' }}
        >
          Reconnect
        </button>
      </div>
    );
  }

  if (isLoading && playlists.length === 0 && recents.length === 0) {
    return (
      <div className="flex flex-col">
        <SectionLabel>Recently played</SectionLabel>
        <Skeleton />
        <Skeleton />
        <SectionLabel>Your playlists</SectionLabel>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  }

  if (playlists.length === 0 && recents.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center text-slate-400"
        style={{ padding: 'min(20px, 5cqmin)', fontSize: 'min(13px, 4cqmin)' }}
      >
        <div>No playlists in your Spotify account yet.</div>
        <div
          className="text-slate-500"
          style={{
            marginTop: 'min(4px, 1cqmin)',
            fontSize: 'min(11px, 3.5cqmin)',
          }}
        >
          Tap the Search tab to find something.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full">
      <div
        className="flex justify-end"
        style={{ padding: 'min(4px, 1cqmin) min(8px, 2cqmin) 0' }}
      >
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh library"
          className="text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded"
          style={{ padding: 'min(4px, 1cqmin)' }}
        >
          <RefreshCw
            style={{
              width: 'min(14px, 3.5cqmin)',
              height: 'min(14px, 3.5cqmin)',
            }}
          />
        </button>
      </div>
      {recents.length > 0 && (
        <>
          <SectionLabel>Recently played</SectionLabel>
          {recents.map((t) => (
            <SpotifyResultRow
              key={t.id}
              name={t.name}
              subtitle={t.artist}
              imageUrl={t.imageUrl}
              isPlaying={t.uri === currentUri}
              onClick={() => onPlay({ type: 'track', uri: t.uri })}
            />
          ))}
        </>
      )}
      {playlists.length > 0 && (
        <>
          <SectionLabel>Your playlists</SectionLabel>
          {playlists.map((p) => (
            <SpotifyResultRow
              key={p.id}
              name={p.name}
              subtitle={`Playlist · ${p.owner}`}
              imageUrl={p.imageUrl}
              isPlaying={p.uri === currentUri}
              onClick={() => onPlay({ type: 'playlist', uri: p.uri })}
            />
          ))}
        </>
      )}
    </div>
  );
};
