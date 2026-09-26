import React from 'react';
import { Music, Music2, Radio } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MusicConfig, MusicSource } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { useMusicStations } from '@/hooks/useMusicStations';
import { tourAttr } from '@/config/tourAnchors';
import { PersonalSpotifyPanel } from './PersonalSpotifyPanel';
import { buildSpotifyEmbedUrl } from './utils';
import { canUsePersonal } from './canUsePersonal';

const SOURCE_OPTIONS: ReadonlyArray<{
  value: MusicSource;
  label: 'curatedStations' | 'mySpotify';
  help: 'curatedStationsHelp' | 'mySpotifyHelp';
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'curated',
    label: 'curatedStations',
    help: 'curatedStationsHelp',
    icon: Radio,
  },
  {
    value: 'personal',
    label: 'mySpotify',
    help: 'mySpotifyHelp',
    icon: Music2,
  },
];

export const MusicSourceField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as MusicConfig;
  const selected = config.source ?? 'curated';
  const label = (leaf: string) => ctx.t(`widgetSettings.music.${leaf}`);

  const selectSource = (value: MusicSource) =>
    ctx.updateConfig({
      source: value,
      ...(value === 'personal' && config.syncWithTimeTool
        ? { syncWithTimeTool: false }
        : {}),
    });

  return (
    <div
      id={ctx.id}
      role="radiogroup"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      onKeyDown={(event) =>
        handleRadioGroupKeyDown(
          event,
          SOURCE_OPTIONS.map((option) => option.value),
          selectSource
        )
      }
      className="grid grid-cols-2 gap-2"
    >
      {SOURCE_OPTIONS.map((option) => {
        const active = selected === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={label(option.help)}
            onClick={() => selectSource(option.value)}
            className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all ${
              active
                ? 'border-green-500 bg-green-50 shadow-sm'
                : 'border-slate-100 bg-white hover:border-slate-300'
            }`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${active ? 'text-green-700' : 'text-slate-500'}`}
            />
            <span
              className={`truncate text-xs font-bold ${active ? 'text-green-800' : 'text-slate-700'}`}
            >
              {label(option.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const MusicStationField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as MusicConfig;
  const { stations, isLoading } = useMusicStations();
  const t = (leaf: string) => ctx.t(`widgetSettings.music.${leaf}`);

  if ((config.source ?? 'curated') === 'personal' && canUsePersonal(ctx)) {
    return (
      <div
        id={ctx.id}
        role="group"
        aria-labelledby={ctx.labelId}
        aria-describedby={ctx.describedBy}
      >
        <PersonalSpotifyPanel widget={ctx.widget} t={ctx.t} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <p
        id={ctx.id}
        aria-labelledby={ctx.labelId}
        className="text-xs text-slate-500"
      >
        {t('loadingStations')}
      </p>
    );
  }

  if (stations.length === 0) {
    return (
      <p
        id={ctx.id}
        aria-labelledby={ctx.labelId}
        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
      >
        {t('noStations')}
      </p>
    );
  }

  return (
    <div
      id={ctx.id}
      role="radiogroup"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      onKeyDown={(event) =>
        handleRadioGroupKeyDown(
          event,
          stations.map((station) => station.id),
          (stationId) => {
            const station = stations.find((item) => item.id === stationId);
            if (!station) return;
            ctx.updateConfig({
              stationId,
              ...(buildSpotifyEmbedUrl(station.url) !== null &&
              config.syncWithTimeTool
                ? { syncWithTimeTool: false }
                : {}),
            });
          }
        )
      }
      className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1"
    >
      {stations.map((station) => {
        const active = config.stationId === station.id;
        return (
          <button
            key={station.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={
              active || (!config.stationId && station === stations[0]) ? 0 : -1
            }
            onClick={() =>
              ctx.updateConfig({
                stationId: station.id,
                ...(buildSpotifyEmbedUrl(station.url) !== null &&
                config.syncWithTimeTool
                  ? { syncWithTimeTool: false }
                  : {}),
              })
            }
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-all ${
              active
                ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                : 'border-slate-100 bg-white hover:border-slate-300'
            }`}
          >
            {station.thumbnail ? (
              <div
                className="h-10 w-10 rounded-full bg-cover bg-center shadow-sm"
                style={{ backgroundImage: `url(${station.thumbnail})` }}
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <Music className="h-4 w-4 text-slate-400" />
              </div>
            )}
            <span className="block w-full truncate text-xxs font-bold text-slate-800">
              {station.title}
            </span>
            {station.genre && (
              <span className="block w-full truncate text-xxs font-normal text-slate-500">
                {station.genre}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const MusicSyncField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => {
  const config = ctx.config as unknown as MusicConfig;
  const { stations } = useMusicStations();
  const activeStation = stations.find(
    (station) => station.id === config.stationId
  );
  const spotifySource =
    config.source === 'personal' ||
    (activeStation?.url
      ? buildSpotifyEmbedUrl(activeStation.url) !== null
      : false);
  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-1.5 py-1"
    >
      <div className="flex justify-end">
        <Toggle
          checked={!!config.syncWithTimeTool}
          onChange={(checked) =>
            ctx.updateConfig({ syncWithTimeTool: checked })
          }
          disabled={spotifySource}
          size="sm"
          anchor={tourAttr(
            'widget-settings.music.sync-time-tool',
            ctx.widget.id,
            ctx.widget.type
          )}
        />
      </div>
      {spotifySource && (
        <p className="text-xxs text-slate-600">
          {ctx.t('widgetSettings.music.syncSpotifyHelp')}
        </p>
      )}
    </div>
  );
};
