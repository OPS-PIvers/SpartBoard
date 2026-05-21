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
    className="w-full flex items-center rounded-lg hover:bg-white/5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
    style={{
      gap: 'min(12px, 3cqmin)',
      padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
    }}
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt={name}
        className="rounded-md object-cover flex-shrink-0 shadow-sm"
        style={{ width: 'min(56px, 14cqmin)', height: 'min(56px, 14cqmin)' }}
      />
    ) : (
      <div
        className="rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0"
        style={{ width: 'min(56px, 14cqmin)', height: 'min(56px, 14cqmin)' }}
      >
        <Music2
          className="text-slate-400"
          style={{
            width: 'min(28px, 7cqmin)',
            height: 'min(28px, 7cqmin)',
          }}
        />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <div
        className="truncate text-white font-medium"
        style={{ fontSize: 'min(22px, 6cqmin)', lineHeight: 1.25 }}
      >
        {name}
      </div>
      {subtitle && (
        <div
          className="truncate text-slate-400"
          style={{
            fontSize: 'min(15px, 4.5cqmin)',
            marginTop: 'min(2px, 0.5cqmin)',
          }}
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
        style={{ width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' }}
      />
    )}
  </button>
);
