import React from 'react';

export const DiceFace: React.FC<{
  value: number;
  isRolling: boolean;
  size?: string;
}> = ({ value, isRolling, size = '45cqmin' }) => {
  const dotPositions: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
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
    </div>
  );
};
