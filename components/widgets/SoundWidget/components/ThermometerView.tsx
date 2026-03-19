import React from 'react';
import { getLevelData } from '../constants';

export const ThermometerView: React.FC<{ volume: number }> = ({ volume }) => {
  const { color } = getLevelData(volume);
  return (
    <div className="relative w-full h-full flex items-center justify-center py-4">
      <svg viewBox="0 0 40 100" className="h-full drop-shadow-sm">
        {/* Tube Background */}
        <rect
          x="15"
          y="5"
          width="10"
          height="75"
          rx="5"
          className="fill-white/20 stroke-white/30"
          strokeWidth="1"
        />
        {/* Liquid Fill */}
        <rect
          x="16"
          y={80 - volume * 0.7}
          width="8"
          height={volume * 0.7}
          fill={color}
          className="transition-all duration-75"
        />
        {/* Bottom Bulb */}
        <circle
          cx="20"
          cy="85"
          r="10"
          fill={color}
          className="stroke-white/30"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
};
