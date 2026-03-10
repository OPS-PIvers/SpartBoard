import React from 'react';
import { Play, Square, Users } from 'lucide-react';
import { WidgetData, NextUpConfig } from '@/types';

interface RemoteNextUpControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

export const RemoteNextUpControl: React.FC<RemoteNextUpControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as NextUpConfig;

  const toggleSession = () => {
    updateWidget(widget.id, {
      config: {
        ...config,
        isActive: !config.isActive,
        lastUpdated: Date.now(),
      },
    });
  };

  const setDisplayCount = (delta: number) => {
    const next = Math.max(1, Math.min(20, (config.displayCount ?? 5) + delta));
    updateWidget(widget.id, {
      config: { ...config, displayCount: next, lastUpdated: Date.now() },
    });
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 h-full justify-center">
      <div className="text-white/60 text-xs uppercase tracking-widest font-bold">
        Next Up
      </div>

      {/* Session Name */}
      {config.sessionName && (
        <div className="text-white font-bold text-lg text-center">
          {config.sessionName}
        </div>
      )}

      {/* Status indicator */}
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${
          config.isActive
            ? 'bg-green-500/20 border-green-400/50 text-green-300'
            : 'bg-white/10 border-white/20 text-white/50'
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            config.isActive ? 'bg-green-400 animate-pulse' : 'bg-white/30'
          }`}
        />
        {config.isActive ? 'Session Active' : 'Session Inactive'}
      </div>

      {/* Toggle button */}
      <button
        onClick={toggleSession}
        className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 ${
          config.isActive
            ? 'bg-red-500 hover:bg-red-600 text-white'
            : 'bg-green-500 hover:bg-green-600 text-white'
        }`}
        aria-label={config.isActive ? 'End session' : 'Start session'}
      >
        {config.isActive ? (
          <>
            <Square className="w-6 h-6" /> End Session
          </>
        ) : (
          <>
            <Play className="w-6 h-6" /> Start Session
          </>
        )}
      </button>

      {/* Display count */}
      <div className="flex flex-col items-center gap-2">
        <div className="text-white/50 text-xs uppercase tracking-wide font-bold">
          Students Displayed
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setDisplayCount(-1)}
            disabled={(config.displayCount ?? 5) <= 1}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40 font-bold text-lg flex items-center justify-center transition-all active:scale-95"
          >
            −
          </button>
          <div className="flex items-center gap-2 text-white font-black text-2xl w-16 justify-center">
            <Users className="w-5 h-5 text-white/40" />
            {config.displayCount ?? 5}
          </div>
          <button
            onClick={() => setDisplayCount(1)}
            disabled={(config.displayCount ?? 5) >= 20}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40 font-bold text-lg flex items-center justify-center transition-all active:scale-95"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};
