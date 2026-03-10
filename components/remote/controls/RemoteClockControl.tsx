import React from 'react';
import { WidgetData, ClockConfig } from '@/types';

interface RemoteClockControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const ToggleRow: React.FC<{
  label: string;
  value: boolean;
  onToggle: () => void;
}> = ({ label, value, onToggle }) => (
  <button
    onClick={onToggle}
    className={`flex items-center justify-between w-full px-4 py-4 rounded-2xl border transition-all active:scale-95 ${
      value
        ? 'bg-blue-500/20 border-blue-400/60 text-white'
        : 'bg-white/5 border-white/10 text-white/60'
    }`}
    aria-pressed={value}
  >
    <span className="font-bold text-base">{label}</span>
    <div
      className={`w-12 h-6 rounded-full relative transition-colors ${
        value ? 'bg-blue-500' : 'bg-white/20'
      }`}
    >
      <div
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </div>
  </button>
);

export const RemoteClockControl: React.FC<RemoteClockControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as ClockConfig;

  const toggle = (field: keyof ClockConfig) =>
    updateWidget(widget.id, {
      config: { ...config, [field]: !config[field] },
    });

  // Live time display
  const now = new Date();
  const hours = config.format24 ? now.getHours() : now.getHours() % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = !config.format24 ? (now.getHours() < 12 ? ' AM' : ' PM') : '';

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Clock
      </div>

      {/* Live clock preview */}
      <div
        className="text-white font-black tabular-nums"
        style={{ fontSize: '3.5rem' }}
      >
        {hours}:{minutes}
        {config.showSeconds && (
          <span className="text-white/50" style={{ fontSize: '2rem' }}>
            :{seconds}
          </span>
        )}
        {ampm && (
          <span className="text-white/50" style={{ fontSize: '1.5rem' }}>
            {ampm}
          </span>
        )}
      </div>

      <div className="w-full flex flex-col gap-3">
        <ToggleRow
          label="24-Hour Format"
          value={config.format24 ?? false}
          onToggle={() => toggle('format24')}
        />
        <ToggleRow
          label="Show Seconds"
          value={config.showSeconds ?? false}
          onToggle={() => toggle('showSeconds')}
        />
        <ToggleRow
          label="Glow Effect"
          value={config.glow ?? false}
          onToggle={() => toggle('glow')}
        />
      </div>
    </div>
  );
};
