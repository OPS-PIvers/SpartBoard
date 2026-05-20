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
        gap: 'min(8px, 2cqmin)',
        padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
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
                ? 'bg-green-500 text-slate-950 font-semibold shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
              fontSize: 'min(16px, 5cqmin)',
            }}
          >
            <span>{TAB_LABELS[key]}</span>
            {key === 'now-playing' && isAudioActive && (
              <span
                aria-hidden="true"
                data-testid="audio-playing-dot"
                className="inline-block bg-green-400 rounded-full"
                style={{
                  width: 'min(8px, 2cqmin)',
                  height: 'min(8px, 2cqmin)',
                  marginLeft: 'min(6px, 1.5cqmin)',
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
