import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { WidgetData, TimeToolConfig } from '@/types';

interface RemoteTimerControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

const PRESET_SECONDS = [60, 120, 180, 300, 600] as const;

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const RemoteTimerControl: React.FC<RemoteTimerControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as TimeToolConfig;
  const isTimer = config.mode === 'timer';

  // Tick every second while running so the display stays live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!config.isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [config.isRunning]);

  const togglePlay = () => {
    const ts = Date.now();
    if (config.isRunning) {
      const delta = config.startTime
        ? Math.floor((ts - config.startTime) / 1000)
        : 0;
      const timeToSave = isTimer
        ? Math.max(0, config.elapsedTime - delta)
        : config.elapsedTime + delta;
      updateWidget(widget.id, {
        config: {
          ...config,
          isRunning: false,
          elapsedTime: timeToSave,
          startTime: null,
        },
      });
    } else {
      updateWidget(widget.id, {
        config: { ...config, isRunning: true, startTime: ts },
      });
    }
  };

  const resetTimer = () => {
    const resetTime = isTimer ? config.duration : 0;
    updateWidget(widget.id, {
      config: {
        ...config,
        isRunning: false,
        elapsedTime: resetTime,
        startTime: null,
      },
    });
  };

  const setPreset = (seconds: number) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        duration: seconds,
        isRunning: false,
        elapsedTime: seconds,
        startTime: null,
      },
    });
  };

  const delta =
    config.isRunning && config.startTime
      ? Math.floor((now - config.startTime) / 1000)
      : 0;
  const displayTime = isTimer
    ? Math.max(0, config.elapsedTime - delta)
    : config.elapsedTime + delta;
  const remaining = displayTime;
  const progress =
    isTimer && config.duration > 0
      ? Math.min(1, 1 - displayTime / config.duration)
      : 0;

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        {isTimer ? 'Timer' : 'Stopwatch'}
      </div>

      {/* Time Display */}
      <div className="relative flex items-center justify-center">
        {isTimer && (
          <svg className="absolute w-48 h-48 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="white"
              strokeOpacity="0.1"
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={remaining <= 10 ? '#ef4444' : '#3b82f6'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * progress}`}
              className="transition-all duration-1000"
            />
          </svg>
        )}
        <span
          className="text-white font-mono font-black tabular-nums"
          style={{ fontSize: '3.5rem' }}
        >
          {formatTime(remaining)}
        </span>
      </div>

      {/* Play/Pause & Reset */}
      <div className="flex gap-4">
        <button
          onClick={resetTimer}
          className="touch-manipulation w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition-all active:scale-95"
          aria-label="Reset"
        >
          <RotateCcw className="w-6 h-6" />
        </button>
        <button
          onClick={togglePlay}
          className={`touch-manipulation w-20 h-20 rounded-full border-2 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg ${
            config.isRunning
              ? 'bg-red-500/80 border-red-400 hover:bg-red-500'
              : 'bg-blue-500/80 border-blue-400 hover:bg-blue-500'
          }`}
          aria-label={config.isRunning ? 'Pause' : 'Start'}
        >
          {config.isRunning ? (
            <Pause className="w-8 h-8" />
          ) : (
            <Play className="w-8 h-8 ml-1" />
          )}
        </button>
        <div className="w-14 h-14" /> {/* spacer */}
      </div>

      {/* Duration Presets (timer only) */}
      {isTimer && (
        <div className="flex gap-2 flex-wrap justify-center">
          {PRESET_SECONDS.map((s) => (
            <button
              key={s}
              onClick={() => setPreset(s)}
              className={`touch-manipulation px-3 py-1.5 rounded-lg text-sm font-bold transition-all active:scale-95 ${
                config.duration === s
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
            >
              {s >= 60 ? `${s / 60}m` : `${s}s`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
