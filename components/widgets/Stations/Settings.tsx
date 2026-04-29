import React, { useCallback, useMemo } from 'react';
import { Plus, Send, LayoutGrid } from 'lucide-react';
import { StationsConfig, RandomConfig, Station, WidgetData } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useStorage } from '@/hooks/useStorage';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { TypographySettings } from '@/components/common/TypographySettings';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
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

/**
 * Best-effort destructive cleanup of an uploaded image. Failures are
 * non-fatal — Drive may already be missing the file, the user might be
 * offline, or the URL might still be referenced elsewhere. We log and move on.
 */
const tryDeleteUrl = async (
  url: string | undefined,
  deleteFile: (path: string) => Promise<void>,
  context: string
): Promise<boolean> => {
  if (!url) return true;
  try {
    await deleteFile(url);
    return true;
  } catch (err) {
    console.warn(`[StationsSettings] ${context} cleanup failed`, err);
    return false;
  }
};

export const StationsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addToast, activeDashboard } = useDashboard();
  const { showConfirm } = useDialog();
  const { savedWidgetConfigs } = useAuth();
  const { deleteFile } = useStorage();
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

  /**
   * Build the set of imageUrls referenced by saved presets so we know which
   * Drive blobs are *not* safe to delete when the live widget swaps out a
   * station/preset. Used by handleStationDelete and handleLoadPreset.
   */
  const protectedImageUrls = useMemo(() => {
    const set = new Set<string>();
    const lib =
      (savedWidgetConfigs.stations as Partial<StationsConfig> | undefined)
        ?.savedLibrary ?? [];
    for (const preset of lib) {
      for (const s of preset.stations) {
        if (s.imageUrl) set.add(s.imageUrl);
      }
    }
    return set;
  }, [savedWidgetConfigs]);

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

  const handleStationDelete = async (id: string) => {
    const station = stations.find((s) => s.id === id);
    if (!station) return;
    const hasMembers = Object.values(config.assignments ?? {}).some(
      (v) => v === id
    );
    if (hasMembers) {
      const ok = await showConfirm(
        'This station has students in it. Deleting will return them to unassigned. Any uploaded image for this station will be removed from your Drive.',
        {
          title: 'Delete station?',
          confirmLabel: 'Delete',
          variant: 'danger',
        }
      );
      if (!ok) return;
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
    // Destructive Drive cleanup AFTER the config update commits, and only if
    // no preset still references this URL.
    if (station.imageUrl && !protectedImageUrls.has(station.imageUrl)) {
      void tryDeleteUrl(station.imageUrl, deleteFile, 'station-delete');
    }
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
    // Snapshot the live-widget URLs that are about to be replaced.
    const outgoingUrls = stations
      .map((s) => s.imageUrl)
      .filter((u): u is string => !!u);
    // Don't delete URLs referenced by the incoming preset (would break it
    // immediately), nor URLs referenced by any other saved preset.
    const incomingUrls = new Set(
      renormalized.map((s) => s.imageUrl).filter((u): u is string => !!u)
    );
    updateWidget(widget.id, {
      config: {
        ...config,
        stations: renormalized,
        // Wipe assignments — preset doesn't include them, and old keys would
        // point at stale station ids.
        assignments: {},
      },
    });
    for (const url of outgoingUrls) {
      if (incomingUrls.has(url)) continue;
      if (protectedImageUrls.has(url)) continue;
      void tryDeleteUrl(url, deleteFile, 'preset-load');
    }
  };

  // Find the first Randomizer widget on the active dashboard. Matches the
  // "find-first" pattern used by Timer→Randomizer/Traffic/NextUp Nexus.
  const randomizerWidget = activeDashboard?.widgets.find(
    (w) => w.type === 'random'
  );

  const handleSendToRandomizer = async () => {
    if (!randomizerWidget) {
      addToast('Add a Randomizer widget to the board first.', 'info');
      return;
    }
    const titles = stations.map((s) =>
      s.title.trim() ? s.title.trim() : `Station ${s.order + 1}`
    );
    if (titles.length === 0) {
      addToast('Add at least one station first.', 'info');
      return;
    }
    const randomConfig = randomizerWidget.config as RandomConfig;
    const willOverwriteCustom =
      (randomConfig.firstNames ?? '').trim().length > 0 ||
      (randomConfig.lastNames ?? '').trim().length > 0;
    const willSwitchMode = randomConfig.rosterMode !== 'custom';
    const messageParts = [
      `This will replace the Randomizer's name list with ${titles.length} station name${titles.length === 1 ? '' : 's'}.`,
    ];
    if (willSwitchMode) {
      messageParts.push(
        "Roster mode will switch to 'Custom Names' (you can switch back to a class roster afterwards)."
      );
    }
    if (willOverwriteCustom) {
      messageParts.push(
        'Any custom names currently typed into the Randomizer will be lost.'
      );
    }
    const ok = await showConfirm(messageParts.join(' '), {
      title: 'Send station names to Randomizer?',
      confirmLabel: 'Send',
      ...(willOverwriteCustom || willSwitchMode
        ? { variant: 'danger' as const }
        : {}),
    });
    if (!ok) return;
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

export const StationsAppearanceSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as StationsConfig;

  const updateConfig = useCallback(
    (updates: Partial<StationsConfig>) => {
      updateWidget(widget.id, { config: { ...config, ...updates } });
    },
    [widget.id, config, updateWidget]
  );

  return (
    <div className="space-y-6 p-1">
      <TypographySettings config={config} updateConfig={updateConfig} />
      <SurfaceColorSettings
        config={config}
        updateConfig={updateConfig}
        label="Card surface"
      />
    </div>
  );
};
