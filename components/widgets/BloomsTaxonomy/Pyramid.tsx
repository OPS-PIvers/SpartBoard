import React from 'react';
import {
  BLOOMS_LEVELS,
  BLOOMS_COLORS,
  BLOOMS_LABELS,
  type BloomsLevel,
} from './constants';

interface PyramidProps {
  onTierClick: (level: BloomsLevel, event: React.MouseEvent) => void;
  onTierKeyboardActivate: (level: BloomsLevel, element: HTMLElement) => void;
  onTierDragStart: (level: BloomsLevel, event: React.DragEvent) => void;
}

/**
 * Clip-path polygon points for each tier.
 * The pyramid is 6 tiers, bottom = widest, top = narrowest.
 * Index 0 = bottom (remember), index 5 = top (create).
 */
const TIER_CLIP_PATHS = [
  'polygon(0% 0%, 100% 0%, 92% 100%, 8% 100%)',
  'polygon(8% 0%, 92% 0%, 84% 100%, 16% 100%)',
  'polygon(16% 0%, 84% 0%, 76% 100%, 24% 100%)',
  'polygon(24% 0%, 76% 0%, 68% 100%, 32% 100%)',
  'polygon(32% 0%, 68% 0%, 60% 100%, 40% 100%)',
  'polygon(40% 0%, 60% 0%, 52% 100%, 48% 100%)',
];

export const Pyramid: React.FC<PyramidProps> = ({
  onTierClick,
  onTierKeyboardActivate,
  onTierDragStart,
}) => {
  // Render levels top-to-bottom visually: create at top, remember at bottom
  const reversedLevels = [...BLOOMS_LEVELS].reverse();

  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full select-none"
      style={{ padding: 'min(12px, 2.5cqmin)', gap: 'min(3px, 0.5cqmin)' }}
    >
      <div
        className="flex flex-col w-full"
        style={{
          gap: 'min(2px, 0.4cqmin)',
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
          maxWidth: '100%',
        }}
      >
        {reversedLevels.map((level, visualIndex) => {
          const tierIndex = BLOOMS_LEVELS.length - 1 - visualIndex;
          const clipPath = TIER_CLIP_PATHS[tierIndex];
          const color = BLOOMS_COLORS[level];
          const label = BLOOMS_LABELS[level];

          return (
            <div
              key={level}
              role="button"
              tabIndex={0}
              draggable
              className="relative flex items-center justify-center cursor-pointer transition-all duration-150"
              style={{
                clipPath,
                backgroundColor: color,
                height: 'min(60px, 13cqmin)',
              }}
              onClick={(e) => onTierClick(level, e)}
              onDragStart={(e) => onTierDragStart(level, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTierKeyboardActivate(level, e.currentTarget as HTMLElement);
                }
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.filter =
                  'brightness(1.15)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.filter = '';
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLElement).style.filter =
                  'brightness(0.9)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLElement).style.filter =
                  'brightness(1.15)';
              }}
            >
              <span
                className="font-bold text-white tracking-wide pointer-events-none"
                style={{
                  fontSize: 'min(16px, 5cqmin)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
