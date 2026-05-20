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

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    className="text-slate-500 uppercase tracking-wider font-semibold"
    style={{
      fontSize: 'min(13px, 4cqmin)',
      padding: '0 min(12px, 3cqmin)',
      marginTop: 'min(16px, 4cqmin)',
      marginBottom: 'min(6px, 1.5cqmin)',
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
        className="rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-100"
        style={{
          margin: 'min(12px, 3cqmin)',
          padding: 'min(16px, 4cqmin)',
          fontSize: 'min(15px, 4.5cqmin)',
        }}
      >
        <div
          style={{ marginBottom: 'min(8px, 2cqmin)' }}
          className="font-semibold"
        >
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
  }

  if (isLoading && playlists.length === 0 && recents.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
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
        className="flex flex-col items-center justify-center text-center text-slate-400 h-full"
        style={{ padding: 'min(24px, 6cqmin)', fontSize: 'min(16px, 5cqmin)' }}
      >
        <div>No playlists in your Spotify account yet.</div>
        <div
          className="text-slate-500"
          style={{
            marginTop: 'min(6px, 1.5cqmin)',
            fontSize: 'min(14px, 4cqmin)',
          }}
        >
          Tap the Search tab to find something.
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col overflow-y-auto h-full"
      style={{ paddingBottom: 'min(12px, 3cqmin)' }}
    >
      <div
        className="flex justify-end"
        style={{ padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin) 0' }}
      >
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh library"
          className="text-slate-500 hover:text-slate-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded"
          style={{ padding: 'min(6px, 1.5cqmin)' }}
        >
          <RefreshCw
            style={{
              width: 'min(18px, 4.5cqmin)',
              height: 'min(18px, 4.5cqmin)',
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
