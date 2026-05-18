import React from 'react';
import { Star } from 'lucide-react';
import { BackgroundItem } from './backgroundsHelpers';

interface BackgroundThumbnailProps {
  item: BackgroundItem;
  isActive: boolean;
  isFavorite: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}

export const BackgroundThumbnail: React.FC<BackgroundThumbnailProps> = ({
  item,
  isActive,
  isFavorite,
  onSelect,
  onToggleFavorite,
}) => (
  <div className="group relative">
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`block w-full aspect-video rounded-lg overflow-hidden border-2 transition-all ${
        isActive
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-lighter'
          : 'border-transparent hover:border-slate-300'
      }`}
      aria-label={item.label}
      aria-pressed={isActive}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt={item.label}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      ) : item.id.startsWith('custom:') ? (
        <div
          className="w-full h-full"
          style={{ background: item.id.slice('custom:'.length) }}
        />
      ) : item.id.startsWith('http://') || item.id.startsWith('https://') ? (
        <img
          src={item.id}
          alt={item.label}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      ) : (
        // Tailwind class string (built-in colors, patterns, gradients).
        // Apply directly as className so the swatch renders correctly.
        <div className={`w-full h-full ${item.id}`} />
      )}
      <span className="sr-only">{item.label}</span>
    </button>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggleFavorite(item.id);
      }}
      aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
      className={`absolute top-1.5 right-1.5 p-1 rounded-full transition-all ${
        isFavorite
          ? 'bg-amber-400 text-white opacity-100'
          : 'bg-black/40 text-white opacity-0 group-hover:opacity-100 focus:opacity-100'
      }`}
    >
      <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
    </button>
  </div>
);
