import React from 'react';
import { POSTER_LEVELS } from '../constants';
import { STANDARD_COLORS } from '@/config/colors';

export const SpeedometerView: React.FC<{ volume: number }> = ({ volume }) => {
  const ANGLE_OFFSET = 180; // Start angle for the gauge (Left)
  const VOLUME_TO_ANGLE_RATIO = 1.8; // 180 degrees / 100 volume units
  const degToRad = (degrees: number) => (degrees * Math.PI) / 180;

  // Map volume (0-100) to angle (180-360 degrees)
  // 180 = Left, 270 = Up, 360 = Right
  const angle = ANGLE_OFFSET + volume * VOLUME_TO_ANGLE_RATIO;
  const centerX = 50;
  const centerY = 55;
  const radius = 40;
  const needleLen = 35;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
      <svg viewBox="0 0 100 60" className="w-full h-auto drop-shadow-sm">
        {/* Arcs */}
        {POSTER_LEVELS.map((level, i) => {
          const startVol = level.threshold;
          const endVol =
            i < POSTER_LEVELS.length - 1 ? POSTER_LEVELS[i + 1].threshold : 100;
          const startAngle = ANGLE_OFFSET + startVol * VOLUME_TO_ANGLE_RATIO;
          const endAngle = ANGLE_OFFSET + endVol * VOLUME_TO_ANGLE_RATIO;

          const x1 = centerX + radius * Math.cos(degToRad(startAngle));
          const y1 = centerY + radius * Math.sin(degToRad(startAngle));
          const x2 = centerX + radius * Math.cos(degToRad(endAngle));
          const y2 = centerY + radius * Math.sin(degToRad(endAngle));

          return (
            <path
              key={i}
              d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
              fill="none"
              stroke={level.color}
              strokeWidth="8"
              className="opacity-20"
            />
          );
        })}
        {/* Main Background Arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          className="stroke-white/10"
          strokeWidth="8"
        />
        {/* Needle */}
        <line
          x1={centerX}
          y1={centerY}
          x2={centerX + needleLen * Math.cos(degToRad(angle))}
          y2={centerY + needleLen * Math.sin(degToRad(angle))}
          stroke={STANDARD_COLORS.slate}
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-all duration-150 stroke-slate-800"
        />
        <circle
          cx={centerX}
          cy={centerY}
          r="3"
          fill={STANDARD_COLORS.slate}
          className="fill-slate-800"
        />
      </svg>
    </div>
  );
};
