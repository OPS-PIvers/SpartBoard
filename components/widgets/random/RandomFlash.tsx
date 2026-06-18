import React from 'react';
import { useGlobalStyle } from '@/context/dashboardCanvasStore';

/**
 * Placeholder text shown when no winner has been picked yet. Exported so the
 * sizing formula in RandomWidget can match its width to this exact string —
 * keep the two in sync if this is ever translated or replaced.
 */
export const RANDOM_FLASH_PLACEHOLDER = 'Ready?';

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
  const globalStyle = useGlobalStyle();

  const fontStyle = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;

  // Defensive: this component only renders strings. If stale state ever hands
  // us an array (e.g., RandomGroup[] from a prior 'groups' run), fall back to
  // the idle label rather than crashing React with "Objects are not valid as
  // a React child".
  const label =
    typeof displayResult === 'string' && displayResult.length > 0
      ? displayResult
      : RANDOM_FLASH_PLACEHOLDER;

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
        {label}
      </span>
    </div>
  );
};
