import React from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { DEFAULT_GLOBAL_STYLE } from '../../../types';

interface RandomSlotsProps {
  displayResult: string | string[] | string[][] | null;
  fontSize?: number | string;
  slotHeight?: number;
}

export const RandomSlots: React.FC<RandomSlotsProps> = ({
  displayResult,
  fontSize,
  slotHeight,
}) => {
  const { activeDashboard } = useDashboard();
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;

  const fontStyle = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;

  return (
    <div
      className={`w-full overflow-hidden relative bg-slate-900 rounded-[2.5rem] border-[8px] border-slate-800 shadow-[inset_0_4px_20px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center font-${globalStyle.fontFamily}`}
      style={{ height: slotHeight }}
    >
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black to-transparent z-10" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent z-10" />
      <div
        className="text-white font-black text-center px-4 transition-all duration-75 uppercase tracking-tighter"
        style={{
          fontSize: `min(250px, ${fontStyle})`,
          lineHeight: 1,
          maxWidth: '100%',
          wordBreak: 'normal',
          overflowWrap: 'normal',
        }}
      >
        {(displayResult as string) ?? 'Ready?'}
      </div>
      <div className="absolute left-0 right-0 h-1 bg-brand-blue-primary/20 top-1/2 -translate-y-1/2" />
    </div>
  );
};
