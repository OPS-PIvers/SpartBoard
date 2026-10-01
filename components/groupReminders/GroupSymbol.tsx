import React from 'react';
import type { RosterGroupSymbol } from '@/types';
import { groupIcon } from './groupIcons';

const LEGACY = { icon: 'square', color: '#94a3b8' };

/** A group's icon; groups made before symbols fall back to a slate square. */
export const GroupSymbol: React.FC<{
  symbol?: RosterGroupSymbol;
  className?: string;
  strokeWidth?: number;
}> = ({ symbol, className = 'w-7 h-7', strokeWidth = 2.25 }) => {
  const s = symbol ?? LEGACY;
  const { Icon } = groupIcon(s.icon);
  return (
    <Icon
      className={`${className} shrink-0`}
      style={{ color: s.color }}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
};
