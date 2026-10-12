import React from 'react';
import { TOOLS } from '@/config/tools';
import { WidgetType, InternalToolType } from '@/types';
import type { tourAttr } from '@/config/tourAnchors';

interface QuickAccessButtonProps {
  type: WidgetType | InternalToolType;
  onClick: () => void;
  anchor?: ReturnType<typeof tourAttr>;
}

export const QuickAccessButton = ({
  type,
  onClick,
  anchor,
}: QuickAccessButtonProps) => {
  const tool = TOOLS.find((t) => t.type === type);
  if (!tool) return null;

  return (
    <div className="group relative">
      <button
        onClick={onClick}
        {...anchor}
        className={`w-12 h-12 flex items-center justify-center ${tool.color} text-white rounded-full shadow-lg hover:scale-110 active:scale-95 transition ring-2 ring-white/20`}
      >
        <tool.icon className="w-6 h-6" />
      </button>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-800 text-white text-xxs font-black uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-modal shadow-2xl border border-white/10 scale-90 group-hover:scale-100">
        {tool.label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  );
};
