import React, { useCallback, useMemo } from 'react';
import { Plus, Send, LayoutGrid, Type, Palette } from 'lucide-react';
import { StationsConfig, RandomConfig, Station, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { WIDGET_PALETTE } from '@/config/colors';
import { StationEditor } from './components/StationEditor';
import { SavedPresetsPanel } from './components/SavedPresetsPanel';

const DEFAULT_STATION_COLORS = WIDGET_PALETTE;

const buildEmptyStation = (order: number, color: string): Station => ({
  id: crypto.randomUUID(),
  title: '',
  color,
  order,
});

export const StationsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const config = widget.config as StationsConfig;
  const stations = useMemo(
    () => [...(config.stations ?? [])].sort((a, b) => a.order - b.order),
    [config.stations]
  );

  const persistStations = useCallback(
    (next: Station[]) => {
      // Renormalize order so it always reads 0..N-1, regardless of how the
      // caller left things.
      const renormalized = next.map((s, i) => ({ ...s, order: i }));
      updateWidget(widget.id, {
        config: { ...config, stations: renormalized },
      });
    },
    [widget.id, config, updateWidget]
  );

  const handleAddStation = () => {
    const color =
      DEFAULT_STATION_COLORS[stations.length % DEFAULT_STATION_COLORS.length];
    const next = [...stations, buildEmptyStation(stations.length, color)];
    persistStations(next);
  };

  const handleStationChange = (id: string, updates: Partial<Station>) => {
    const next = stations.map((s) => (s.id === id ? { ...s, ...updates } : s));
    persistStations(next);
  };

  const handleStationDelete = (id: string) => {
    const station = stations.find((s) => s.id === id);
    const hasMembers =
      station && Object.values(config.assignments ?? {}).some((v) => v === id);
    if (
      hasMembers &&
      !window.confirm(
        'This station has students in it. Deleting will return them to unassigned. Continue?'
      )
    ) {
      return;
    }
    const next = stations.filter((s) => s.id !== id);
    // Strip the deleted id from any assignment.
    const nextAssignments: Record<string, string | null> = {};
    for (const [name, value] of Object.entries(config.assignments ?? {})) {
      nextAssignments[name] = value === id ? null : value;
    }
    updateWidget(widget.id, {
      config: {
        ...config,
        stations: next.map((s, i) => ({ ...s, order: i })),
        assignments: nextAssignments,
      },
    });
  };

  const handleMove = (id: string, delta: number) => {
    const idx = stations.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= stations.length) return;
    const next = [...stations];
    [next[idx], next[target]] = [next[target], next[idx]];
    persistStations(next);
  };

  const handleLoadPreset = (presetStations: Station[]) => {
    const renormalized = presetStations.map((s, i) => ({ ...s, order: i }));
    updateWidget(widget.id, {
      config: {
        ...config,
        stations: renormalized,
        // Wipe assignments — preset doesn't include them, and old keys would
        // point at stale station ids.
        assignments: {},
      },
    });
  };

  // Find the first Randomizer widget on the active dashboard. Matches the
  // "find-first" pattern used by Timer→Randomizer/Traffic/NextUp Nexus.
  const randomizerWidget = activeDashboard?.widgets.find(
    (w) => w.type === 'random'
  );

  const handleSendToRandomizer = () => {
    if (!randomizerWidget) {
      addToast('Add a Randomizer widget to the board first.', 'info');
      return;
    }
    const titles = stations.map((s) =>
      s.title.trim() ? s.title : `Station ${s.order + 1}`
    );
    if (titles.length === 0) {
      addToast('Add at least one station first.', 'info');
      return;
    }
    if (
      !window.confirm(
        `Send ${titles.length} station name${titles.length === 1 ? '' : 's'} to the Randomizer? This sets its first/last names to your station titles so it can pick from them.`
      )
    ) {
      return;
    }
    const randomConfig = randomizerWidget.config as RandomConfig;
    updateWidget(randomizerWidget.id, {
      config: {
        ...randomConfig,
        firstNames: titles.join('\n'),
        lastNames: '',
        rosterMode: 'custom',
      },
    });
    addToast('Sent station names to Randomizer.', 'success');
  };

  return (
    <div className="space-y-6 p-1">
      <div>
        <div className="flex items-center justify-between mb-2">
          <SettingsLabel icon={LayoutGrid}>Stations</SettingsLabel>
          <button
            type="button"
            onClick={handleAddStation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xxs font-black uppercase tracking-widest hover:bg-brand-blue-dark transition-colors shadow-sm"
          >
            <Plus size={12} />
            Add Station
          </button>
        </div>

        {stations.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
            <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-500">No stations yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Add a station to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stations.map((station, index) => (
              <StationEditor
                key={station.id}
                station={station}
                index={index}
                total={stations.length}
                onChange={(updates) => handleStationChange(station.id, updates)}
                onDelete={() => handleStationDelete(station.id)}
                onMoveUp={() => handleMove(station.id, -1)}
                onMoveDown={() => handleMove(station.id, 1)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Nexus: Send to Randomizer */}
      <div className="pt-4 border-t border-slate-100">
        <SettingsLabel icon={Send}>Connect with Randomizer</SettingsLabel>
        {!randomizerWidget ? (
          <div className="text-xs text-brand-blue-primary bg-brand-blue-lighter/20 p-3 rounded-xl border border-brand-blue-lighter/30 leading-snug">
            Add a Randomizer widget to send your station names to it.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSendToRandomizer}
            disabled={stations.length === 0}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-black uppercase tracking-widest text-xxs hover:bg-indigo-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={13} />
            Send Station Names to Randomizer
          </button>
        )}
      </div>

      {/* Saved presets */}
      <div className="pt-4 border-t border-slate-100">
        <SavedPresetsPanel stations={stations} onLoad={handleLoadPreset} />
      </div>
    </div>
  );
};

// =============================================================================
// Appearance settings (back-face style tab)
// =============================================================================

const FONT_OPTIONS: {
  id: NonNullable<StationsConfig['fontFamily']>;
  label: string;
}[] = [
  { id: 'sans', label: 'Sans' },
  { id: 'mono', label: 'Mono' },
  { id: 'handwritten', label: 'Hand' },
  { id: 'rounded', label: 'Round' },
];

export const StationsAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as StationsConfig;

  return (
    <div className="space-y-6 p-1">
      <div>
        <SettingsLabel icon={Type}>Typography</SettingsLabel>
        <div className="grid grid-cols-4 gap-2">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id },
                })
              }
              className={`p-2 rounded-lg border-2 flex items-center justify-center text-xxs font-black uppercase tracking-widest transition-all ${
                config.fontFamily === f.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SettingsLabel icon={Palette}>Card surface</SettingsLabel>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={config.cardColor ?? '#f8fafc'}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, cardColor: e.target.value },
                })
              }
              className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer"
              aria-label="Card background color"
            />
            <input
              type="text"
              value={config.cardColor ?? '#f8fafc'}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, cardColor: e.target.value },
                })
              }
              className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xxs font-bold text-slate-500 uppercase tracking-widest mb-1">
              Opacity
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.cardOpacity ?? 0.4}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: { ...config, cardOpacity: Number(e.target.value) },
                })
              }
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
