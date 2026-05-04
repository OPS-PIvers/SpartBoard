import React from 'react';
import { Square, Circle } from 'lucide-react';

export type LinkShape = 'rectangle' | 'circle';

interface LinkShapePickerProps {
  shape: LinkShape;
  onChange: (next: LinkShape) => void;
}

export const LinkShapePicker: React.FC<LinkShapePickerProps> = ({
  shape,
  onChange,
}) => (
  <div className="grid grid-cols-2 gap-2">
    <button
      type="button"
      onClick={() => onChange('rectangle')}
      aria-pressed={shape === 'rectangle'}
      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all border-2 ${
        shape === 'rectangle'
          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
          : 'bg-white border-slate-200 text-slate-600'
      }`}
    >
      <Square size={12} />
      Rectangle
    </button>
    <button
      type="button"
      onClick={() => onChange('circle')}
      aria-pressed={shape === 'circle'}
      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xxs font-black uppercase tracking-widest transition-all border-2 ${
        shape === 'circle'
          ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
          : 'bg-white border-slate-200 text-slate-600'
      }`}
    >
      <Circle size={12} />
      Circle
    </button>
  </div>
);
