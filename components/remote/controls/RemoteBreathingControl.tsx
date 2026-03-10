import React from 'react';
import { WidgetData, BreathingConfig } from '@/types';

interface RemoteBreathingControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const PATTERNS: {
  value: BreathingConfig['pattern'];
  label: string;
  desc: string;
}[] = [
  { value: '4-4-4-4', label: 'Box Breathing', desc: '4-4-4-4' },
  { value: '4-7-8', label: '4-7-8', desc: 'Relax' },
  { value: '5-5', label: '5-5', desc: 'Balanced' },
];

const VISUALS: {
  value: BreathingConfig['visual'];
  label: string;
  icon: string;
}[] = [
  { value: 'circle', label: 'Circle', icon: '⭕' },
  { value: 'lotus', label: 'Lotus', icon: '🪷' },
  { value: 'wave', label: 'Wave', icon: '🌊' },
];

const COLORS = [
  '#6366f1',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#ef4444',
];

export const RemoteBreathingControl: React.FC<RemoteBreathingControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as BreathingConfig;

  const set = (updates: Partial<BreathingConfig>) =>
    updateWidget(widget.id, { config: { ...config, ...updates } });

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-y-auto">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Breathing Exercise
      </div>

      {/* Pattern */}
      <div>
        <div className="text-white/50 text-xs font-bold uppercase tracking-wide mb-3">
          Pattern
        </div>
        <div className="flex flex-col gap-2">
          {PATTERNS.map(({ value, label, desc }) => {
            const isActive = config.pattern === value;
            return (
              <button
                key={value}
                onClick={() => set({ pattern: value })}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl border font-bold transition-all active:scale-95 ${
                  isActive
                    ? 'bg-blue-500/20 border-blue-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
                aria-pressed={isActive}
              >
                <span>{label}</span>
                <span className="text-sm opacity-60">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Visual style */}
      <div>
        <div className="text-white/50 text-xs font-bold uppercase tracking-wide mb-3">
          Visual
        </div>
        <div className="flex gap-2">
          {VISUALS.map(({ value, label, icon }) => {
            const isActive = config.visual === value;
            return (
              <button
                key={value}
                onClick={() => set({ visual: value })}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border font-bold transition-all active:scale-95 ${
                  isActive
                    ? 'bg-blue-500/20 border-blue-400/50 text-blue-300'
                    : 'bg-white/5 border-white/10 text-white/40'
                }`}
                aria-pressed={isActive}
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-xs">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Color */}
      <div>
        <div className="text-white/50 text-xs font-bold uppercase tracking-wide mb-3">
          Color
        </div>
        <div className="flex flex-wrap gap-3">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => set({ color })}
              className="w-10 h-10 rounded-full transition-all active:scale-95"
              style={{
                background: color,
                outline:
                  config.color === color
                    ? `3px solid white`
                    : '3px solid transparent',
                outlineOffset: 2,
              }}
              aria-label={`Set color to ${color}`}
              aria-pressed={config.color === color}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
