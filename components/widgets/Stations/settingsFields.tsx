import React, { useCallback, useMemo, useState } from 'react';
import { LayoutGrid, Lock, Plus, Send, Users } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { RandomConfig, Station, StationsConfig } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useStorage } from '@/hooks/useStorage';
import { useRosterGroupsGate } from '@/hooks/useRosterGroupsGate';
import { countRosterGroupMembers } from '@/utils/rosterGroups';
import { WIDGET_PALETTE } from '@/config/colors';
import { StationEditor } from './components/StationEditor';
import { SavedPresetsPanel } from './components/SavedPresetsPanel';

const DEFAULT_STATION_COLORS = WIDGET_PALETTE;

const configFor = (ctx: CustomRenderCtx): StationsConfig =>
  ctx.config as unknown as StationsConfig;

const translate = (
  ctx: CustomRenderCtx,
  leaf: string,
  options?: Record<string, unknown>
) => ctx.t(`widgetSettings.stations.${leaf}`, options);

const buildEmptyStation = (order: number, color: string): Station => ({
  id: crypto.randomUUID(),
  title: '',
  color,
  order,
});

const tryDeleteUrl = async (
  url: string | undefined,
  deleteFile: (path: string) => Promise<void>,
  context: string
): Promise<void> => {
  if (!url) return;
  try {
    await deleteFile(url);
  } catch (error) {
    console.warn(`[StationsSettings] ${context} cleanup failed`, error);
  }
};

const FieldRoot: React.FC<{
  ctx: CustomRenderCtx;
  children: React.ReactNode;
}> = ({ ctx, children }) => (
  <div
    id={ctx.id}
    role="group"
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="flex flex-col gap-4"
  >
    {children}
  </div>
);

