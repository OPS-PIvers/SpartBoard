// PLC Home v2: a tile dashboard with one optional hero tile (docs/plans/PLC_HOME_V2.md).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react';
import type { Plc } from '@/types';
import type { PlcSectionId } from '@/components/plc/sections';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  usePlcActivity,
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcHomeLayout,
  usePlcMeetingsData,
} from '@/context/usePlcContext';
import { usePlcUnread } from '@/hooks/usePlcUnread';
import { logError } from '@/utils/logError';
import {
  saveHomeLayout,
  saveHomeSeenCounts,
} from '@/utils/plcHomeLayoutWrites';
import { HomeAvatarCluster } from './HomeAvatarCluster';
import { AddTileMenu, HomeCustomizeGrid } from './HomeCustomizeGrid';
import {
  currentScoredCounts,
  effectiveTiles,
  hasNewResults,
  resolveHero,
} from './tiles/homeLayout';
import { pickInProgressMeeting } from './tiles/meetingSelectors';
import { getPlcHomeTileDef } from './tiles/registry';
import type {
  PlcHomeSignals,
  PlcHomeTileContext,
  PlcHomeTileInstance,
} from './tiles/tileTypes';

interface PlcHomeV2Props {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

const QUIET_SIGNALS: PlcHomeSignals = {
  meetingInProgress: false,
  meetingDayActive: false,
  newResults: false,
};

export const PlcHomeV2: React.FC<PlcHomeV2Props> = ({ plc, onNavigate }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast } = useDashboard();
  const uid = user?.uid ?? null;
  const [now] = useState(() => Date.now());

  const activity = usePlcActivity();
  const { lastSeenAt, loading, markSeen } = usePlcUnread(plc.id, { activity });
  const { data: layout, loading: layoutLoading } = usePlcHomeLayout();
  const { data: aggregates, loading: aggregatesLoading } =
    usePlcAggregatesData();
  const { data: assessments, loading: assessmentsLoading } =
    usePlcAssessmentsData();
  const { data: meetings } = usePlcMeetingsData();

  // Freeze the activity cursor and seen counts as they were when Home opened, so this
  // visit's own writes don't clear "new since" or the Results hero mid-visit.
  const [frozenCursor, setFrozenCursor] = useState<number | null>(null);
  const [cursorFrozen, setCursorFrozen] = useState(false);
  const [frozenSeen, setFrozenSeen] = useState<Record<string, number> | null>(
    null
  );
  const [seenFrozen, setSeenFrozen] = useState(false);
  const [prevPlcId, setPrevPlcId] = useState(plc.id);
  if (plc.id !== prevPlcId) {
    setPrevPlcId(plc.id);
    setCursorFrozen(false);
    setFrozenCursor(null);
    setSeenFrozen(false);
    setFrozenSeen(null);
  }
  if (!cursorFrozen && !loading) {
    setCursorFrozen(true);
    setFrozenCursor(lastSeenAt);
  }
  if (!seenFrozen && !layoutLoading) {
    setSeenFrozen(true);
    setFrozenSeen(layout.seenCounts);
  }

  useEffect(() => {
    void markSeen();
  }, [markSeen]);

  const tiles = useMemo<PlcHomeTileInstance[]>(
    () =>
      effectiveTiles(layout).filter((tile) =>
        getPlcHomeTileDef(tile.kind)?.isAvailable(plc)
      ),
    [layout, plc]
  );

  const currentCounts = useMemo(() => {
    const live = new Set(
      assessments.filter((a) => a.deletedAt == null).map((a) => a.id)
    );
    return currentScoredCounts(aggregates, live);
  }, [aggregates, assessments]);

  // Record this visit's result counts once both slices have settled (D27).
  const seenWritten = useRef<string | null>(null);
  const countsReady =
    !layoutLoading && !aggregatesLoading && !assessmentsLoading;
  useEffect(() => {
    if (!uid || !countsReady || seenWritten.current === plc.id) return;
    seenWritten.current = plc.id;
    saveHomeSeenCounts(
      uid,
      plc.id,
      currentCounts,
      layout.exists ? null : { tiles: effectiveTiles(layout) }
    ).catch((err: unknown) => {
      logError('PlcHomeV2.saveSeenCounts', err, { plcId: plc.id });
    });
  }, [uid, plc.id, countsReady, currentCounts, layout]);

