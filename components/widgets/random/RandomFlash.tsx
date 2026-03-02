import React from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { DEFAULT_GLOBAL_STYLE } from '../../../types';

interface RandomFlashProps {
  displayResult: string | string[] | string[][] | null;
  isSpinning: boolean;
  fontSize?: number | string;
}

export const RandomFlash: React.FC<RandomFlashProps> = ({
  displayResult,
  isSpinning,
  fontSize,
}) => {
  const { activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  const fontStyle = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;

  return (
    <div
      className={`text-center font-black transition-all duration-300 w-full flex items-center justify-center font-${globalStyle.fontFamily} ${
        isSpinning
          ? 'scale-90 opacity-30 grayscale'
          : 'scale-100 text-brand-blue-primary drop-shadow-xl'
      }`}
      style={{
        fontSize: `min(300px, ${fontStyle})`,
        height: '100%',
        padding: 'min(12px, 2.5cqmin)',
      }}
    >
      <span
        className="leading-tight uppercase"
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          textAlign: 'center',
          wordBreak: 'normal',
          overflowWrap: 'normal',
        }}
      >
        {(displayResult as string) ?? 'Ready?'}
      </span>
    </div>
  );
};
