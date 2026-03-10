import React from 'react';
import { WidgetData, SoundConfig } from '@/types';

interface RemoteSoundControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const VISUALS: { value: SoundConfig['visual']; label: string; icon: string }[] =
  [
    { value: 'thermometer', label: 'Thermometer', icon: '🌡️' },
    { value: 'speedometer', label: 'Speedometer', icon: '⚡' },
    { value: 'line', label: 'Line', icon: '〰️' },
    { value: 'balls', label: 'Balls', icon: '⚫' },
  ];

export const RemoteSoundControl: React.FC<RemoteSoundControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as SoundConfig;

  const setSensitivity = (value: number) =>
    updateWidget(widget.id, { config: { ...config, sensitivity: value } });

  const setVisual = (visual: SoundConfig['visual']) =>
    updateWidget(widget.id, { config: { ...config, visual } });

  const toggleTrafficLight = () =>
    updateWidget(widget.id, {
      config: { ...config, autoTrafficLight: !config.autoTrafficLight },
    });

  const sensitivityPct = Math.round((config.sensitivity ?? 50) * 100) / 100;

  return (
    <div className="flex flex-col gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Noise Meter
      </div>

      {/* Sensitivity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/60 text-xs font-bold uppercase tracking-wide">
            Sensitivity
          </span>
          <span className="text-white font-black tabular-nums">
            {Math.round(config.sensitivity ?? 50)}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={config.sensitivity ?? 50}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full h-2 appearance-none rounded-full cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${sensitivityPct}%, rgba(255,255,255,0.15) ${sensitivityPct}%)`,
          }}
          aria-label="Sensitivity"
        />
        <div className="flex justify-between text-white/30 text-xs mt-1">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {/* Visual style */}
      <div>
        <div className="text-white/60 text-xs font-bold uppercase tracking-wide mb-3">
          Visual Style
        </div>
        <div className="grid grid-cols-2 gap-2">
          {VISUALS.map(({ value, label, icon }) => {
            const isActive = config.visual === value;
            return (
              <button
                key={value}
                onClick={() => setVisual(value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border font-bold transition-all active:scale-95 ${
                  isActive
                    ? 'bg-blue-500/20 border-blue-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
                aria-pressed={isActive}
              >
                <span className="text-xl">{icon}</span>
                <span className="text-sm">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto traffic light toggle */}
      <button
        onClick={toggleTrafficLight}
        className={`flex items-center justify-between w-full px-4 py-4 rounded-2xl border transition-all active:scale-95 ${
          config.autoTrafficLight
            ? 'bg-green-500/20 border-green-400/50 text-white'
            : 'bg-white/5 border-white/10 text-white/60'
        }`}
        aria-pressed={config.autoTrafficLight ?? false}
      >
        <span className="font-bold">Auto Traffic Light</span>
        <div
          className={`w-12 h-6 rounded-full relative transition-colors ${
            config.autoTrafficLight ? 'bg-green-500' : 'bg-white/20'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              config.autoTrafficLight ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </div>
      </button>
    </div>
  );
};