  const meetingInProgress = useMemo(
    () => pickInProgressMeeting(meetings) !== null,
    [meetings]
  );
  const [autoHeroDismissed, setAutoHeroDismissed] = useState(false);
  const signals = useMemo<PlcHomeSignals>(
    () =>
      autoHeroDismissed
        ? QUIET_SIGNALS
        : {
            meetingInProgress,
            meetingDayActive: false,
            newResults: hasNewResults(currentCounts, frozenSeen),
          },
    [autoHeroDismissed, meetingInProgress, currentCounts, frozenSeen]
  );

  const [draft, setDraft] = useState<PlcHomeTileInstance[] | null>(null);
  const customizing = draft !== null;

  const persist = (next: {
    tiles: PlcHomeTileInstance[];
    heroTileId: string | null;
  }) => {
    if (!uid) return;
    saveHomeLayout(uid, plc.id, next).catch((err: unknown) => {
      logError('PlcHomeV2.saveLayout', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.home.customize.saveFailed', {
          defaultValue: "Couldn't save your Home layout.",
        }),
        'error'
      );
    });
  };

  const finishCustomize = () => {
    if (!draft) return;
    const heroTileId =
      layout.heroTileId && draft.some((tile) => tile.id === layout.heroTileId)
        ? layout.heroTileId
        : null;
    persist({ tiles: draft, heroTileId });
    setDraft(null);
  };

  const heroId = customizing
    ? null
    : resolveHero({ tiles, heroTileId: layout.heroTileId, signals });
  const heroTile = tiles.find((tile) => tile.id === heroId) ?? null;
  const gridTiles = tiles.filter((tile) => tile.id !== heroId);

  const toggleSpotlight = (tile: PlcHomeTileInstance, isHero: boolean) => {
    if (isHero) {
      setAutoHeroDismissed(true);
      if (layout.heroTileId !== null) persist({ tiles, heroTileId: null });
      return;
    }
    persist({ tiles, heroTileId: tile.id });
  };

  const ctx: PlcHomeTileContext = {
    plc,
    uid,
    now,
    onNavigate,
    lastSeenAt: frozenCursor,
    signals,
  };

  const renderTile = (tile: PlcHomeTileInstance, hero: boolean) => {
    const def = getPlcHomeTileDef(tile.kind);
    if (!def) return null;
    const { Component } = def;
    const label = t(def.labelKey, { defaultValue: def.labelDefault });
    const spotlight = (
      <button
        type="button"
        onClick={() => toggleSpotlight(tile, hero)}
        aria-label={
          hero
            ? t('plcDashboard.home.unspotlight', {
                label,
                defaultValue: 'Unspotlight {{label}}',
              })
            : t('plcDashboard.home.spotlight', {
                label,
                defaultValue: 'Spotlight {{label}}',
              })
        }
        title={
          hero
            ? t('plcDashboard.home.unspotlightShort', {
                defaultValue: 'Unspotlight',
              })
            : t('plcDashboard.home.spotlightShort', {
                defaultValue: 'Spotlight',
              })
        }
        className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {hero ? (
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    );
    return <Component tile={tile} ctx={ctx} hero={hero} controls={spotlight} />;
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white/50 px-6 py-4 backdrop-blur-sm">
        <h2 className="min-w-0 truncate text-xl font-bold text-slate-900">
          {plc.name}
        </h2>
        <div className="flex shrink-0 items-center gap-3">
          <HomeAvatarCluster onOpenMembers={() => onNavigate('members')} />
          {customizing ? (
            <>
              <AddTileMenu
                plc={plc}
                tiles={draft}
                onAdd={(tile) => setDraft([...draft, tile])}
              />
              <button
                type="button"
                onClick={finishCustomize}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t('plcDashboard.home.customize.done', {
                  defaultValue: 'Done',
                })}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setDraft(tiles)}
              disabled={layoutLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 disabled:opacity-50"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t('plcDashboard.home.customize.open', {
                defaultValue: 'Customize',
              })}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6">
        {customizing ? (
          <HomeCustomizeGrid tiles={draft} onChange={setDraft} />
        ) : layoutLoading ? null : tiles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 py-12 text-center">
            <p className="text-sm text-slate-500">
              {t('plcDashboard.home.customize.emptyHome', {
                defaultValue: 'Your Home has no tiles.',
              })}
            </p>
            <button
              type="button"
              onClick={() => setDraft([])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t('plcDashboard.home.customize.addTiles', {
                defaultValue: 'Customize to add tiles',
              })}
            </button>
          </div>
        ) : (
          <>
            {heroTile && <div>{renderTile(heroTile, true)}</div>}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {gridTiles.map((tile) => (
                <div key={tile.id}>{renderTile(tile, false)}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
