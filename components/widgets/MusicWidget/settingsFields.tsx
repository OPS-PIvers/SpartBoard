import React, { useLayoutEffect, useRef, useState } from 'react';
import { Check, Music, Music2, Radio, X } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MusicConfig, MusicSource, MySong } from '@/types';
import { Toggle } from '@/components/common/Toggle';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { useMusicStations } from '@/hooks/useMusicStations';
import { useMySongs } from '@/hooks/useMySongs';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { PersonalSpotifyPanel } from './PersonalSpotifyPanel';
import { buildSpotifyEmbedUrl } from './utils';
import { canUsePersonal } from './canUsePersonal';
import { MySongsFooter } from './MySongsSection';
import { resolveActiveStation, toConfigSong } from './mySongs';

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
      {SOURCE_OPTIONS.map((option, optionIndex) => {
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
            {...tourFieldAttr(
              'widget-settings.music.source',
              ctx.widget.type,
              `row-${optionIndex + 1}`
            )}
            data-tour-widget={ctx.widget.id}
            className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all ${
              active
                ? 'border-green-500 bg-green-50 shadow-xs'
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

type StationRow = {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string;
  select: () => void;
  song?: MySong;
};

export const MusicStationField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const config = ctx.config as unknown as MusicConfig;
  const { stations, isLoading } = useMusicStations();
  const t = (leaf: string) => ctx.t(`widgetSettings.music.${leaf}`);
  const mySongsOn = ctx.canAccessFeature('music-my-songs');
  const { songs, addSong, removeSong } = useMySongs(mySongsOn);
  const [songError, setSongError] = useState<string | null>(null);
  const stationIdRef = useRef(config.stationId);
  useLayoutEffect(() => {
    stationIdRef.current = config.stationId;
  });

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

  const selectSong = (song: MySong) =>
    ctx.updateConfig({ stationId: song.id, mySong: toConfigSong(song) });

  const removeMySong = (song: MySong) =>
    void removeSong(song.id)
      .then(() => {
        // Clear the pick only if it is still the removed song.
        if (stationIdRef.current === song.id) {
          ctx.updateConfig({ stationId: '', mySong: null });
        }
      })
      .catch((err: unknown) => {
        console.error('[MusicStationField] Remove failed', err);
        setSongError(t('mySongsRemoveError'));
      });

  const clearMySong = config.mySong ? { mySong: null } : {};
  const rows: StationRow[] = [
    ...stations.map((station) => ({
      id: station.id,
      title: station.title,
      subtitle: station.genre ?? '',
      thumbnail: station.thumbnail ?? '',
      select: () =>
        ctx.updateConfig({
          stationId: station.id,
          ...clearMySong,
          ...(buildSpotifyEmbedUrl(station.url) !== null &&
          config.syncWithTimeTool
            ? { syncWithTimeTool: false }
            : {}),
        }),
    })),
    ...(mySongsOn ? songs : []).map((song) => ({
      id: song.id,
      title: song.title,
      subtitle: song.channel,
      thumbnail: song.thumbnail,
      select: () => selectSong(song),
      song,
    })),
  ];

  const footer = mySongsOn ? (
    <MySongsFooter
      ctx={ctx}
      songs={songs}
      addSong={addSong}
      selectSong={selectSong}
      error={songError}
      setError={setSongError}
    />
  ) : null;

  if (rows.length === 0) {
    const empty = (
      <p
        id={ctx.id}
        aria-labelledby={ctx.labelId}
        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
      >
        {t('noStations')}
      </p>
    );
    return footer ? (
      <div>
        {empty}
        {footer}
      </div>
    ) : (
      empty
    );
  }

  const anyActive = rows.some((row) => row.id === config.stationId);
  let songIndex = 0;

  const list = (
    <div
      id={ctx.id}
      role="radiogroup"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      onKeyDown={(event) =>
        handleRadioGroupKeyDown(
          event,
          rows.map((row) => row.id),
          (id) => rows.find((row) => row.id === id)?.select()
        )
      }
      className="-mx-4 divide-y divide-slate-100 border-t border-slate-100"
    >
      {rows.map((row, rowIndex) => {
        const active = config.stationId === row.id;
        const anchor = row.song
          ? tourFieldAttr(
              'widget-settings.music.my-song',
              ctx.widget.type,
              `row-${++songIndex}`
            )
          : tourFieldAttr(
              'widget-settings.music.station',
              ctx.widget.type,
              `row-${rowIndex + 1}`
            );
        const song = row.song;
        return (
          <div
            key={row.id}
            className={`flex items-center transition-colors ${
              active ? 'bg-slate-100' : 'hover:bg-slate-50'
            }`}
          >
            <button
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (!anyActive && rowIndex === 0) ? 0 : -1}
              onClick={row.select}
              {...anchor}
              data-tour-widget={ctx.widget.id}
              className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-4 pr-2 text-left"
            >
              {row.thumbnail ? (
                <div
                  className="h-9 w-9 shrink-0 rounded-md bg-slate-100 bg-cover bg-center"
                  style={{ backgroundImage: `url(${row.thumbnail})` }}
                />
              ) : (
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? 'bg-white' : 'bg-slate-100'}`}
                >
                  <Music
                    className="h-4 w-4 text-slate-400"
                    aria-hidden="true"
                  />
                </div>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`truncate text-xs text-slate-800 ${active ? 'font-bold' : 'font-semibold'}`}
                  title={row.title}
                >
                  {row.title}
                </span>
                {row.subtitle && (
                  <span className="truncate text-xxs text-slate-500">
                    {row.subtitle}
                  </span>
                )}
              </span>
              {active && (
                <Check
                  className="h-4 w-4 shrink-0 text-brand-blue-primary"
                  aria-hidden="true"
                />
              )}
            </button>
            {song && (
              <button
                type="button"
                aria-label={`${t('mySongsRemove')}: ${song.title}`}
                title={t('mySongsRemove')}
                onClick={() => removeMySong(song)}
                {...tourFieldAttr(
                  'widget-settings.music.my-song-remove',
                  ctx.widget.type,
                  `row-${songIndex}`
                )}
                data-tour-widget={ctx.widget.id}
                className="touch-target-expand mr-3 shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  return footer ? (
    <div>
      {list}
      {footer}
    </div>
  ) : (
    list
  );
};

export const MusicSyncField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => {
  const config = ctx.config as unknown as MusicConfig;
  const { stations } = useMusicStations();
  const activeStation = resolveActiveStation(stations, config);
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
