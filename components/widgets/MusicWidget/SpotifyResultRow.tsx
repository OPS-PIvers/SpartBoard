import React from 'react';
import { Play, Music2 } from 'lucide-react';

interface Props {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  isPlaying: boolean;
  onClick: () => void;
}

export const SpotifyResultRow: React.FC<Props> = ({
  name,
  subtitle,
  imageUrl,
  isPlaying,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left transition-colors"
    style={{
      gap: 'min(8px, 2cqmin)',
      padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
    }}
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt={name}
        className="rounded-sm object-cover flex-shrink-0"
        style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
      />
    ) : (
      <div
        className="rounded-sm bg-slate-700 flex items-center justify-center flex-shrink-0"
        style={{ width: 'min(28px, 7cqmin)', height: 'min(28px, 7cqmin)' }}
      >
        <Music2
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div
        className="truncate text-white"
        style={{ fontSize: 'min(13px, 4.5cqmin)' }}
      >
        {name}
      </div>
      {subtitle && (
        <div
          className="truncate text-slate-400"
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          {subtitle}
        </div>
      )}
    </div>
    {isPlaying && (
      <Play
        aria-label="Currently playing"
        fill="currentColor"
        className="text-green-400 flex-shrink-0"
        style={{ width: 'min(14px, 3.5cqmin)', height: 'min(14px, 3.5cqmin)' }}
      />
    )}
  </button>
);
