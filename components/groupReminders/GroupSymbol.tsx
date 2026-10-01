import React from 'react';
import type { RosterGroupShape, RosterGroupSymbol } from '@/types';
import { defaultGroupSymbol } from '@/utils/groupReminders';

const SHAPE_PATHS: Record<RosterGroupShape, React.ReactNode> = {
  star: (
    <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
  ),
  circle: <circle cx="12" cy="12" r="9.5" />,
  square: <rect x="3" y="3" width="18" height="18" rx="3.5" />,
  triangle: <path d="M12 3l9.5 17h-19z" />,
  heart: (
    <path d="M12 21s-8.5-5.3-8.5-11.2C3.5 6.6 5.9 4.5 8.5 4.5c1.6 0 2.9.8 3.5 2 .6-1.2 1.9-2 3.5-2 2.6 0 5 2.1 5 5.3C20.5 15.7 12 21 12 21z" />
  ),
  diamond: <path d="M12 2l9 10-9 10-9-10z" />,
  hexagon: <path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" />,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
};

export const GroupShape: React.FC<{
  shape: RosterGroupShape;
  color: string;
  className?: string;
}> = ({ shape, color, className = 'w-8 h-8' }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill={color}
    aria-hidden="true"
  >
    {SHAPE_PATHS[shape]}
  </svg>
);

/** A group's shape or emoji; groups made before symbols fall back to a slate square. */
export const GroupSymbol: React.FC<{
  symbol?: RosterGroupSymbol;
  className?: string;
  emojiClassName?: string;
}> = ({ symbol, className = 'w-8 h-8', emojiClassName = 'text-2xl' }) => {
  const s = symbol ?? {
    ...defaultGroupSymbol(),
    shape: 'square',
    color: '#94a3b8',
  };
  if (s.kind === 'emoji' && s.emoji) {
    return (
      <span
        className={`${className} flex items-center justify-center leading-none ${emojiClassName}`}
        aria-hidden="true"
      >
        {s.emoji}
      </span>
    );
  }
  return (
    <GroupShape
      shape={s.shape ?? 'star'}
      color={s.color}
      className={className}
    />
  );
};