export const StationsListField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { updateWidget, addToast, rosters, activeRosterId } = useDashboard();
  const { showConfirm } = useDialog();
  const { savedWidgetPresets } = useAuth();
  const { deleteFile } = useStorage();
  const [useGroupNamesAsTitles, setUseGroupNamesAsTitles] = useState(false);
  const config = configFor(ctx);
  const stations = useMemo(
    () => [...(config.stations ?? [])].sort((a, b) => a.order - b.order),
    [config.stations]
  );

  const persistStations = useCallback(
    (next: Station[]) => {
      updateWidget(ctx.widget.id, {
        config: {
          ...config,
          stations: next.map((station, index) => ({
            ...station,
            order: index,
          })),
        },
      });
    },
    [config, ctx.widget.id, updateWidget]
  );

  const protectedImageUrls = useMemo(() => {
    const urls = new Set<string>();
    const library =
      (savedWidgetPresets.stations as Partial<StationsConfig> | undefined)
        ?.savedLibrary ?? [];
    for (const preset of library) {
      for (const station of preset.stations) {
        if (station.imageUrl) urls.add(station.imageUrl);
      }
    }
    return urls;
  }, [savedWidgetPresets]);

  const handleAddStation = () => {
    const color =
      DEFAULT_STATION_COLORS[stations.length % DEFAULT_STATION_COLORS.length];
    persistStations([...stations, buildEmptyStation(stations.length, color)]);
  };

  const handleStationChange = (id: string, updates: Partial<Station>) => {
    persistStations(
      stations.map((station) =>
        station.id === id ? { ...station, ...updates } : station
      )
    );
  };

  const handleStationDelete = async (id: string) => {
    const station = stations.find((item) => item.id === id);
    if (!station) return;
    const hasMembers = Object.values(config.assignments ?? {}).some(
      (value) => value === id
    );
    if (hasMembers) {
      const ok = await showConfirm(translate(ctx, 'deleteStationBody'), {
        title: translate(ctx, 'deleteStationTitle'),
        confirmLabel: translate(ctx, 'delete'),
        variant: 'danger',
      });
      if (!ok) return;
    }
    const nextAssignments: Record<string, string | null> = {};
    for (const [studentId, value] of Object.entries(config.assignments ?? {})) {
      nextAssignments[studentId] = value === id ? null : value;
    }
    updateWidget(ctx.widget.id, {
      config: {
        ...config,
        stations: stations
          .filter((item) => item.id !== id)
          .map((item, index) => ({ ...item, order: index })),
        assignments: nextAssignments,
      },
    });
    if (station.imageUrl && !protectedImageUrls.has(station.imageUrl)) {
      void tryDeleteUrl(station.imageUrl, deleteFile, 'station-delete');
    }
  };

  const handleMove = (id: string, delta: number) => {
    const index = stations.findIndex((station) => station.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= stations.length) return;
    const next = [...stations];
    [next[index], next[target]] = [next[target], next[index]];
    persistStations(next);
  };

  const handleLoadPreset = (presetStations: Station[]) => {
    const nextStations = presetStations.map((station, index) => ({
      ...station,
      order: index,
    }));
    const outgoingUrls = stations
      .map((station) => station.imageUrl)
      .filter((url): url is string => Boolean(url));
    const incomingUrls = new Set(
      nextStations
        .map((station) => station.imageUrl)
        .filter((url): url is string => Boolean(url))
    );
    updateWidget(ctx.widget.id, {
      config: {
        ...config,
        stations: nextStations,
        assignments: {},
      },
    });
    for (const url of outgoingUrls) {
      if (incomingUrls.has(url) || protectedImageUrls.has(url)) continue;
      void tryDeleteUrl(url, deleteFile, 'preset-load');
    }
  };

  const rosterGroupsEnabled = useRosterGroupsGate();
  const activeRoster = useMemo(
    () =>
      config.rosterMode === 'custom'
        ? undefined
        : (rosters.find((roster) => roster.id === activeRosterId) ??
          rosters[0]),
    [activeRosterId, config.rosterMode, rosters]
  );
  const rosterGroups = activeRoster?.groups ?? [];
  const lockedGroupIds = Array.isArray(config.lockedRosterGroupIds)
    ? config.lockedRosterGroupIds
    : [];

  const toggleLockedGroup = (groupId: string) => {
    const next = lockedGroupIds.includes(groupId)
      ? lockedGroupIds.filter((id) => id !== groupId)
      : [...lockedGroupIds, groupId];
    updateWidget(ctx.widget.id, {
      config: { ...config, lockedRosterGroupIds: next },
    });
  };

  const handleImportGroupsAsStations = async () => {
    if (!activeRoster || rosterGroups.length === 0) return;
    if (stations.length > 0) {
      const ok = await showConfirm(
        translate(ctx, 'replaceStationsBody', {
          count: stations.length,
          groupCount: rosterGroups.length,
        }),
        {
          title: translate(ctx, 'replaceStationsTitle'),
          confirmLabel: translate(ctx, 'replace'),
          variant: 'danger',
        }
      );
      if (!ok) return;
    }
    const onRoster = new Set(
      activeRoster.students.map((student) => student.id)
    );
    const nextStations: Station[] = rosterGroups.map((group, index) => ({
      id: crypto.randomUUID(),
      title: useGroupNamesAsTitles
        ? group.name
        : translate(ctx, 'stationNumber', { number: index + 1 }),
      color: DEFAULT_STATION_COLORS[index % DEFAULT_STATION_COLORS.length],
      order: index,
    }));
    const assignments: Record<string, string | null> = {};
    rosterGroups.forEach((group, index) => {
      for (const studentId of group.studentIds) {
        if (onRoster.has(studentId))
          assignments[studentId] = nextStations[index].id;
      }
    });
    updateWidget(ctx.widget.id, {
      config: { ...config, stations: nextStations, assignments },
    });
    for (const station of stations) {
      if (station.imageUrl && !protectedImageUrls.has(station.imageUrl)) {
        void tryDeleteUrl(station.imageUrl, deleteFile, 'group-import');
      }
    }
    addToast(
      translate(ctx, 'createdFromGroups', { count: nextStations.length }),
      'success'
    );
  };

  return (
    <FieldRoot ctx={ctx}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xxs font-black uppercase tracking-widest text-slate-400">
            {translate(ctx, 'stationList')}
          </span>
          <button
            type="button"
            onClick={handleAddStation}
            className="flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xxs font-black uppercase tracking-widest text-white shadow-sm hover:bg-brand-blue-dark"
          >
            <Plus size={12} />
            {translate(ctx, 'addStation')}
          </button>
        </div>
        {stations.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-8 text-center">
            <LayoutGrid className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">
              {translate(ctx, 'noStations')}
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
                onDelete={() => void handleStationDelete(station.id)}
                onMoveUp={() => handleMove(station.id, -1)}
                onMoveDown={() => handleMove(station.id, 1)}
              />
            ))}
          </div>
        )}
      </div>

      {rosterGroupsEnabled && config.rosterMode !== 'custom' && (
        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center gap-2 text-xxs font-black uppercase tracking-widest text-slate-400">
            <Users className="h-3.5 w-3.5" />
            {translate(ctx, 'classGroups')}
          </div>
          {rosterGroups.length === 0 ? (
            <p className="text-xs text-slate-500">
              {translate(ctx, 'noGroups')}
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xxs font-bold uppercase tracking-widest text-slate-400">
                  {translate(ctx, 'keepTogether')}
                </p>
                <div className="flex flex-col gap-1">
                  {rosterGroups.map((group) => (
                    <label
                      key={group.id}
                      className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={lockedGroupIds.includes(group.id)}
                        onChange={() => toggleLockedGroup(group.id)}
                        className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                      />
                      <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{group.name}</span>
                      <span className="ml-auto text-xs tabular-nums text-slate-400">
                        {countRosterGroupMembers(activeRoster, group.id) ?? 0}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={useGroupNamesAsTitles}
                    onChange={(event) =>
                      setUseGroupNamesAsTitles(event.target.checked)
                    }
                    className="rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
                  />
                  <span>{translate(ctx, 'useGroupNamesAsTitles')}</span>
                </label>
                <button
                  type="button"
                  onClick={() => void handleImportGroupsAsStations()}
                  className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-bold text-brand-blue-primary transition-colors hover:border-brand-blue-primary hover:bg-brand-blue-lighter"
                >
                  {translate(ctx, 'makeFromGroups', {
                    count: rosterGroups.length,
                  })}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        <SavedPresetsPanel stations={stations} onLoad={handleLoadPreset} />
      </div>
    </FieldRoot>
  );
};

export const StationsSendToRandomField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { activeDashboard, updateWidget, addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const config = configFor(ctx);
  const stations = [...(config.stations ?? [])].sort(
    (a, b) => a.order - b.order
  );
  const randomizerWidget = activeDashboard?.widgets.find(
    (widget) => widget.type === 'random'
  );
  const t = (leaf: string, options?: Record<string, unknown>) =>
    translate(ctx, leaf, options);

  const handleSend = async () => {
    if (!randomizerWidget) {
      addToast(t('addRandomizerFirst'), 'info');
      return;
    }
    if (stations.length === 0) {
      addToast(t('addStationFirst'), 'info');
      return;
    }
    const titles = stations.map((station) =>
      station.title.trim()
        ? station.title.trim()
        : t('stationNumber', { number: station.order + 1 })
    );
    const randomConfig = randomizerWidget.config as RandomConfig;
    const willOverwriteCustom =
      (randomConfig.firstNames ?? '').trim().length > 0 ||
      (randomConfig.lastNames ?? '').trim().length > 0;
    const willSwitchMode = randomConfig.rosterMode !== 'custom';
    const messageParts = [
      t('sendToRandomConfirmBase', { count: titles.length }),
    ];
    if (willSwitchMode) messageParts.push(t('sendToRandomConfirmSwitch'));
    if (willOverwriteCustom)
      messageParts.push(t('sendToRandomConfirmOverwrite'));
    const ok = await showConfirm(messageParts.join(' '), {
      title: t('sendToRandomConfirmTitle'),
      confirmLabel: t('send'),
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
    addToast(t('sendToRandomSuccess'), 'success');
  };

  return (
    <FieldRoot ctx={ctx}>
      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={!randomizerWidget || stations.length === 0}
        aria-labelledby={ctx.labelId}
        aria-describedby={ctx.describedBy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xxs font-black uppercase tracking-widest text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send size={13} />
        {t('sendToRandom')}
      </button>
    </FieldRoot>
  );
};
