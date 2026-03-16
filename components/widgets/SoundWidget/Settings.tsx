import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, SoundConfig } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { Thermometer, Gauge, Activity, Citrus, Zap } from 'lucide-react';
import { POSTER_LEVELS } from './constants';

export const SoundSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as SoundConfig;
  const {
    sensitivity = 1,
    visual = 'thermometer',
    autoTrafficLight,
    trafficLightThreshold = 4,
    syncExpectations = false,
  } = config;

  const hasTrafficLight = activeDashboard?.widgets.some(
    (w) => w.type === 'traffic'
  );

  const hasExpectations = activeDashboard?.widgets.some(
    (w) => w.type === 'expectations'
  );

  const modes = [
    { id: 'thermometer', icon: Thermometer, label: 'Meter' },
    { id: 'speedometer', icon: Gauge, label: 'Gauge' },
    { id: 'line', icon: Activity, label: 'Graph' },
    { id: 'balls', icon: Citrus, label: 'Popcorn' },
  ];

  return (
    <div className="space-y-6">
      {/* Nexus Connection: Expectations Sync */}
      <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-blue-900">
          <Activity className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Auto-Sensitivity (Expectations)
          </span>
        </div>

        {!hasExpectations && (
          <div className="text-xxs text-blue-400 font-medium bg-blue-50 p-2 rounded-lg">
            Tip: Add an Expectations widget to use this feature.
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-blue-800">Sync with Expectations</span>
          <Toggle
            checked={syncExpectations}
            onChange={(checked: boolean) =>
              updateWidget(widget.id, {
                config: { ...config, syncExpectations: checked },
              })
            }
            disabled={!hasExpectations}
            size="sm"
            activeColor="bg-blue-600"
            showLabels={false}
          />
        </div>

        {syncExpectations && (
          <div className="text-xxs text-blue-500 font-medium italic">
            Sensitivity is auto-adjusted based on the selected Voice Level.
          </div>
        )}
      </div>

      <div>
        <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-3 block">
          Sensitivity
        </label>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.1"
          value={sensitivity}
          onChange={(e) =>
            updateWidget(widget.id, {
              config: { ...config, sensitivity: parseFloat(e.target.value) },
            })
          }
          className="w-full accent-indigo-600"
          disabled={syncExpectations}
        />
      </div>

      <div>
        <label className="text-xxs  text-slate-400 uppercase tracking-widest mb-3 block">
          Visual Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, visual: m.id as SoundConfig['visual'] },
                })
              }
              className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                visual === m.id
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-100 text-slate-400 hover:border-slate-200'
              }`}
            >
              <m.icon className="w-4 h-4" />
              <span className="text-xxs  uppercase">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nexus Connection: Traffic Light */}
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-indigo-900">
          <Zap className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-wider">
            Auto-Control Traffic Light
          </span>
        </div>

        {!hasTrafficLight && (
          <div className="text-xxs text-indigo-400 font-medium bg-indigo-50 p-2 rounded-lg">
            Tip: Add a Traffic Light widget to use this feature.
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-indigo-800">Enable Automation</span>
          <Toggle
            checked={autoTrafficLight ?? false}
            onChange={(checked: boolean) =>
              updateWidget(widget.id, {
                config: { ...config, autoTrafficLight: checked },
              })
            }
            disabled={!hasTrafficLight}
            size="sm"
            activeColor="bg-indigo-600"
            showLabels={false}
          />
        </div>

        {autoTrafficLight && (
          <div className="animate-in fade-in slide-in-from-top-1">
            <label className="text-xxs text-indigo-400 uppercase tracking-widest mb-1.5 block">
              Trigger Red Light At:
            </label>
            <div className="grid grid-cols-1 gap-1">
              {POSTER_LEVELS.slice(1).map((lvl, i) => (
                <button
                  key={i}
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        trafficLightThreshold: i + 1, // POSTER_LEVELS index (1-based relative to slice, so i+1 matches real index)
                      },
                    })
                  }
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    trafficLightThreshold === i + 1
                      ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm'
                      : 'border-transparent hover:bg-indigo-50 text-indigo-900/60'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: lvl.color }}
                  />
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
