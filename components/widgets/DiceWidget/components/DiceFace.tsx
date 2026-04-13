import React from 'react';

interface DiceFaceProps {
  value: number;
  isRolling: boolean;
  size?: string;
  diceColor?: string;
  dotColor?: string;
}

export const DiceFace: React.FC<DiceFaceProps> = ({
  value,
  isRolling,
  size = '45cqmin',
  diceColor = '#ffffff',
  dotColor = '#1e293b',
}) => {
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
      data-testid="dice-face"
      className={`
        relative rounded-[22%] flex items-center justify-center
        transition-all duration-300
        ${isRolling ? 'animate-dice-jitter shadow-2xl' : 'scale-100 rotate-0 shadow-lg'}
      `}
      style={{
        width: size,
        height: size,
        backgroundColor: diceColor,
        backgroundImage: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0.05) 100%)`,
        boxShadow: isRolling
          ? `0 20px 50px -12px rgba(0,0,0,0.5), inset 0 -8px 15px rgba(0,0,0,0.2), inset 0 8px 15px rgba(255,255,255,0.5)`
          : `0 10px 25px -5px rgba(0,0,0,0.3), inset 0 -4px 8px rgba(0,0,0,0.15), inset 0 4px 8px rgba(255,255,255,0.4)`,
      }}
    >
      <div
        className="grid grid-cols-3 grid-rows-3 w-full h-full"
        style={{ gap: 'min(6px, 1.5cqmin)', padding: '18%' }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            {dotPositions[value]?.includes(i) && (
              <div
                className="rounded-full shadow-inner w-[85%] h-[85%]"
                style={{
                  backgroundColor: dotColor,
                  backgroundImage: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0.2) 100%)`,
                  boxShadow: `inset 0 2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(255,255,255,0.1)`,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
