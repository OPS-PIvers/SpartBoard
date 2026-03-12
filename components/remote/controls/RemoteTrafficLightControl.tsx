import React from 'react';
import { WidgetData, TrafficConfig } from '@/types';

interface RemoteTrafficLightControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const LIGHTS = [
  {
    color: 'red',
    label: 'Red',
    bg: 'bg-red-500',
    glow: 'shadow-red-500/50',
    border: 'border-red-400',
  },
  {
    color: 'yellow',
    label: 'Yellow',
    bg: 'bg-yellow-400',
    glow: 'shadow-yellow-400/50',
    border: 'border-yellow-300',
  },
  {
    color: 'green',
    label: 'Green',
    bg: 'bg-green-500',
    glow: 'shadow-green-500/50',
    border: 'border-green-400',
  },
] as const;

export const RemoteTrafficLightControl: React.FC<
  RemoteTrafficLightControlProps
> = ({ widget, updateWidget }) => {
  const config = widget.config as TrafficConfig;
  const active = config.active;

  const setLight = (color: string) => {
    const newColor = active === color ? null : color;
    updateWidget(widget.id, {
      config: { ...config, active: newColor ?? undefined },
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Traffic Light
      </div>

      {/* Light buttons */}
      <div className="flex flex-col gap-4">
        {LIGHTS.map(({ color, label, bg, glow, border }) => {
          const isActive = active === color;
          return (
            <button
              key={color}
              onClick={() => setLight(color)}
              className={`touch-manipulation w-32 h-32 rounded-full border-4 flex flex-col items-center justify-center gap-2 font-bold text-white transition-all active:scale-95 ${
                isActive
                  ? `${bg} ${border} shadow-2xl ${glow}`
                  : 'bg-white/10 border-white/20 opacity-50 hover:opacity-80'
              }`}
              aria-label={`Set traffic light to ${label}`}
              aria-pressed={isActive}
            >
              <div
                className={`w-16 h-16 rounded-full ${isActive ? 'bg-white/30' : 'bg-white/10'} flex items-center justify-center`}
              >
                <div
                  className={`w-10 h-10 rounded-full ${isActive ? bg : 'bg-white/20'}`}
                />
              </div>
              <span className="text-sm uppercase tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>

      {active && (
        <button
          onClick={() =>
            updateWidget(widget.id, {
              config: { ...config, active: undefined },
            })
          }
          className="touch-manipulation px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 text-sm font-bold transition-all active:scale-95"
          aria-label="Turn off all lights"
        >
          Turn Off
        </button>
      )}
    </div>
  );
};
