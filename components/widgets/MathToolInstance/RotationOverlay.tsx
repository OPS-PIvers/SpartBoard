import React from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';

export const RotationOverlay: React.FC<{
  rotation: number;
  onRotate: (newRotation: number) => void;
}> = ({ rotation, onRotate }) => {
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-dropdown pointer-events-none">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRotate((rotation + 15) % 360);
        }}
        className="p-1.5 bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 active:scale-95 transition-all pointer-events-auto"
        title="Rotate Clockwise (15°)"
        aria-label="Rotate clockwise by 15 degrees"
      >
        <RotateCw
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRotate((rotation - 15 + 360) % 360);
        }}
        className="p-1.5 bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 active:scale-95 transition-all pointer-events-auto"
        title="Rotate Counter-Clockwise (15°)"
        aria-label="Rotate counter-clockwise by 15 degrees"
      >
        <RotateCcw
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
      </button>
    </div>
  );
};
