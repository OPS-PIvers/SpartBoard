import React, { useContext } from 'react';
import { WidgetData, SoundConfig, WidgetConnection } from '@/types';
import { DashboardContext } from '@/context/DashboardContextValue';
import { useConnectionsEnabled } from '@/hooks/useConnectionsEnabled';
import { followerIds } from '@/utils/connectionEngine';
import { usesLegacyToggles } from '@/utils/legacyConnections';
import { useAuth } from '@/context/useAuth';
import { NOISE_METER_PRO } from '@/components/widgets/SoundWidget/noiseTarget';

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
const LEVEL_VISUAL = { value: 'level', label: 'Level', icon: '🔢' } as const;

export const RemoteSoundControl: React.FC<RemoteSoundControlProps> = ({
  widget,
  updateWidget,
}) => {
  const config = widget.config as SoundConfig;
  const pro = useAuth().canAccessFeature(NOISE_METER_PRO);
  const visuals = pro ? [...VISUALS, LEVEL_VISUAL] : VISUALS;
  // Without the flag a saved Level face shows the Thermometer, so the remote does too.
  const shownVisual =
    config.visual === 'level' && !pro ? 'thermometer' : config.visual;

  const setSensitivity = (value: number) =>
    updateWidget(widget.id, { config: { ...config, sensitivity: value } });

  const setVisual = (visual: SoundConfig['visual']) =>
    updateWidget(widget.id, { config: { ...config, visual } });

  // With Connections on, the button adds or removes "Traffic Light follows Sound"; an unmigrated widget also honours its old toggle.
  const connectionsOn = useConnectionsEnabled();
  const useLegacy = usesLegacyToggles(connectionsOn, config);
  const dashboard = useContext(DashboardContext);
  const board = dashboard?.activeDashboard;
  const traffic = board?.widgets.find((w) => w.type === 'traffic');
  const followOn =
    connectionsOn &&
    !!traffic &&
    followerIds(board?.connections, board?.widgets ?? [], widget.id).includes(
      traffic.id
    );
  const legacyOn = useLegacy && !!config.autoTrafficLight;
  const trafficOn = followOn || legacyOn;

  const toggleTrafficLight = () => {
    // Without a Follow to edit, or turning an unmigrated widget on, the old toggle is the switch.
    if (!connectionsOn || (useLegacy && !trafficOn)) {
      updateWidget(widget.id, {
        config: { ...config, autoTrafficLight: !config.autoTrafficLight },
      });
      return;
    }
    if (legacyOn) {
      updateWidget(widget.id, {
        config: { ...config, autoTrafficLight: false },
      });
    }
    if (!followOn && trafficOn) return;
    if (!board || !traffic) return;
    const isPair = (c: WidgetConnection) =>
      c.kind === 'follow' &&
      c.leaderId === widget.id &&
      c.followerId === traffic.id;
    const rest = (board.connections ?? []).filter((c) => !isPair(c));
    dashboard?.updateDashboard({
      connections: trafficOn
        ? rest
        : [
            ...rest,
            {
              id: crypto.randomUUID(),
              kind: 'follow',
              leaderId: widget.id,
              followerId: traffic.id,
            },
          ],
    });
  };

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
          {visuals.map(({ value, label, icon }) => {
            const isActive = shownVisual === value;
            return (
              <button
                key={value}
                onClick={() => setVisual(value)}
                className={`touch-manipulation flex items-center gap-3 px-4 py-3 rounded-2xl border font-bold transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
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
        className={`touch-manipulation flex items-center justify-between w-full px-4 py-4 rounded-2xl border transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
          trafficOn
            ? 'bg-green-500/20 border-green-400/50 text-white'
            : 'bg-white/5 border-white/10 text-white/60'
        }`}
        aria-pressed={trafficOn}
      >
        <span className="font-bold">Auto Traffic Light</span>
        <div
          className={`w-12 h-6 rounded-full relative transition-colors ${
            trafficOn ? 'bg-green-500' : 'bg-white/20'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              trafficOn ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </div>
      </button>
    </div>
  );
};
