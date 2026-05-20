import React from 'react';

export type SpotifyBrowserTab = 'library' | 'search' | 'now-playing';

interface Props {
  active: SpotifyBrowserTab;
  isAudioActive: boolean;
  onChange: (next: SpotifyBrowserTab) => void;
}

const TAB_LABELS: Record<SpotifyBrowserTab, string> = {
  library: 'Playlists',
  search: 'Search',
  'now-playing': 'Now playing',
};

const TABS: SpotifyBrowserTab[] = ['library', 'search', 'now-playing'];

export const PersonalSpotifyTabs: React.FC<Props> = ({
  active,
  isAudioActive,
  onChange,
}) => {
  return (
    <div
      className="flex"
      style={{
        gap: 'min(4px, 1cqmin)',
        padding: '0 min(8px, 2cqmin) min(4px, 1cqmin)',
      }}
    >
      {TABS.map((key) => {
        const isOn = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isOn}
            aria-label={
              key === 'now-playing' && isAudioActive
                ? 'Now playing — audio active'
                : undefined
            }
            className={`rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 ${
              isOn
                ? 'bg-green-500 text-slate-950 font-semibold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            style={{
              padding: 'min(4px, 1cqmin) min(10px, 2.5cqmin)',
              fontSize: 'min(11px, 3.5cqmin)',
            }}
          >
            <span>{TAB_LABELS[key]}</span>
            {key === 'now-playing' && isAudioActive && (
              <span
                aria-hidden="true"
                data-testid="audio-playing-dot"
                className="inline-block bg-green-400 rounded-full"
                style={{
                  width: 'min(5px, 1.2cqmin)',
                  height: 'min(5px, 1.2cqmin)',
                  marginLeft: 'min(4px, 1cqmin)',
                  verticalAlign: 'middle',
                  boxShadow: '0 0 4px rgba(74, 222, 128, 0.7)',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
