import React, { useEffect, useRef } from 'react';
import {
  BLOOMS_COLORS,
  CATEGORY_LABELS,
  type BloomsLevel,
  type ContentCategory,
} from './constants';

interface RadialMenuProps {
  level: BloomsLevel;
  categories: ContentCategory[];
  position: { x: number; y: number };
  containerSize: { width: number; height: number };
  onSelect: (category: ContentCategory) => void;
  onClose: () => void;
}

export const RadialMenu: React.FC<RadialMenuProps> = ({
  level,
  categories,
  position,
  containerSize,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const color = BLOOMS_COLORS[level];

  // Close on click-away
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the same click that opened this menu from closing it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const { width: containerW, height: containerH } = containerSize;

  // Radius of the arc in pixels
  const radius = Math.min(containerW, containerH) * 0.28;
  const count = categories.length;
  // Arc from -90deg (top) spreading evenly
  const startAngle = -Math.PI / 2 - ((count - 1) * 0.35) / 2;
  const angleStep = 0.35;

  return (
    <div
      ref={menuRef}
      className="absolute z-50"
      style={{ left: position.x, top: position.y }}
    >
      {categories.map((cat, i) => {
        const angle = startAngle + i * angleStep;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        // Clamp pill center so the full pill stays within the container
        const pillLeft = position.x + px;
        const pillTop = position.y + py;
        const pillHalfW = 70; // ~half of pill width
        const pillHalfH = 16; // ~half of pill height
        const clampedLeft = Math.max(
          8 + pillHalfW,
          Math.min(containerW - 8 - pillHalfW, pillLeft)
        );
        const clampedTop = Math.max(
          8 + pillHalfH,
          Math.min(containerH - 8 - pillHalfH, pillTop)
        );
        const offsetX = clampedLeft - position.x;
        const offsetY = clampedTop - position.y;

        return (
          <button
            key={cat}
            className="absolute whitespace-nowrap rounded-full font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              left: offsetX,
              top: offsetY,
              transform: 'translate(-50%, -50%)',
              backgroundColor: color,
              fontSize: 'min(12px, 3.5cqmin)',
              padding: 'min(6px, 1.5cqmin) min(14px, 3.5cqmin)',
              border: '2px solid rgba(255,255,255,0.3)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(cat);
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
};
