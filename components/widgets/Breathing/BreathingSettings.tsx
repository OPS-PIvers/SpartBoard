import React from 'react';
import { BreathingConfig, WidgetData } from '../../../types';
import { useDashboard } from '../../../context/useDashboard';
import { WIDGET_PALETTE } from '../../../config/colors';
import { SettingsLabel } from '../../common/SettingsLabel';
import { Palette, Activity, Eye } from 'lucide-react';

export const BreathingSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as BreathingConfig;

  const patterns = [
    { id: '4-4-4-4', label: 'Box Breathing' },
    { id: '4-7-8', label: 'Relaxing Breath' },
    { id: '5-5', label: 'Coherent Breath' },
  ] as const;

  const visuals = [
    { id: 'circle', label: 'Circle' },
    { id: 'lotus', label: 'Lotus' },
    { id: 'wave', label: 'Wave' },
  ] as const;

  const colors = WIDGET_PALETTE;

  return (
    <div className="space-y-6 p-1">
      {/* Pattern Selection */}
      <div>
        <SettingsLabel icon={Activity}>Pattern</SettingsLabel>
        <div className="grid grid-cols-1 gap-2">
          {patterns.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, pattern: p.id },
                })
              }
              className={`p-2 rounded-lg text-xs font-bold transition-all border-2 text-left ${
                config.pattern === p.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <div className="flex justify-between">
                <span>{p.label}</span>
                <span className="opacity-70 font-mono text-xxs tracking-widest">
                  {p.id}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Visual Selection */}
      <div>
        <SettingsLabel icon={Eye}>Visual Style</SettingsLabel>
        <div className="grid grid-cols-3 gap-2">
          {visuals.map((v) => (
            <button
              key={v.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, visual: v.id },
                })
              }
              className={`p-2 rounded-lg text-xxs font-black uppercase transition-all border-2 ${
                config.visual === v.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color Selection */}
      <div>
        <SettingsLabel icon={Palette}>Color Theme</SettingsLabel>
        <div className="flex flex-wrap gap-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, color: c },
                })
              }
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                config.color === c
                  ? 'border-slate-800 scale-110 shadow-md'
                  : 'border-transparent hover:scale-105 shadow-sm'
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Select color ${c}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
