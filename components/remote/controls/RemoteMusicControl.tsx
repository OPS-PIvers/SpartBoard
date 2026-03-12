import React from 'react';
import { Music, Radio, Loader2 } from 'lucide-react';
import { WidgetData, MusicConfig } from '@/types';
import { useMusicStations } from '@/hooks/useMusicStations';

interface RemoteMusicControlProps {
  widget: WidgetData;
  updateWidget: (id: string, updates: Partial<WidgetData>) => void;
}

export const RemoteMusicControl: React.FC<RemoteMusicControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as MusicConfig;
  const { stations, isLoading } = useMusicStations();

  const selectStation = (stationId: string) => {
    updateWidget(widget.id, { config: { ...config, stationId } });
  };

  const currentStation = stations.find((s) => s.id === config.stationId);

  return (
    <div className="flex flex-col h-full">
      {/* Current station */}
      <div className="px-4 py-4 border-b border-white/10 shrink-0">
        <div className="text-white/60 text-xs uppercase tracking-widest font-bold mb-2">
          Music
        </div>
        {currentStation ? (
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
              style={{ background: currentStation.color ?? '#3b82f6' }}
            >
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold truncate">
                {currentStation.title}
              </div>
              <div className="text-white/40 text-xs">Now playing</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white/40 text-sm">
            <Music className="w-4 h-4" />
            <span>No station selected</span>
          </div>
        )}
      </div>

      {/* Station list */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
        </div>
      ) : stations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm italic px-4 text-center">
          No stations available. Ask your admin to add stations.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {stations.map((station) => {
            const isActive = config.stationId === station.id;
            return (
              <button
                key={station.id}
                onClick={() => selectStation(station.id)}
                className={`touch-manipulation flex items-center gap-3 w-full px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] ${
                  isActive
                    ? 'bg-blue-500/20 border-blue-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                }`}
                aria-pressed={isActive}
              >
                <div
                  className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center"
                  style={{ background: station.color ?? '#3b82f6' }}
                >
                  <Radio className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold truncate">{station.title}</span>
                {isActive && (
                  <span className="ml-auto text-blue-400 text-xs font-bold shrink-0">
                    ▶ Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
