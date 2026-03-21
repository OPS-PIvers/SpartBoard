import React, { useMemo } from 'react';
import { CustomDie } from '@/types';

export const DiceFace: React.FC<{
  value: number;
  isRolling: boolean;
  customDie?: CustomDie | null;
  size?: string;
}> = ({ value, isRolling, customDie, size = '45cqmin' }) => {
  const dotPositions: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  const faceData = useMemo(() => {
    if (!customDie) return null;
    return customDie.faces[value - 1] || customDie.faces[0];
  }, [customDie, value]);

  const renderContent = () => {
    if (customDie && faceData) {
      if (customDie.type === 'image' && faceData.value) {
        return (
          <img
            src={faceData.value}
            alt={`Face ${value}`}
            className="w-full h-full object-cover rounded-[15%]"
          />
        );
      } else if (customDie.type === 'text') {
        return (
          <div className="w-full h-full flex items-center justify-center p-[5%] text-center overflow-hidden">
            <span
              className="font-bold text-slate-800"
              style={{ fontSize: `calc(${size} * 0.15)` }}
            >
              {faceData.value}
            </span>
          </div>
        );
      }
    }

    return (
      <div
        className="grid grid-cols-3 grid-rows-3 w-full h-full"
        style={{ gap: 'min(6px, 1.5cqmin)', padding: '15%' }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            {dotPositions[value]?.includes(i) && (
              <div className="bg-slate-800 rounded-full shadow-sm w-[70%] h-[70%]" />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className={`
                  relative bg-white rounded-[20%] shadow-lg border-2 border-slate-200
                  flex items-center justify-center
                  transition-all duration-300
                  ${
                    isRolling
                      ? 'scale-110 rotate-12 shadow-indigo-500/20 shadow-2xl'
                      : 'scale-100 rotate-0'
                  }
                `}
      style={{ width: size, height: size }}
    >
      {renderContent()}
    </div>
  );
};
